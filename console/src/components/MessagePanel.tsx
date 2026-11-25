import { useEffect, useState } from 'react';
import type { ConsoleNode, Message } from '../core/types';
import type { GatewayStatus } from '../core/gateway';

interface Props {
  nodes: ConsoleNode[];
  messages: Message[];
  selectedId: string | null;
  gatewayStatus: GatewayStatus;
  onSend: (to: string, text: string) => void;
}

const STATUS_LABEL: Record<Message['status'], string> = {
  queued: '待发送',
  sent: '已发往网关',
  received: '已收到',
  failed: '失败',
};

export function MessagePanel({ nodes, messages, selectedId, gatewayStatus, onSend }: Props) {
  const [target, setTarget] = useState<string>(selectedId ?? '*');
  const [text, setText] = useState('');

  useEffect(() => {
    if (selectedId) setTarget(selectedId);
  }, [selectedId]);

  const targets = [{ id: '*', name: '全部节点' }, ...nodes.map((n) => ({ id: n.id, name: n.name }))];

  return (
    <section className="panel messages-panel">
      <header className="panel-head">
        <h2>消息</h2>
        <span className="muted">{gatewayStatus === 'online' ? '网关在线' : '网关未连接'}</span>
      </header>
      <div className="compose">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <input
          value={text}
          placeholder="输入指令或文字，经网关下发"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              onSend(target, text.trim());
              setText('');
            }
          }}
        />
        <button
          type="button"
          className="primary"
          disabled={!text.trim()}
          onClick={() => {
            onSend(target, text.trim());
            setText('');
          }}
        >
          发送
        </button>
      </div>
      <ul className="message-list">
        {messages.map((message) => (
          <li key={message.id} className={`message ${message.direction}`}>
            <div className="message-head">
              <span>{message.direction === 'in' ? message.nodeName : `→ ${message.nodeName}`}</span>
              <span className="muted">
                {new Date(message.ts).toLocaleTimeString('zh-CN', { hour12: false })} · {STATUS_LABEL[message.status]}
              </span>
            </div>
            <p>{message.text}</p>
          </li>
        ))}
        {messages.length === 0 && <li className="empty">暂无消息。</li>}
      </ul>
    </section>
  );
}