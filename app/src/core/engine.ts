import type { Channel, EventKind, FeedEvent, InFlight, Link, Metrics, Packet, RadioMode, ScenarioKey, SimNode, Snapshot, VoiceJobView } from './types';
import { buildTerrain, distance, linkCost, LINK_THRESHOLD_DB, METERS_PER_UNIT, snrForLink } from './terrain';
import { clampWorld, createScenario } from './scenarios';

const MAX_EVENTS = 120;
const MAX_PACKETS = 320;
const MAX_INFLIGHT = 3600;

export class MeshEngine {
  terrain = buildTerrain('urban');
  nodes: SimNode[] = [];
  links: Link[] = [];
  inFlight: InFlight[] = [];
  packets: Packet[] = [];
  events: FeedEvent[] = [];
  clock = 0;
  scenario: ScenarioKey = 'urban';
  selectedId: string | null = null;
  showRelay = true;
  radio: RadioMode = 'lora';
  positionEnabled = true;
  private beidouAckCount = 0;
  private beidouJobs: { sosId: string; nodeId: string; deliverAt: number; ackAt: number; delivered: boolean; acked: boolean }[] = [];
  private offlineQueue = new Map<string, Packet[]>();

  private adjacency = new Map<string, Link[]>();
  private seen = new Map<string, Set<string>>();
  private deliveredIds = new Set<string>();
  private seq = 1;
  private eventSeq = 1;
  private linkTimer = 0;
  private posTimer = 0;
  private trailTimer = 0;
  private sosJobs: { sosId: string; nodeId: string; attempts: number; nextAt: number; acked: boolean }[] = [];
  private voiceJobs = new Map<string, { srcName: string; total: number; done: Set<number>; url: string; startedAt: number }>();
  private deliveredSos = new Set<string>();
  private prevRelay = new Map<string, string>();
  private lastRelayLog = new Map<string, number>();
  private tally = { sent: 0, delivered: 0, hops: 0, latency: 0, received: 0 };

  constructor(scenario: ScenarioKey = 'urban') {
    this.load(scenario);
  }

  load(scenario: ScenarioKey): void {
    this.scenario = scenario;
    const built = createScenario(scenario);
    this.terrain = built.terrain;
    this.nodes = built.nodes;
    this.seen = new Map();
    this.deliveredIds = new Set();
    this.inFlight = [];
    this.packets = [];
    this.events = [];
    this.clock = 0;
    this.seq = 1;
    this.eventSeq = 1;
    this.linkTimer = 0;
    this.posTimer = 0;
    this.trailTimer = 0;
    this.sosJobs = [];
    this.voiceJobs = new Map();
    this.deliveredSos = new Set();
    this.prevRelay = new Map();
    this.lastRelayLog = new Map();
    this.beidouJobs = [];
    this.beidouAckCount = 0;
    this.offlineQueue = new Map();
    this.tally = { sent: 0, delivered: 0, hops: 0, latency: 0, received: 0 };
    for (const node of this.nodes) {
      this.seen.set(node.id, new Set());
      node.lastSeen = 0;
    }
    this.rebuildLinks();
    this.selectedId = this.nodes.find((n) => n.role === 'phone')?.id ?? this.nodes[0]?.id ?? null;
    this.log('info', `场景已加载：${this.scenarioName()}，${this.nodes.length} 个节点，${this.links.length} 条可用链路`);
  }

  scenarioName(): string {
    return this.scenario === 'urban' ? '城区搜救' : this.scenario === 'mountain' ? '山地失联' : '震后灾区';
  }

  private node(id: string): SimNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  private nameOf(id: string): string {
    return this.node(id)?.name ?? '未知节点';
  }

  select(id: string | null): void {
    this.selectedId = id;
  }

  toggleShowRelay(): void {
    this.showRelay = !this.showRelay;
  }

  radioLabel(): string {
    return this.radio === 'halow' ? 'Wi-Fi HaLow（约 1 km，高带宽）' : this.radio === 'ble' ? 'BLE 近场（约 300 m，高带宽）' : 'LoRa 433MHz（1–3 km，低带宽）';
  }

