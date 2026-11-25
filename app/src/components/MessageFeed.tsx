import type { FeedEvent } from '../core/types';

interface Props {
  events: FeedEvent[];
}

const KIND_LABEL: Record<FeedEvent['kind'], string> = {
  send: '发出',
  relay: '中继',
  deliver: '送达',
  ack: '回执',
  warn: '异常',
  info: '信息',
};

function formatTime(t: number): string {
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

export function MessageFeed({ events }: Props) {
  return (
    <section className="panel feed-panel">
      <header className="panel-head">
        <h2>传输日志</h2>
        <span className="muted">实时</span>
      </header>
      <ul className="feed-list">
        {events.map((event) => (
          <li key={event.id} className={`feed-item kind-${event.kind}`}>
            <span className="feed-time">{formatTime(event.t)}</span>
            <span className="feed-badge">{KIND_LABEL[event.kind]}</span>
            <div className="feed-body">
              <p>{event.text}</p>
              {event.audioUrl && <audio controls src={event.audioUrl} preload="metadata" />}
            </div>
          </li>
        ))}
        {events.length === 0 && <li className="feed-empty">暂无传输记录，试试左侧选择节点后发送 SOS</li>}
      </ul>
    </section>
  );
}