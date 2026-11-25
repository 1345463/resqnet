import type { Role, ScenarioKey, SimNode } from './types';
import { buildTerrain, mulberry32, WORLD_H, WORLD_W } from './terrain';
import type { Terrain } from './terrain';

const TX_POWER: Record<Role, number> = {
  phone: 14,
  relay: 20,
  drone: 22,
  car: 27,
  command: 27,
};

const ALTITUDE: Record<Role, number> = {
  phone: 1.5,
  relay: 28,
  drone: 120,
  car: 2,
  command: 6,
};

export interface Scenario {
  key: ScenarioKey;
  terrain: Terrain;
  nodes: SimNode[];
}

let idSeq = 1;

function makeNode(
  rng: () => number,
  role: Role,
  name: string,
  x: number,
  y: number,
  mobile: boolean
): SimNode {
  return {
    id: `n${idSeq++}`,
    name,
    role,
    x,
    y,
    txPower: TX_POWER[role],
    battery: 0.45 + rng() * 0.5,
    online: true,
    mobile,
    altitude: ALTITUDE[role],
    load: 0.12 + rng() * 0.5,
    heading: rng() * Math.PI * 2,
    trail: [],
    lastSeen: 0,
  };
}

function phoneRing(rng: () => number, prefix: string, cx: number, cy: number, radius: number, count: number): SimNode[] {
  const nodes: SimNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const r = radius * (0.25 + rng() * 0.75);
    nodes.push(
      makeNode(rng, 'phone', `${prefix}-${String(i + 1).padStart(2, '0')}`, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, true)
    );
  }
  return nodes;
}

export function createScenario(key: ScenarioKey): Scenario {
  idSeq = 1;
  const terrain = buildTerrain(key);
  const rng = mulberry32(key === 'urban' ? 101 : key === 'mountain' ? 202 : 303);

  if (key === 'urban') {
    const nodes: SimNode[] = [
      makeNode(rng, 'command', '指挥车', 180, 560, false),
      makeNode(rng, 'relay', '中继-01', 430, 250, false),
      makeNode(rng, 'relay', '中继-02', 760, 420, false),
      makeNode(rng, 'relay', '中继-03', 610, 130, false),
      makeNode(rng, 'drone', '无人机-01', 520, 360, true),
      makeNode(rng, 'car', '救援车-01', 300, 430, true),
      makeNode(rng, 'car', '救援车-02', 720, 300, true),
    ];
    nodes.push(...phoneRing(rng, '居民', 520, 380, 250, 26));
    return { key, terrain, nodes };
  }

  if (key === 'mountain') {
    const nodes: SimNode[] = [
      makeNode(rng, 'command', '指挥车', 110, 620, false),
      makeNode(rng, 'relay', '中继-01', 480, 440, false),
      makeNode(rng, 'relay', '中继-02', 700, 300, false),
      makeNode(rng, 'drone', '无人机-01', 330, 160, true),
      makeNode(rng, 'drone', '无人机-02', 790, 140, true),
      makeNode(rng, 'car', '救援车-01', 240, 540, true),
    ];
    for (let i = 0; i < 18; i += 1) {
      const t = i / 17;
      const x = 160 + t * 700 + (rng() - 0.5) * 80;
      const y = 560 - t * 340 + (rng() - 0.5) * 80;
      nodes.push(makeNode(rng, 'phone', `队员-${String(i + 1).padStart(2, '0')}`, x, y, true));
    }
    return { key, terrain, nodes };
  }

  const nodes: SimNode[] = [
    makeNode(rng, 'command', '指挥车', 120, 640, false),
    makeNode(rng, 'relay', '中继-01', 300, 300, false),
    makeNode(rng, 'relay', '中继-02', 700, 300, false),
    makeNode(rng, 'relay', '中继-03', 520, 540, false),
    makeNode(rng, 'drone', '无人机-01', 500, 120, true),
    makeNode(rng, 'drone', '无人机-02', 260, 460, true),
    makeNode(rng, 'drone', '无人机-03', 820, 470, true),
    makeNode(rng, 'car', '救援车-01', 480, 380, true),
  ];
  nodes.push(...phoneRing(rng, '居民', 260, 220, 120, 16));
  nodes.push(...phoneRing(rng, '居民', 720, 240, 130, 16));
  nodes.push(...phoneRing(rng, '居民', 480, 570, 120, 15));
  return { key, terrain, nodes };
}

export function nodeById(nodes: SimNode[], id: string): SimNode | undefined {
  return nodes.find((n) => n.id === id);
}

export function clampWorld(node: SimNode): void {
  if (node.x < 20 || node.x > WORLD_W - 20) node.heading = Math.PI - node.heading;
  if (node.y < 20 || node.y > WORLD_H - 20) node.heading = -node.heading;
  node.x = Math.min(WORLD_W - 20, Math.max(20, node.x));
  node.y = Math.min(WORLD_H - 20, Math.max(20, node.y));
}