  setRadio(radio: RadioMode): void {
    if (this.radio === radio) return;
    this.radio = radio;
    this.rebuildLinks();
    this.log('info', `链路模式切换：${this.radioLabel()}，当前可用链路 ${this.links.length} 条`);
  }

  setPositionEnabled(enabled: boolean): void {
    if (this.positionEnabled === enabled) return;
    this.positionEnabled = enabled;
    this.log('info', enabled ? '位置回传已开启' : '位置回传已暂停（省电模式）');
  }

  private linkThreshold(): number {
    if (this.radio === 'ble') return 10;
    if (this.radio === 'halow') return -6;
    return LINK_THRESHOLD_DB;
  }

  toggleNode(id: string): void {
    const node = this.node(id);
    if (!node) return;
    node.online = !node.online;
    this.log(node.online ? 'info' : 'warn', `${node.name} ${node.online ? '已重新入网' : '已断开（模拟设备故障）'}`);
    this.rebuildLinks();
  }

  tick(dt: number): void {
    const step = Math.min(Math.max(dt, 0), 0.1);
    this.clock += step;
    this.moveNodes(step);
    this.linkTimer += step;
    if (this.linkTimer >= 0.5) {
      this.linkTimer = 0;
      this.rebuildLinks();
    }
    this.posTimer += step;
    if (this.posTimer >= 7) {
      this.posTimer = 0;
      this.sendPositionBeacon();
    }
    this.updateInFlight(step);
    this.flushOfflineQueue();
    this.processBeidou();
    this.processSosJobs();
  }

  private moveNodes(dt: number): void {
    this.trailTimer += dt;
    const pushTrail = this.trailTimer >= 1.2;
    if (pushTrail) this.trailTimer = 0;
    for (const node of this.nodes) {
      if (!node.mobile || !node.online) continue;
      node.heading += (Math.random() - 0.5) * 1.6 * dt;
      const speed = node.role === 'car' ? 9 : node.role === 'drone' ? 6 : 3.4;
      node.x += Math.cos(node.heading) * speed * dt;
      node.y += Math.sin(node.heading) * speed * dt;
      clampWorld(node);
      if (pushTrail) {
        node.trail.push({ x: node.x, y: node.y });
        if (node.trail.length > 18) node.trail.shift();
      }
      node.battery = Math.max(0.06, node.battery - 0.0009 * dt);
    }
  }

  private rebuildLinks(): void {
    const links: Link[] = [];
    const adjacency = new Map<string, Link[]>();
    const online = this.nodes.filter((n) => n.online);
    const threshold = this.linkThreshold();
    for (const node of online) adjacency.set(node.id, []);
    for (let i = 0; i < online.length; i += 1) {
      for (let j = i + 1; j < online.length; j += 1) {
        const a = online[i];
        const b = online[j];
        const snr = snrForLink(a, b, this.terrain);
        if (snr < threshold) continue;
        const link: Link = { a: a.id, b: b.id, snr, cost: linkCost(snr), distance: distance(a, b) };
        links.push(link);
        adjacency.get(a.id)?.push(link);
        adjacency.get(b.id)?.push(link);
      }
    }
    this.links = links;
    this.adjacency = adjacency;

    if (this.clock > 2) {
      for (const node of this.nodes) {
        if (!node.online || node.role === 'phone') continue;
        const relay = this.relayFor(node.id);
        if (!relay) continue;
        const prev = this.prevRelay.get(node.id);
        if (prev && prev !== relay.id) {
          const last = this.lastRelayLog.get(node.id) ?? -999;
          if (this.clock - last > 8) {
            this.lastRelayLog.set(node.id, this.clock);
            this.log('info', `${node.name} 的主中继切换为 ${relay.name}（链路 ${relay.snr.toFixed(1)} dB）`);
          }
        }
        this.prevRelay.set(node.id, relay.id);
      }
    }
  }

