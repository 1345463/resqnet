import { useState } from 'react';
import { useSimulation } from './hooks/useSimulation';
import { MapCanvas } from './components/MapCanvas';
import { NodePanel } from './components/NodePanel';
import { MessageFeed } from './components/MessageFeed';
import { Composer } from './components/Composer';
import { MetricsBar } from './components/MetricsBar';
import { VoiceProgress } from './components/VoiceProgress';
import { ScenarioBar } from './components/ScenarioBar';
import type { Channel, ScenarioKey } from './core/types';

const SCENARIO_LABEL: Record<ScenarioKey, string> = {
  urban: '城区搜救',
  mountain: '山地失联',
  disaster: '震后灾区',
};

export default function App() {
  const { engine, snap, actions } = useSimulation();
  const [channel, setChannel] = useState<Channel>('public');
  const [emergency, setEmergency] = useState({ on: false, callsign: '', report: '' });
  const selected = snap.nodes.find((node) => node.id === snap.selectedId) ?? null;
  const relay = selected ? engine.relayFor(selected.id) : null;

  const startDemo = () => {
    const command = snap.nodes.find((node) => node.role === 'command');
    const phones = snap.nodes.filter((node) => node.role === 'phone' && node.online);
    if (!command || phones.length === 0) return;
    const far = phones.reduce((best, node) => {
      const d = Math.hypot(node.x - command.x, node.y - command.y);
      const bestD = Math.hypot(best.x - command.x, best.y - command.y);
      return d > bestD ? node : best;
    }, phones[0]);
    actions.sendSOS(far.id);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">RQ</span>
          <div>
            <h1>应急通 ResQNet</h1>
            <p>去中心化应急救援信息互通 · 协议仿真台</p>
          </div>
        </div>
        <div className="topbar-meta">
          <span className="pill">{SCENARIO_LABEL[snap.scenario]}</span>
          <span className="pill pill-ok">{snap.online} 节点在线</span>
          <span className="pill pill-warn">演示模式</span>
        </div>
      </header>

      {emergency.on && (
        <div className="emergency-banner">
          应急临时设台 · 呼号 {emergency.callsign || '未填'} · 报备 {emergency.report || '未填'} · 条例第 37 条：须及时向属地无管机构报告，事后关闭
        </div>
      )}

      <main className="layout">
        <aside className="col-left">
          <ScenarioBar
            scenario={snap.scenario}
            showRelay={snap.showRelay}
            radio={snap.radio}
            positionEnabled={snap.positionEnabled}
            onScenario={actions.setScenario}
            onToggleRelay={actions.toggleRelay}
            onRadio={actions.setRadio}
            onPosition={actions.setPosition}
            onReset={() => actions.setScenario(snap.scenario)}
          />
          <section className="panel emergency-panel">
            <label className="switch-row">
              <input
                type="checkbox"
                checked={emergency.on}
                onChange={(e) => setEmergency((prev) => ({ ...prev, on: e.target.checked }))}
              />
              <span>应急模式（条例第 37 条）</span>
            </label>
            {emergency.on && (
              <div className="form-grid compact">
                <input
                  value={emergency.callsign}
                  placeholder="呼号"
                  onChange={(e) => setEmergency((prev) => ({ ...prev, callsign: e.target.value }))}
                />
                <input
                  value={emergency.report}
                  placeholder="报备编号"
                  onChange={(e) => setEmergency((prev) => ({ ...prev, report: e.target.value }))}
                />
              </div>
            )}
          </section>
          <NodePanel
            nodes={snap.nodes}
            selectedId={snap.selectedId}
            relay={relay}
            onSelect={actions.select}
            onToggle={actions.toggleNode}
          />
        </aside>

        <section className="col-main">
          <div className="map-wrap">
            <MapCanvas engine={engine} selectedId={snap.selectedId} onSelect={actions.select} />
            <div className="legend">
              <span><i style={{ background: '#38bdf8' }} />终端</span>
              <span><i style={{ background: '#34d399' }} />中继</span>
              <span><i style={{ background: '#a78bfa' }} />无人机</span>
              <span><i style={{ background: '#fbbf24' }} />救援车</span>
              <span><i style={{ background: '#fb7185' }} />指挥车</span>
            </div>
            <div className="map-hint">点击节点选择 · 外圈为电量 · 青色箭头为主中继</div>
          </div>
          <Composer
            node={selected}
            channel={channel}
            onChannel={setChannel}
            onSendSOS={() => selected && actions.sendSOS(selected.id)}
            onSendText={(text) => selected && actions.sendText(selected.id, text, channel)}
            onSendVoice={(url, duration) => selected && actions.sendVoice(selected.id, url, duration, channel)}
            onBeidou={() => selected && actions.sendBeidou(selected.id)}
            onNearfield={() => selected && actions.nearfield(selected.id)}
            beidouPending={snap.beidouPending}
            beidouAcks={snap.beidouAcks}
          />
        </section>

        <aside className="col-right">
          <MetricsBar metrics={snap.metrics} ackCount={snap.ackCount} clock={snap.clock} />
          <VoiceProgress voices={snap.voices} clock={snap.clock} />
          <MessageFeed events={snap.events} />
          <section className="panel guide">
            <h2>演示步骤</h2>
            <button type="button" className="demo-btn" onClick={startDemo}>
              一键演示：最远节点发出 SOS
            </button>
            <ol>
              <li>在左侧或地图上选一个「居民」节点</li>
              <li>点 <b>SOS 求救</b>，看红色数据包如何多跳到达指挥车</li>
              <li>在节点上点「断开」，观察网络绕行与主中继切换</li>
              <li>发一条文字或语音，右侧日志会显示跳数与时延</li>
              <li>切「BLE」再选「近场-01」发消息：节点无外链会进入离线队列；切回 LoRa 自动补发</li>
              <li>点「北斗求救」：不依赖 Mesh，约 9 秒后收到卫星回执</li>
            </ol>
            <details className="feature-list">
              <summary>演示端覆盖的功能</summary>
              <ul>
                <li>三种演练场景与地形遮挡</li>
                <li>链路模式：LoRa / Wi-Fi HaLow / BLE 近场（范围与带宽随模式变化）</li>
                <li>SOS 多跳、指挥车回执、无回执自动重发</li>
                <li>主中继选举与评分明细（链路/代价/高度/电量/负载）</li>
                <li>公共频道 / 队伍加密频道（E2EE 标记）</li>
                <li>文字与语音消息分片、去重、TTL、优先级</li>
                <li>位置回传开关（省电模式）与轨迹</li>
                <li>离线队列与链路恢复补发</li>
                <li>北斗三号短报文卫星求援与回执</li>
                <li>近场实时语音（BLE/WiFi 直连，不走 Mesh）</li>
                <li>应急模式：条例第 37 条临时设台登记</li>
              </ul>
            </details>
            <p className="demo-status">链路 {snap.radio === 'halow' ? 'Wi-Fi HaLow' : snap.radio === 'ble' ? 'BLE 近场' : 'LoRa 433MHz'} · 离线队列 {snap.queued} 条 · 北斗回执 {snap.beidouAcks}</p>
            <p className="muted">
              本页运行协议仿真：邻居发现、链路度量、中继选举、广播抑制、分片与去重均为真实计算；真实射频链路见作品帖硬件视频。
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}