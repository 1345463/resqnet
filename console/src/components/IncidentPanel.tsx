import type { Incident, IncidentStatus } from '../core/types';

interface Props {
  incidents: Incident[];
  onFocus: (incident: Incident) => void;
  onStatus: (id: string, status: IncidentStatus) => void;
}

const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: '待响应',
  responding: '处置中',
  closed: '已关闭',
};

const LEVEL_LABEL: Record<number, string> = { 3: '紧急', 2: '较高', 1: '一般' };

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
}

export function IncidentPanel({ incidents, onFocus, onStatus }: Props) {
  const open = incidents.filter((i) => i.status !== 'closed');
  return (
    <section className="panel incidents-panel">
      <header className="panel-head">
        <h2>事件 / 求救</h2>
        <span className="muted">{open.length} 条未关闭</span>
      </header>
      <ul className="incident-list">
        {incidents.map((incident) => (
          <li key={incident.id} className={`incident status-${incident.status}`}>
            <div className="incident-head">
              <span className={`level level-${incident.level}`}>{LEVEL_LABEL[incident.level]}</span>
              <strong>{incident.nodeName}</strong>
              <span className="muted">{formatTime(incident.createdAt)}</span>
            </div>
            <p>{incident.note}</p>
            <div className="incident-actions">
              <button type="button" onClick={() => onFocus(incident)}>定位</button>
              {incident.status === 'open' && (
                <button type="button" className="primary" onClick={() => onStatus(incident.id, 'responding')}>响应</button>
              )}
              {incident.status !== 'closed' && (
                <button type="button" onClick={() => onStatus(incident.id, 'closed')}>关闭</button>
              )}
              <span className="muted">{STATUS_LABEL[incident.status]}</span>
            </div>
          </li>
        ))}
        {incidents.length === 0 && <li className="empty">暂无事件。网关上报 SOS 后会出现在这里。</li>}
      </ul>
    </section>
  );
}