  private updateInFlight(dt: number): void {
    const arrived: InFlight[] = [];
    const keep: InFlight[] = [];
    for (const flight of this.inFlight) {
      flight.progress += flight.speed * dt;
      if (flight.progress >= 1) arrived.push(flight);
      else keep.push(flight);
    }
    this.inFlight = keep;
    for (const flight of arrived) this.receive(flight.to, flight.packet, flight.from);
  }

  private receive(nodeId: string, packet: Packet, from: string): void {
    const node = this.node(nodeId);
    if (!node || !node.online) return;
    const seen = this.seen.get(nodeId);
    if (!seen || seen.has(packet.id)) return;
    seen.add(packet.id);
    packet.reach += 1;
    this.tally.received += 1;
    node.lastSeen = this.clock;

    if (packet.type === 'ACK') {
      if (nodeId === packet.dst) {
        packet.delivered = true;
        packet.deliveredAt = this.clock;
        this.markSosAcked(packet.sosId);
        this.log('ack', `${node.name} 收到指挥车回执，求救链路确认`);
      }
    } else if (!this.deliveredIds.has(packet.id) && (node.role === 'command' || node.id === packet.dst)) {
      this.deliver(packet, node);
    }

    if (packet.type === 'SOS' && packet.hops === 1 && packet.reach <= 3 && (node.role === 'relay' || node.role === 'drone')) {
      const link = this.adjacency.get(node.id)?.find((l) => l.a === from || l.b === from);
      const snr = link ? link.snr.toFixed(1) : '—';
      this.log('relay', `${node.name} 接手转发（链路 ${snr} dB），继续向指挥车扩散`);
    }

    if (packet.ttl <= 1) return;
    for (const link of this.adjacency.get(node.id) ?? []) {
      const other = link.a === node.id ? link.b : link.a;
      if (other === from) continue;
      this.enqueue(packet, node.id, other, link);
    }
  }

  private enqueue(packet: Packet, from: string, to: string, link: Link): void {
    if (this.inFlight.length >= MAX_INFLIGHT) return;
    const priorityFactor = packet.priority === 0 ? 1.9 : packet.priority >= 3 ? 0.75 : 1;
    const radioFactor = this.radio === 'halow' ? 2.2 : this.radio === 'ble' ? 3 : 1;
    const duration = Math.min(2.4, Math.max(0.12, (link.distance * METERS_PER_UNIT) / 1500)) / priorityFactor / radioFactor;
    this.inFlight.push({
      packet: { ...packet, ttl: packet.ttl - 1, hops: packet.hops + 1, path: [...packet.path, to] },
      from,
      to,
      progress: 0,
      speed: 1 / duration,
    });
  }

  private deliver(packet: Packet, node: SimNode): void {
    if (this.deliveredIds.has(packet.id)) return;
    this.deliveredIds.add(packet.id);
    packet.delivered = true;
    packet.deliveredAt = this.clock;
    const latency = this.clock - packet.born;

    if (packet.type === 'POS') return;

    if (packet.type === 'VOICE_CHUNK') {
      const job = packet.voiceId ? this.voiceJobs.get(packet.voiceId) : undefined;
      if (!job) return;
      if (packet.chunkIndex !== undefined) job.done.add(packet.chunkIndex);
      if (job.done.size === job.total) {
        this.tally.delivered += 1;
        this.tally.hops += packet.hops;
        this.tally.latency += latency;
        this.log('deliver', `语音消息送达指挥车 · ${packet.hops} 跳 · ${latency.toFixed(1)} s`, job.url);
        this.voiceJobs.delete(packet.voiceId!);
      }
      return;
    }

    if (packet.type === 'SOS' && packet.sosId) {
      if (this.deliveredSos.has(packet.sosId)) return;
      this.deliveredSos.add(packet.sosId);
    }

    this.tally.delivered += 1;
    this.tally.hops += packet.hops;
    this.tally.latency += latency;

    if (packet.type === 'SOS') {
      this.log('deliver', `SOS 送达指挥车：${this.nameOf(packet.origin)} · ${packet.hops} 跳 · ${latency.toFixed(1)} s`);
      const ack: Packet = {
        id: `p${this.seq++}`,
        type: 'ACK',
        src: node.id,
        origin: node.id,
        dst: packet.origin,
        ttl: 8,
        priority: 1,
        born: this.clock,
        hops: 0,
        path: [node.id],
        sosId: packet.sosId,
        delivered: false,
        reach: 0,
      };
      this.broadcast(ack, node, false);
    } else if (packet.type === 'TEXT') {
      this.log('deliver', `文字送达指挥车 · ${packet.hops} 跳 · ${latency.toFixed(1)} s：${packet.text ?? ''}`);
    }
  }

