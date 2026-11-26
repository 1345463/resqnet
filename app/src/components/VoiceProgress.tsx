import type { VoiceJobView } from '../core/types';

interface Props {
  voices: VoiceJobView[];
  clock: number;
}

export function VoiceProgress({ voices, clock }: Props) {
  if (voices.length === 0) return null;
  return (
    <section className="panel voice-panel">
      <header className="panel-head">
        <h2>语音传输</h2>
        <span className="muted">分片重组中</span>
      </header>
      <ul className="voice-list">
        {voices.map((voice) => {
          const pct = Math.round((voice.done / voice.total) * 100);
          const elapsed = Math.max(0, clock - voice.startedAt);
          return (
            <li key={voice.id}>
              <div className="voice-row">
                <span>{voice.srcName}</span>
                <span className="muted">
                  {voice.done}/{voice.total} 片 · {pct}%
                </span>
              </div>
              <div className="voice-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="voice-elapsed">已用 {elapsed.toFixed(1)} s</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}