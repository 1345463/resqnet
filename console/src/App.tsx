import { useEffect, useState } from 'react';
import { useConsoleStore } from './core/store';
import { useGateway, type GatewayStatus } from './core/gateway';
import { useSerial } from './core/serial';
import { MapView, type FocusTarget } from './components/MapView';
import { NodePanel } from './components/NodePanel';
import { IncidentPanel } from './components/IncidentPanel';
import { MessagePanel } from './components/MessagePanel';
import { SettingsPanel } from './components/SettingsPanel';
import type { Incident, ConsoleNode } from './core/types';

type Tab = 'incidents' | 'messages' | 'settings';

const GATEWAY_LABEL: Record<GatewayStatus, string> = {
  off: '链路未连接',
  connecting: '链路连接中',
  online: '链路在线',
  error: '链路异常',
};

export default function App() {
  const { state, actions } = useConsoleStore();
  const { settings, nodes, incidents, messages } = state;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [tab, setTab] = useState<Tab>('incidents');
  const [clock, setClock] = useState(() => new Date());

  const gateway = useGateway(
    settings,
    {
      onPosition: actions.upsertNode,
      onText: actions.ingestText,
      onSos: actions.ingestSos,
      onOffline: actions.setNodeOffline,
    },
    settings.source === 'ws'
  );

  const serial = useSerial(settings, {
    onPosition: actions.upsertNode,
    onText: actions.ingestText,
    onSos: actions.ingestSos,
    onOffline: actions.setNodeOffline,
  });

  const link = settings.source === 'serial' ? serial : gateway;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1' && nodes.length === 0) {
      actions.loadDemo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const focusNode = (node: ConsoleNode | Incident) => {
    setFocus({ lat: node.lat, lon: node.lon, zoom: 15, key: Date.now() });
    setSelectedId('nodeId' in node ? node.nodeId : node.id);
  };

  const sendTo = (to: string, text: string) => {
    const target = to === '*' ? null : nodes.find((n) => n.id === to) ?? null;
    const messageId = actions.createOutbound(to, target?.name ?? '全部节点', text);
    const ok = link.send({ type: 'command', id: messageId, to, text, channel: settings.channel, ts: Date.now() });
    actions.setMessageStatus(messageId, ok ? 'sent' : 'failed');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">RQ</span>
          <div>
            <h1>应急通 ResQNet · 管理端</h1>
            <p>真实台账 / 事件处置 / 网关接入</p>
          </div>
        </div>
        <div className="topbar-meta">
          <span className="pill">{clock.toLocaleTimeString('zh-CN', { hour12: false })}</span>
          <span className={`pill status-${link.status}`}>{GATEWAY_LABEL[link.status]}</span>
          <span className={`pill ${settings.emergencyMode ? 'pill-warn' : ''}`}>
            {settings.emergencyMode ? '应急模式' : '常规模式'}
          </span>
        </div>
      </header>

      {settings.emergencyMode && (
        <div className="emergency-banner">
          <strong>应急临时设台</strong>
          <span>
            呼号 {settings.callsign || '未填'} · 报备 {settings.authorizationRef || '未填'} · {settings.agency || '未填机构'} · {settings.bands} · {settings.powerW} W
          </span>
          <span className="banner-note">条例第 37 条：紧急情况可临时设台，须及时向属地无管机构报告并事后关闭</span>
        </div>
      )}

      <main className="layout">
        <aside className="col-left">
          <NodePanel
            nodes={nodes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onFocus={focusNode}
            onRemove={actions.removeNode}
          />
        </aside>

        <section className="col-main">
          <div className="map-wrap">
            <MapView
              nodes={nodes}
              incidents={incidents}
              center={settings.mapCenter}
              zoom={settings.mapZoom}
              selectedId={selectedId}
              focus={focus}
              onSelect={setSelectedId}
              onViewChange={(center, zoom) => actions.patchSettings({ mapCenter: center, mapZoom: zoom })}
            />
            <div className="map-legend">
              {Object.entries({ command: '指挥车', relay: '中继', drone: '无人机', car: '救援车', phone: '终端' }).map(([key, label]) => (
                <span key={key}><i className={`legend-dot role-${key}`} />{label}</span>
              ))}
            </div>
            <div className="map-tools">
              <button
                type="button"
                onClick={() => {
                  if (selected) focusNode(selected);
                  else actions.patchSettings({ mapCenter: [30.6598, 104.0633], mapZoom: 13 });
                }}
              >
                定位
              </button>
              <span className="map-coord">
                {settings.mapCenter[0].toFixed(4)}, {settings.mapCenter[1].toFixed(4)} · z{settings.mapZoom}
              </span>
            </div>
          </div>
          {selected && (
            <div className="selection-bar">
              <span><strong>{selected.name}</strong> {selected.callsign ?? ''}</span>
              <span className="muted">
                {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)} · 电量 {Math.round(selected.battery * 100)}% ·{' '}
                {selected.online ? '在线' : `离线 ${Math.round((Date.now() - selected.lastSeen) / 60000)} 分钟`}
              </span>
              <button type="button" onClick={() => setTab('messages')}>发消息</button>
            </div>
          )}
        </section>

        <aside className="col-right">
          <nav className="tabs">
            <button type="button" className={tab === 'incidents' ? 'is-active' : ''} onClick={() => setTab('incidents')}>
              事件 {incidents.filter((i) => i.status !== 'closed').length}
            </button>
            <button type="button" className={tab === 'messages' ? 'is-active' : ''} onClick={() => setTab('messages')}>
              消息
            </button>
            <button type="button" className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')}>
              设置
            </button>
          </nav>
          {tab === 'incidents' && (
            <IncidentPanel incidents={incidents} onFocus={focusNode} onStatus={actions.setIncidentStatus} />
          )}
          {tab === 'messages' && (
            <MessagePanel
              nodes={nodes}
              messages={messages}
              selectedId={selectedId}
              gatewayStatus={link.status}
              onSend={sendTo}
            />
          )}
          {tab === 'settings' && (
            <SettingsPanel
              settings={settings}
              gatewayStatus={link.status}
              gatewayName={settings.source === 'serial' ? 'USB 串口' : gateway.gatewayName}
              gatewayError={link.lastError}
              serialSupported={serial.supported}
              serialConnected={serial.connected}
              onSerialConnect={() => void serial.connect()}
              onSerialDisconnect={() => void serial.disconnect()}
              onPatch={actions.patchSettings}
              onDemo={actions.loadDemo}
              onClear={actions.clearAll}
              onExport={actions.exportJson}
              onImport={actions.importJson}
              onAddNode={actions.addManualNode}
            />
          )}
        </aside>
      </main>
    </div>
  );
}