  private broadcast(packet: Packet, from: SimNode, count = true): void {
    const seen = this.seen.get(from.id);
    if (!seen) return;
    seen.add(packet.id);
    this.packets.push(packet);
    if (this.packets.length > MAX_PACKETS) this.packets.shift();
    if (count) this.tally.sent += 1;
    for (const link of this.adjacency.get(from.id) ?? []) {
      const other = link.a === from.id ? link.b : link.a;
      this.enqueue(packet, from.id, other, link);
    }
  }

  sendText(nodeId: string, text: string, channel: Channel = 'public'): void {
    const node = this.node(nodeId);
    if (!node || !node.online || !text.trim()) return;
    const packet: Packet = {
      id: `p${this.seq++}`,
      type: 'TEXT',
      src: node.id,
      origin: node.id,
      dst: '*',
      ttl: 8,
      priority: 2,
      born: this.clock,
      hops: 0,
      path: [node.id],
      text: text.trim().slice(0, 120),
      channel,
      delivered: false,
      reach: 0,
    };
    this.select(node.id);
    if ((this.adjacency.get(node.id)?.length ?? 0) === 0) {
      const queue = this.offlineQueue.get(node.id) ?? [];
      queue.push(packet);
      this.offlineQueue.set(node.id, queue);
      this.log('warn', `${node.name} 无可用链路，文字已存入离线队列（${queue.length} 条），链路恢复后补发`);
      return;
    }
    this.broadcast(packet, node);
    this.log('send', `${node.name} 发出${channel === 'team' ? '队伍加密（E2EE）' : '公共'}文字，等待多跳转发`);
  }

  sendSOS(nodeId: string): void {
    const node = this.node(nodeId);
    if (!node || !node.online) return;
    const sosId = `s${this.seq}`;
    this.pushSosPacket(node, sosId, 1);
    this.sosJobs.push({ sosId, nodeId, attempts: 1, nextAt: this.clock + 5, acked: false });
    this.tally.sent += 1;
    this.select(node.id);
    this.log('send', `${node.name} 发出 SOS：位置 (${node.x.toFixed(0)}, ${node.y.toFixed(0)})，电量 ${(node.battery * 100).toFixed(0)}%`);
  }

  private pushSosPacket(node: SimNode, sosId: string, attempt: number): void {
    const packet: Packet = {
      id: `p${this.seq++}`,
      type: 'SOS',
      src: node.id,
      origin: node.id,
      dst: '*',
      ttl: 8,
      priority: 0,
      born: this.clock,
      hops: 0,
      path: [node.id],
      sosId,
      text: `${node.name} · 第 ${attempt} 次求救`,
      delivered: false,
      reach: 0,
    };
    this.broadcast(packet, node, false);
  }

  private processSosJobs(): void {
    for (const job of this.sosJobs) {
      if (job.acked || job.attempts >= 3) continue;
      if (this.clock < job.nextAt) continue;
      const node = this.node(job.nodeId);
      if (!node || !node.online) continue;
      job.attempts += 1;
      job.nextAt = this.clock + 5;
      this.pushSosPacket(node, job.sosId, job.attempts);
      this.log('send', `${node.name} 第 ${job.attempts} 次重发 SOS（尚未收到回执）`);
    }
  }

