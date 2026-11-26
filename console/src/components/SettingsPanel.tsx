import { useState } from 'react';
import type { Role, Settings } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import type { GatewayStatus } from '../core/gateway';

interface Props {
  settings: Settings;
  gatewayStatus: GatewayStatus;
  gatewayName: string;
  gatewayError: string;
  serialSupported: boolean;
  serialConnected: boolean;
  onSerialConnect: () => void;
  onSerialDisconnect: () => void;
  onPatch: (patch: Partial<Settings>) => void;
  onDemo: () => void;
  onClear: () => void;
  onExport: () => string;
  onImport: (raw: string) => void;
  onAddNode: (name: string, role: Role, lat: number, lon: number, callsign?: string) => void;
}

const ROLES: { value: Role; label: string }[] = [
  { value: 'phone', label: '终端' },
  { value: 'relay', label: '中继' },
  { value: 'drone', label: '无人机' },
  { value: 'car', label: '救援车' },
  { value: 'command', label: '指挥车' },
  { value: 'gateway', label: '网关' },
];

export function SettingsPanel({ settings, gatewayStatus, gatewayName, gatewayError, serialSupported, serialConnected, onSerialConnect, onSerialDisconnect, onPatch, onDemo, onClear, onExport, onImport, onAddNode }: Props) {
  const [importText, setImportText] = useState('');
  const [name, setName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [role, setRole] = useState<Role>('phone');
  const [lat, setLat] = useState(String(settings.mapCenter[0]));
  const [lon, setLon] = useState(String(settings.mapCenter[1]));

  const statusText = gatewayStatus === 'online' ? `在线${gatewayName ? ` · ${gatewayName}` : ''}` : gatewayStatus === 'connecting' ? '连接中' : gatewayStatus === 'error' ? `异常：${gatewayError || '连接失败'}` : '未启用';

  return (
    <section className="panel settings-panel">
      <header className="panel-head">
        <h2>设置</h2>
        <span className={`gateway-status status-${gatewayStatus}`}>网关：{statusText}</span>
      </header>

      <div className="form-grid">
        <label>数据源
          <select value={settings.source} onChange={(e) => onPatch({ source: e.target.value as Settings['source'] })}>
            <option value="ws">WebSocket 网关</option>
            <option value="serial">USB 串口（LoRa 模块）</option>
          </select>
        </label>
      </div>

      {settings.source === 'ws' ? (
        <div className="form-grid">
          <label>网关 WebSocket 地址
            <input value={settings.gatewayUrl} placeholder="ws://192.168.4.1:81/" onChange={(e) => onPatch({ gatewayUrl: e.target.value })} />
          </label>
          <label>接入令牌
            <input value={settings.token} placeholder="可选，网关校验用" onChange={(e) => onPatch({ token: e.target.value })} />
          </label>
          <label>频道
            <input value={settings.channel} onChange={(e) => onPatch({ channel: e.target.value })} />
          </label>
        </div>
      ) : (
        <div className="serial-block">
          <div className="form-grid">
            <label>波特率
              <input type="number" value={settings.serialBaud} onChange={(e) => onPatch({ serialBaud: Number(e.target.value) })} />
            </label>
            <label>状态
              <input value={serialConnected ? '已连接' : serialSupported ? '可连接' : '当前环境不支持'} readOnly />
            </label>
          </div>
          <div className="settings-actions">
            <button type="button" onClick={onSerialConnect} disabled={!serialSupported || serialConnected}>连接串口</button>
            <button type="button" onClick={onSerialDisconnect} disabled={!serialConnected}>断开</button>
          </div>
          <p className="muted">
            需要 Chrome/Edge 或桌面端；连接时会在弹窗里选择串口设备（CP210x/CH340/ESP32 USB）。
          </p>
        </div>
      )}

      <label className="switch-row">
        <input type="checkbox" checked={settings.emergencyMode} onChange={(e) => onPatch({ emergencyMode: e.target.checked })} />
        <span>应急模式（临时设台/频率调整）</span>
      </label>
      {settings.emergencyMode && (
        <div className="emergency-fields">
          <p className="legal-note">
            依据《无线电管理条例》第三十七条，紧急情况下可不经批准临时设台，但须及时向属地无线电管理机构报告，紧急情况解除后及时关闭。请如实填写报备信息。
          </p>
          <div className="form-grid">
            <label>呼号
              <input value={settings.callsign} placeholder="如 BG8XXX" onChange={(e) => onPatch({ callsign: e.target.value })} />
            </label>
            <label>授权/报备编号
              <input value={settings.authorizationRef} placeholder="属地无管机构回执编号" onChange={(e) => onPatch({ authorizationRef: e.target.value })} />
            </label>
            <label>报备机构
              <input value={settings.agency} placeholder="如 XX 市无线电管理处" onChange={(e) => onPatch({ agency: e.target.value })} />
            </label>
            <label>使用频段
              <input value={settings.bands} onChange={(e) => onPatch({ bands: e.target.value })} />
            </label>
            <label>发射功率 (W)
              <input type="number" min={0.1} step={0.1} value={settings.powerW} onChange={(e) => onPatch({ powerW: Number(e.target.value) })} />
            </label>
            <label>报备时间
              <input value={settings.reportedAt} placeholder="YYYY-MM-DD HH:mm" onChange={(e) => onPatch({ reportedAt: e.target.value })} />
            </label>
          </div>
        </div>
      )}

      <div className="settings-actions">
        <button type="button" onClick={onDemo}>加载演示数据</button>
        <button type="button" onClick={() => onPatch({ mapCenter: DEFAULT_SETTINGS.mapCenter, mapZoom: DEFAULT_SETTINGS.mapZoom })}>重置地图</button>
        <button type="button" className="danger-text" onClick={onClear}>清空台账</button>
      </div>

      <h3>新增节点（无网关时手工录入）</h3>
      <div className="form-grid">
        <label>名称<input value={name} onChange={(e) => setName(e.target.value)} placeholder="队员-01" /></label>
        <label>呼号<input value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="可选" /></label>
        <label>角色
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label>纬度<input value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label>经度<input value={lon} onChange={(e) => setLon(e.target.value)} /></label>
      </div>
      <button
        type="button"
        className="primary"
        disabled={!name.trim() || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))}
        onClick={() => {
          onAddNode(name.trim(), role, Number(lat), Number(lon), callsign.trim() || undefined);
          setName('');
          setCallsign('');
        }}
      >
        添加节点
      </button>

      <h3>网关接入协议</h3>
      <details className="protocol-help">
        <summary>查看 WebSocket 消息格式</summary>
        <pre>{`连接：ws://<网关IP>:<端口>/mesh
鉴权：{"type":"auth","token":"...","channel":"cmd"}

上行（网关→管理端）
{"type":"hello","gateway":"halow-01"}
{"type":"position","nodeId":"u1","name":"队员-01","callsign":"BG8XXX",
 "role":"phone","lat":30.66,"lon":104.06,"battery":0.8,"ts":1732580000000}
{"type":"text","nodeId":"u1","text":"两人受困","ts":1732580000000}
{"type":"sos","nodeId":"u1","name":"队员-01","lat":30.66,"lon":104.06,
 "note":"需要担架","level":3}
{"type":"offline","nodeId":"u1"}

下行（管理端→网关）
{"type":"command","id":"out...","to":"u1","text":"救援车已出发",
 "channel":"cmd","ts":1732580000000}`}</pre>
      </details>

      <h3>数据</h3>
      <div className="settings-actions">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(onExport());
          }}
        >
          导出 JSON（复制）
        </button>
      </div>
      <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="粘贴导出的 JSON 后点导入" rows={3} />
      <button type="button" disabled={!importText.trim()} onClick={() => onImport(importText)}>导入 JSON</button>
    </section>
  );
}