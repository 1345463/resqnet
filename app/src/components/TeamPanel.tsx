import type { RescueTeam } from '../core/types';

interface Props {
  teams: RescueTeam[];
  lastSos: { x: number; y: number; nodeName: string } | null;
  onDispatch: (id: string) => void;
  onRecall: (id: string) => void;
}

const STATUS_LABEL: Record<RescueTeam['status'], string> = {
  standby: '待命',
  moving: '出动中',
  onsite: '已抵达',
};

export function TeamPanel({ teams, lastSos, onDispatch, onRecall }: Props) {
  return (
    <section className="panel team-panel">
      <header className="panel-head">
        <h2>救援队</h2>
        <span className="muted">{teams.length} 支</span>
      </header>
      {!lastSos && <p className="team-hint">还没有 SOS 目标，先让现场节点发出求救</p>}
      <ul className="team-list">
        {teams.map((team) => {
          const dist = lastSos ? Math.hypot(team.x - lastSos.x, team.y - lastSos.y) * 20 : 0;
          return (
            <li key={team.id} className={`team-item status-${team.status}`}>
              <div className="team-main">
                <span className="team-cross">+</span>
                <span className="team-text">
                  <strong>{team.name}</strong>
                  <small>
                    {team.members} 人 · {STATUS_LABEL[team.status]}
                    {lastSos && team.status !== 'onsite' ? ` · 距求救点 ${(dist / 1000).toFixed(1)} km` : ''}
                  </small>
                </span>
                <button
                  type="button"
                  className="team-btn"
                  disabled={!lastSos || team.status === 'onsite'}
                  onClick={() => onDispatch(team.id)}
                >
                  派出
                </button>
                <button type="button" className="team-btn" disabled={team.status === 'standby'} onClick={() => onRecall(team.id)}>
                  召回
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}