  private markSosAcked(sosId?: string): void {
    if (!sosId) return;
    const job = this.sosJobs.find((j) => j.sosId === sosId && !j.acked);
    if (job) {
      job.acked = true;
      this.log('ack', `求救已被确认，${this.nameOf(job.nodeId)} 停止重发`);
    }
  }

  sendVoice(nodeId: string, url: string, duration: number, channel: Channel = 'public'): void {
    const node = this.node(nodeId);
    if (!node || !node.online) return;
    if ((this.adjacency.get(node.id)?.length ?? 0) === 0) {
      this.log('warn', `${node.name} 无可用链路，语音消息未发送（请等待链路恢复）`);
      return;
    }
    const voiceId = `v${this.seq++}`;
    const total = this.radio === 'halow'
      ? Math.max(2, Math.min(3, Math.ceil(duration / 1.2)))
      : this.radio === 'ble'
        ? 2
        : Math.max(2, Math.min(10, Math.ceil(duration / 0.4)));
    this.voiceJobs.set(voiceId, { srcName: node.name, total, done: new Set(), url, startedAt: this.clock });
    for (let i = 0; i < total; i += 1) {
      const packet: Packet = {
        id: `p${this.seq++}`,
        type: 'VOICE_CHUNK',
        src: node.id,
        origin: node.id,
        dst: '*',
        ttl: 6,
        priority: 2,
        born: this.clock,
        hops: 0,
        path: [node.id],
        channel,
        voiceId,
        chunkIndex: i,
        chunkTotal: total,
        delivered: false,
        reach: 0,
      };
      this.broadcast(packet, node, false);
    }
    this.tally.sent += 1;
    this.log('send', `${node.name} 发送语音消息 ${duration.toFixed(1)} s，拆成 ${total} 个分片排队转发`);
  }

  private sendPositionBeacon(): void {
    if (!this.positionEnabled) return;
    const candidates = this.nodes.filter((n) => n.online && n.mobile);
    if (candidates.length === 0) return;
    const node = candidates[Math.floor(Math.random() * candidates.length)];
    const packet: Packet = {
      id: `p${this.seq++}`,
      type: 'POS',
      src: node.id,
      origin: node.id,
      dst: '*',
      ttl: 3,
      priority: 4,
      born: this.clock,
      hops: 0,
      path: [node.id],
      delivered: false,
      reach: 0,
    };
    this.broadcast(packet, node, false);
  }

  sendBeidouSOS(nodeId: string): void {
    const node = this.node(nodeId);
    if (!node || !node.online) return;
    this.tally.sent += 1;
    this.beidouJobs.push({
      sosId: `b${this.seq++}`,
      nodeId,
      deliverAt: this.clock + 6,
      ackAt: this.clock + 9,
      delivered: false,
      acked: false,
    });
    this.select(node.id);
    this.log('send', `${node.name} 通过北斗三号短报文发出 SOS：卫星链路，与 Mesh 无关`);
  }

  private processBeidou(): void {
    for (const job of this.beidouJobs) {
      if (!job.delivered && this.clock >= job.deliverAt) {
        job.delivered = true;
        this.tally.delivered += 1;
        this.tally.hops += 1;
        this.tally.latency += 9;
        this.log('deliver', `北斗短报文已到达指挥中心：${this.nameOf(job.nodeId)} · 卫星 · 约 9 s`);
      }
      if (!job.acked && this.clock >= job.ackAt) {
        job.acked = true;
        this.beidouAckCount += 1;
        this.log('ack', '指挥中心已通过北斗回执确认收到');
      }
    }
  }

