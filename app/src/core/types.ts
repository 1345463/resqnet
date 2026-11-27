export type Role = 'phone' | 'relay' | 'drone' | 'car' | 'command';

export type RadioMode = 'lora' | 'halow' | 'ble';

export type Channel = 'public' | 'team';

export type MsgType = 'SOS' | 'TEXT' | 'POS' | 'VOICE_CHUNK' | 'ACK';

export type ScenarioKey = 'urban' | 'mountain' | 'disaster';

export interface Vec {
  x: number;
  y: number;
}

export interface SimNode extends Vec {
  id: string;
  name: string;
  role: Role;
  txPower: number;
  battery: number;
  online: boolean;
  mobile: boolean;
  altitude: number;
  load: number;
  heading: number;
  trail: Vec[];
  lastSeen: number;
}

export interface Link {
  a: string;
  b: string;
  snr: number;
  cost: number;
  distance: number;
}

export interface Packet {
  id: string;
  type: MsgType;
  src: string;
  origin: string;
  dst: string;
  ttl: number;
  priority: number;
  born: number;
  hops: number;
  path: string[];
  text?: string;
  audioUrl?: string;
  chunkIndex?: number;
  chunkTotal?: number;
  voiceId?: string;
  sosId?: string;
  channel?: Channel;
  via?: 'mesh' | 'beidou';
  delivered: boolean;
  deliveredAt?: number;
  acked?: boolean;
  reach: number;
}

export interface InFlight {
  packet: Packet;
  from: string;
  to: string;
  progress: number;
  speed: number;
}

export type EventKind = 'send' | 'relay' | 'deliver' | 'ack' | 'warn' | 'info';

export interface FeedEvent {
  id: number;
  t: number;
  kind: EventKind;
  text: string;
  audioUrl?: string;
  node?: string;
}

export interface Metrics {
  sent: number;
  delivered: number;
  avgHops: number;
  avgLatency: number;
  receiverLoad: number;
  deliveryRate: number;
}

export interface VoiceJobView {
  id: string;
  srcName: string;
  total: number;
  done: number;
  startedAt: number;
}

export interface Snapshot {
  nodes: SimNode[];
  links: Link[];
  inFlight: InFlight[];
  events: FeedEvent[];
  metrics: Metrics;
  clock: number;
  scenario: ScenarioKey;
  selectedId: string | null;
  online: number;
  ackCount: number;
  showRelay: boolean;
  voices: VoiceJobView[];
  radio: RadioMode;
  positionEnabled: boolean;
  queued: number;
  beidouAcks: number;
}