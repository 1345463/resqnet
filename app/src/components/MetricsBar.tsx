import type { Metrics } from '../core/types';

interface Props {
  metrics: Metrics;
  ackCount: number;
  clock: number;
}

export function MetricsBar({ metrics, ackCount, clock }: Props) {
  const hasTraffic = metrics.sent > 0;
  return (
    <section className="metrics">
      <div className="metric">
        <span className="metric-value">{hasTraffic ? `${(metrics.deliveryRate * 100).toFixed(0)}%` : '—'}</span>
        <span className="metric-label">送达率</span>
      </div>
      <div className="metric">
        <span className="metric-value">{metrics.delivered > 0 ? metrics.avgHops.toFixed(1) : '—'}</span>
        <span className="metric-label">平均跳数</span>
      </div>
      <div className="metric">
        <span className="metric-value">{metrics.delivered > 0 ? `${metrics.avgLatency.toFixed(1)}s` : '—'}</span>
        <span className="metric-label">平均时延</span>
      </div>
      <div className="metric">
        <span className="metric-value">{ackCount}</span>
        <span className="metric-label">已确认求救</span>
      </div>
      <div className="metric metric-wide">
        <span className="metric-label">仿真时钟</span>
        <span className="metric-sub">
          {Math.floor(clock / 60)}:{String(Math.floor(clock % 60)).padStart(2, '0')} · 已发 {metrics.sent} · 已送达 {metrics.delivered}
        </span>
      </div>
    </section>
  );
}