  nearfieldCall(nodeId: string): void {
    const node = this.node(nodeId);
    if (!node || !node.online) return;
    const near = this.nodes.filter((n) => n.id !== nodeId && n.online && distance(n, node) <= 15);
    if (near.length === 0) {
      this.log('warn', '近场实时语音：300 m 内没有可直连节点');
      return;
    }
    const names = near.slice(0, 3).map((n) => n.name).join('、');
    this.log('ack', `近场实时语音接通：${names}${near.length > 3 ? ' 等' : ''} · ${near.length} 个节点（BLE/WiFi 直连，不走 Mesh）`);
  }

  private flushOfflineQueue(): void {
    for (const [nodeId, packets] of [...this.offlineQueue.entries()]) {
      const node = this.node(nodeId);
      if (!node || !node.online) continue;
      if ((this.adjacency.get(nodeId)?.length ?? 0) === 0) continue;
      this.offlineQueue.delete(nodeId);
      for (const packet of packets) this.broadcast(packet, node);
      this.log('info', `链路恢复：${node.name} 补发 ${packets.length} 条离线消息`);
    }
  }

  queuedCount(): number {
    let total = 0;
    for (const list of this.offlineQueue.values()) total += list.length;
    return total;
  }

  private log(kind: EventKind, text: string, audioUrl?: string): void {
    this.events.push({ id: this.eventSeq++, t: this.clock, kind, text, audioUrl });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  relayFor(nodeId: string): {
    id: string;
    name: string;
    score: number;
    snr: number;
    parts: { snrNorm: number; cost: number; altNorm: number; battery: number; load: number };
  } | null {
    const links = this.adjacency.get(nodeId);
    if (!links || links.length === 0) return null;
    let best: {
      id: string;
      name: string;
      score: number;
      snr: number;
      parts: { snrNorm: number; cost: number; altNorm: number; battery: number; load: number };
    } | null = null;
    for (const link of links) {
      const otherId = link.a === nodeId ? link.b : link.a;
      const other = this.node(otherId);
      if (!other) continue;
      const snrNorm = Math.max(0, Math.min(1, (link.snr + LINK_THRESHOLD_DB) / 32));
      const altNorm = Math.min(1, other.altitude / 120);
      const score = snrNorm * 0.35 + (1 - Math.min(1, link.cost)) * 0.25 + altNorm * 0.15 + other.battery * 0.15 + (1 - other.load) * 0.1;
      if (!best || score > best.score) {
        best = {
          id: otherId,
          name: other.name,
          score,
          snr: link.snr,
          parts: { snrNorm, cost: link.cost, altNorm, battery: other.battery, load: other.load },
        };
      }
    }
    return best;
  }

  linksFor(nodeId: string): Link[] {
    return this.adjacency.get(nodeId) ?? [];
  }

  metrics(): Metrics {
    const sent = this.tally.sent;
    const delivered = this.tally.delivered;
    return {
      sent,
      delivered,
      avgHops: delivered ? this.tally.hops / delivered : 0,
      avgLatency: delivered ? this.tally.latency / delivered : 0,
      receiverLoad: this.clock > 0 ? this.tally.received / this.clock : 0,
      deliveryRate: sent ? Math.min(1, delivered / sent) : 0,
    };
  }

  getSnapshot(): Snapshot {
    const voices: VoiceJobView[] = [...this.voiceJobs.entries()].map(([id, job]) => ({
      id,
      srcName: job.srcName,
      total: job.total,
      done: job.done.size,
      startedAt: job.startedAt,
    }));
    return {
      nodes: this.nodes.map((n) => ({ ...n, trail: [] })),
      links: this.links,
      inFlight: this.inFlight,
      events: this.events.slice(-70).reverse(),
      metrics: this.metrics(),
      clock: this.clock,
      scenario: this.scenario,
      selectedId: this.selectedId,
      online: this.nodes.filter((n) => n.online).length,
      ackCount: this.sosJobs.filter((j) => j.acked).length,
      showRelay: this.showRelay,
      voices,
      radio: this.radio,
      positionEnabled: this.positionEnabled,
      queued: this.queuedCount(),
      beidouAcks: this.beidouAckCount,
      beidouPending: this.beidouJobs.filter((j) => !j.acked).length,
    };
  }
}