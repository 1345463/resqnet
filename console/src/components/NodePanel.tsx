import { useMemo, useState } from 'react';
import type { ConsoleNode, Role } from '../core/types';
import { ROLE_COLOR, ROLE_LABEL } from '../core/types';

interface Props {
  nodes: ConsoleNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFocus: (node: ConsoleNode) => void;
  onRemove: (id: string) => void;
}

const ROLES: Role[] = ['command', 'relay', 'drone', 'car', 'phone', 'gateway'];

export function NodePanel({ nodes, selectedId, onSelect, onFocus, onRemove }: Props) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes
      .filter((node) => (role === 'all' ? true : node.role === role))
      .filter((node) =>
        q ? node.name.toLowerCase().includes(q) || (node.callsign ?? '').toLowerCase().includes(q) || node.id.toLowerCase().includes(q) : true
      )
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'zh-CN'));
  }, [nodes, query, role]);

  const online = nodes.filter((n) => n.online).length;

  return (
    <section className="panel nodes-panel">
      <header className="panel-head">
        <h2>节点台账</h2>
        <span className="muted">{online}/{nodes.length} 在线</span>
      </header>
      <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索名称 / 呼号 / ID" />
      <div className="chips">
        <button type="button" className={`chip ${role === 'all' ? 'is-active' : ''}`} onClick={() => setRole('all')}>全部</button>
        {ROLES.map((r) => (
          <button key={r} type="button" className={`chip ${role === r ? 'is-active' : ''}`} onClick={() => setRole(r)}>
            <i style={{ background: ROLE_COLOR[r] }} />
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      <ul className="node-list">
        {filtered.map((node) => (
          <li key={node.id} className={`node-item ${node.id === selectedId ? 'is-selected' : ''} ${node.online ? '' : 'is-offline'}`}>
            <button type="button" className="node-main" onClick={() => onSelect(node.id)}>
              <span className="dot" style={{ background: node.online ? ROLE_COLOR[node.role] : '#475569' }} />
              <span className="node-text">
                <strong>{node.name}</strong>
                <small>
                  {ROLE_LABEL[node.role]}
                  {node.callsign ? ` · ${node.callsign}` : ''} · {node.lat.toFixed(4)}, {node.lon.toFixed(4)}
                </small>
              </span>
              <span className={`battery ${node.battery < 0.25 ? 'low' : ''}`}>{Math.round(node.battery * 100)}%</span>
            </button>
            <div className="node-actions">
              <button type="button" onClick={() => onFocus(node)}>定位</button>
              {node.source === 'manual' && (
                <button type="button" className="danger-text" onClick={() => onRemove(node.id)}>删除</button>
              )}
            </div>
          </li>
        ))}
        {filtered.length === 0 && <li className="empty">暂无节点。连接网关或到「设置」手动添加。</li>}
      </ul>
    </section>
  );
}