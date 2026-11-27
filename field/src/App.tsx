import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { FieldMap } from './components/FieldMap';
import { useBle } from './core/ble';
import type { FieldMessage, LinkState, Peer, SelfPosition } from './core/types';

const DEFAULT_POS: SelfPosition = { lat: 30.6598, lon: 104.0633, accuracy: 50, updatedAt: 0 };

let msgSeq = 1;
const nextId = () => `m${Date.now().toString(36)}${msgSeq++}`;
const makeMessage = (
  direction: FieldMessage['direction'],
  text: string,
  status: FieldMessage['status'] = 'received'
): FieldMessage => ({ id: nextId(), direction, text, ts: Date.now(), status });

export default function App() {
  const [self, setSelf] = useState<SelfPosition>(DEFAULT_POS);
  const [located, setLocated] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<FieldMessage[]>([]);
  const [linkState, setLinkState] = useState<LinkState>('idle');
  const [linkDetail, setLinkDetail] = useState('');
  const [sim, setSim] = useState(false);
  const [tracking, setTracking] = useState(true);
  const [text, setText] = useState('');
  const [name, setName] = useState(() => localStorage.getItem('resqnet.field.name') ?? '队员-01');
  const [toast, setToast] = useState('');
  const simTimerRef = useRef(0);
  const selfRef = useRef(self);
  selfRef.current = self;
  const nameRef = useRef(name);
  nameRef.current = name;

  const pushLog = useCallback((textValue: string) => {
    setMessages((prev) => [makeMessage('in', textValue), ...prev].slice(0, 60));
  }, []);

  const upsertPeer = useCallback((peer: Peer) => {
    setPeers((prev) => {
      const index = prev.findIndex((p) => p.id === peer.id);
      const next = [...prev];
      if (index >= 0) next[index] = { ...next[index], ...peer };
      else next.push(peer);
      return next;
    });
  }, []);

  const onState = useCallback((state: LinkState, detail?: string) => {
    setLinkState(state);
    setLinkDetail(detail ?? '');
    if (state === 'connected') pushLog('蓝牙网关已连接');
    if (state === 'error' && detail) pushLog(`连接失败：${detail}`);
  }, [pushLog]);

  const handleLine = useCallback((line: string) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (data.type === 'hello') {
      pushLog(`网关 ${String(data.gateway ?? '')} 在线`);
      return;
    }
    if (data.type === 'ack') {
      setMessages((prev) => prev.map((m) => (m.status === 'sent' ? { ...m, status: 'acked' } : m)));
      pushLog('指挥端已回执');
      return;
    }
    if (!data.v) return;
    const kind = String(data.k ?? '');
    const from = String(data.f ?? '');
    const peerName = String(data.n ?? from);
    const lat = Number(data.x ?? 0);
    const lon = Number(data.y ?? 0);
    if (kind === 'p') {
      upsertPeer({
        id: from,
        name: peerName,
        role: String(data.r ?? 'phone'),
        lat,
        lon,
        battery: Number(data.b ?? 100) / 100,
        lastSeen: Date.now(),
        sos: false,
      });
    } else if (kind === 't') {
      upsertPeer({ id: from, name: peerName, role: 'phone', lat, lon, battery: 0.8, lastSeen: Date.now() });
      setMessages((prev) => [makeMessage('in', `${peerName}：${String(data.m ?? '')}`), ...prev].slice(0, 60));
    } else if (kind === 's') {
      upsertPeer({ id: from, name: peerName, role: 'phone', lat, lon, battery: 0.5, lastSeen: Date.now(), sos: true });
      setMessages((prev) => [makeMessage('in', `SOS · ${peerName}：${String(data.m ?? '一键求救')}`), ...prev].slice(0, 60));
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [pushLog, upsertPeer]);

  const ble = useBle(handleLine, onState);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let watchId: string | undefined;
      let cancelled = false;
      void (async () => {
        try {
          await Geolocation.requestPermissions();
          watchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (position, error) => {
            if (cancelled) return;
            if (position) {
              setSelf({
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                accuracy: position.coords.accuracy,
                updatedAt: Date.now(),
              });
              setLocated(true);
              setGeoError('');
            } else if (error) {
              setGeoError('定位失败，使用示例位置');
            }
          });
        } catch {
          setGeoError('定位权限未开启，使用示例位置');
        }
      })();
      return () => {
        cancelled = true;
        if (watchId) void Geolocation.clearWatch({ id: watchId });
      };
    }
    if (!navigator.geolocation) {
      setGeoError('设备不支持定位，使用示例位置');
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        setSelf({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          updatedAt: Date.now(),
        });
        setLocated(true);
        setGeoError('');
      },
      (error) => setGeoError(error.code === 1 ? '定位权限未开启，使用示例位置' : '定位失败，使用示例位置'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!tracking) return;
      const current = selfRef.current;
      if (linkState === 'connected') {
        void ble.send({ k: 'p', n: nameRef.current, x: current.lat, y: current.lon, b: 100 });
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [ble, linkState, tracking]);

  const sendSOS = async () => {
    if (linkState === 'connected') {
      const ok = await ble.send({ k: 's', n: name, x: self.lat, y: self.lon, m: '一键求救' });
      if (!ok) {
        setToast('发送失败，请检查网关');
        return;
      }
    } else if (sim) {
      window.setTimeout(() => {
        setMessages((prev) => prev.map((m) => (m.status === 'sent' ? { ...m, status: 'acked' } : m)));
        pushLog('指挥端已回执（演示）');
      }, 2000);
    } else {
      setToast('未连接网关，可先用演示模式');
      return;
    }
    setMessages((prev) => [makeMessage('out', 'SOS 一键求救', 'sent'), ...prev].slice(0, 60));
    navigator.vibrate?.([300, 120, 300]);
    setToast('SOS 已发出');
    window.setTimeout(() => setToast(''), 2500);
  };

  const sendText = async () => {
    const value = text.trim();
    if (!value) return;
    if (linkState === 'connected') {
      const ok = await ble.send({ k: 't', n: name, m: value });
      if (!ok) {
        setToast('发送失败');
        return;
      }
    } else if (!sim) {
      setToast('未连接网关，可先用演示模式');
      return;
    }
    setMessages((prev) => [makeMessage('out', value, 'sent'), ...prev].slice(0, 60));
    setText('');
  };

  const startSim = () => {
    setSim(true);
    setLinkState('sim');
    setLinkDetail('演示模式：不依赖硬件');
    const base = selfRef.current;
    const seed: Peer[] = [
      { id: 'u1', name: '队员-02', role: 'phone', lat: base.lat + 0.002, lon: base.lon + 0.001, battery: 0.7, lastSeen: Date.now() },
      { id: 'r1', name: '中继-山顶', role: 'relay', lat: base.lat + 0.004, lon: base.lon - 0.002, battery: 0.9, lastSeen: Date.now() },
      { id: 'd1', name: '无人机-01', role: 'drone', lat: base.lat + 0.001, lon: base.lon + 0.004, battery: 0.6, lastSeen: Date.now() },
    ];
    setPeers(seed);
    pushLog('演示模式已开启：模拟 3 个节点');
    window.clearInterval(simTimerRef.current);
    simTimerRef.current = window.setInterval(() => {
      setPeers((prev) => prev.map((p) => ({
        ...p,
        lat: p.lat + (Math.random() - 0.5) * 0.0004,
        lon: p.lon + (Math.random() - 0.5) * 0.0004,
        lastSeen: Date.now(),
      })));
    }, 3000);
    window.setTimeout(() => {
      setMessages((prev) => [makeMessage('in', '队员-02：已到达东岸，正在搜寻'), ...prev].slice(0, 60));
    }, 6000);
  };

  const stopSim = () => {
    setSim(false);
    setLinkState('idle');
    setPeers([]);
    window.clearInterval(simTimerRef.current);
    pushLog('演示模式已关闭');
  };

  const updateName = (value: string) => {
    setName(value);
    localStorage.setItem('resqnet.field.name', value);
  };

  const statusText = linkState === 'connected'
    ? `蓝牙已连接${ble.deviceName ? ` · ${ble.deviceName}` : ''}`
    : linkState === 'sim'
      ? '演示模式'
      : linkState === 'connecting'
        ? '连接中…'
        : linkState === 'error'
          ? `连接失败${linkDetail ? `：${linkDetail}` : ''}`
          : '未连接';

  return (
    <div className="field-app">
      <header className="field-header">
        <div>
          <h1>应急通 · 现场端</h1>
          <p>SOS / 位置 / 文字 · 断网可用</p>
        </div>
        <span className={`field-status status-${linkState}`}>{statusText}</span>
      </header>

      <main className="field-main">
        <FieldMap self={self} peers={peers} />

        <section className="field-actions">
          <button type="button" className="sos" onClick={() => void sendSOS()}>
            SOS 求救
          </button>
          <div className="field-row">
            <input value={text} placeholder="输入文字，发给指挥端" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void sendText()} />
            <button type="button" onClick={() => void sendText()}>发送</button>
          </div>
          <div className="field-row">
            {!sim && (
              <button type="button" disabled={!ble.supported || linkState === 'connected'} onClick={() => void ble.connect()}>
                连接蓝牙网关
              </button>
            )}
            {sim ? (
              <button type="button" onClick={stopSim}>退出演示</button>
            ) : (
              <button type="button" onClick={startSim}>演示模式</button>
            )}
          </div>
          {!ble.supported && <p className="field-hint">当前浏览器不支持 Web Bluetooth（iOS 请用演示模式）</p>}
          {geoError && <p className="field-hint">{geoError}</p>}
          {toast && <p className="field-toast">{toast}</p>}
        </section>

        <section className="field-settings">
          <label>
            名称
            <input value={name} onChange={(e) => updateName(e.target.value)} />
          </label>
          <label className="inline">
            <input type="checkbox" checked={tracking} onChange={(e) => setTracking(e.target.checked)} />
            位置回传（10 秒）
          </label>
          <span className="field-pos">
            {located ? `定位 ±${Math.round(self.accuracy)} m` : '示例位置'} · {self.lat.toFixed(4)}, {self.lon.toFixed(4)}
          </span>
          {!Capacitor.isNativePlatform() && (
            <a className="apk-link" href="/download/ResQNet-field.apk">
              下载 Android App（APK）
            </a>
          )}
        </section>

        <section className="field-log">
          <h2>动态</h2>
          <ul>
            {messages.map((message) => (
              <li key={message.id} className={message.direction}>
                <span className="time">{new Date(message.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                <span className="text">{message.text}</span>
                <span className="state">{message.status === 'acked' ? '已回执' : message.direction === 'out' ? '已发' : ''}</span>
              </li>
            ))}
            {messages.length === 0 && <li className="empty">连接网关或开启演示模式开始</li>}
          </ul>
        </section>
      </main>
    </div>
  );
}