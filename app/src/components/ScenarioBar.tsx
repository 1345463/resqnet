import type { RadioMode, ScenarioKey } from '../core/types';

interface Props {
  scenario: ScenarioKey;
  showRelay: boolean;
  radio: RadioMode;
  positionEnabled: boolean;
  onScenario: (key: ScenarioKey) => void;
  onToggleRelay: () => void;
  onRadio: (radio: RadioMode) => void;
  onPosition: (enabled: boolean) => void;
  onReset: () => void;
}

const OPTIONS: { key: ScenarioKey; label: string; hint: string }[] = [
  { key: 'urban', label: '城区搜救', hint: '密集建筑，链路 1–2 km' },
  { key: 'mountain', label: '山地失联', hint: '山脊遮挡，靠高点中继' },
  { key: 'disaster', label: '震后灾区', hint: '分区断电，多中继桥接' },
];

const RADIOS: { key: RadioMode; label: string; hint: string }[] = [
  { key: 'lora', label: 'LoRa', hint: '433MHz，1–3km，低带宽' },
  { key: 'halow', label: 'HaLow', hint: '802.11ah，约 1km，高带宽' },
  { key: 'ble', label: 'BLE', hint: '近场 300m，高带宽' },
];

export function ScenarioBar({ scenario, showRelay, radio, positionEnabled, onScenario, onToggleRelay, onRadio, onPosition, onReset }: Props) {
  return (
    <section className="panel scenario-panel">
      <header className="panel-head">
        <h2>演练场景</h2>
        <button type="button" className="link-btn" onClick={onReset}>
          重置
        </button>
      </header>
      <div className="scenario-tabs">
        {OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`scenario-tab ${scenario === option.key ? 'is-active' : ''}`}
            onClick={() => onScenario(option.key)}
            title={option.hint}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={showRelay} onChange={onToggleRelay} />
        <span>显示主中继选择</span>
      </label>
      <div className="radio-row">
        <span className="muted">链路</span>
        {RADIOS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`radio-chip ${radio === option.key ? 'is-active' : ''}`}
            title={option.hint}
            onClick={() => onRadio(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={positionEnabled} onChange={(e) => onPosition(e.target.checked)} />
        <span>位置回传（关闭=省电模式）</span>
      </label>
      <p className="scenario-hint">{OPTIONS.find((option) => option.key === scenario)?.hint}</p>
    </section>
  );
}