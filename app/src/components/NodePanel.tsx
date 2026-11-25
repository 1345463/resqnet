import type { SimNode } from '../core/types';
import { roleColor, roleLabel } from './MapCanvas';

interface RelayInfo {
  name: string;
  snr: number;
  score: number;
}

interface Props {
  nodes: SimNode[];
  selectedId: string | null;
  relay: RelayInfo | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}

const ROLE_ORDER: Record<string, number> = { command: 0, relay: 1, drone: 2, car: 3, phone: 4 };

export function NodePanel({ nodes, selectedId, relay, onSelect, onToggle }: Props) {
  const sorted = [...nodes].sort((a, b) => {
    const ra = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (ra !== 0) return ra;
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  return (
    <section className="panel node-panel">
      <header className="panel-head">
        <h2>节点</h2>
        <span className="muted">{nodes.filter((n) => n.online).length}/{nodes.length} 在线</span>
      </header>
      {relay && (
        <div className="relay-card">
          <span className="relay-label">主中继</span>
          <strong>{relay.name}</strong>
          <span className={`muted ${relay.snr < 0 ? 'snr-weak' : ''}`}>
            链路 {relay.snr.toFixed(1)} dB{relay.snr < 0 ? '（临界）' : ''} · 综合评分 {(relay.score * 100).toFixed(0)}
          </span>
        </div>
      )}
      <ul className="node-list">
        {sorted.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className={`node-row ${node.id === selectedId ? 'is-selected' : ''} ${node.online ? '' : 'is-offline'}`}
              onClick={() => onSelect(node.id)}
            >
              <span className="dot" style={{ background: roleColor(node.role) }} />
              <span className="node-name">{node.name}</span>
              <span className="node-role">{roleLabel(node.role)}</span>
              <span className={`battery ${node.battery < 0.25 ? 'low' : ''}`}>{Math.round(node.battery * 100)}%</span>
            </button>
            <button
              type="button"
              className="node-toggle"
              title={node.online ? '模拟设备断开' : '恢复设备'}
              onClick={() => onToggle(node.id)}
            >
              {node.online ? '断开' : '恢复'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}