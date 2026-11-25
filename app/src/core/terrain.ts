import type { ScenarioKey, SimNode, Vec } from './types';

export const WORLD_W = 1000;
export const WORLD_H = 700;
export const METERS_PER_UNIT = 20;
export const LINK_THRESHOLD_DB = -9;
const NOISE_FLOOR_DBM = -118;

export interface Hill {
  x: number;
  y: number;
  r: number;
  loss: number;
}

export interface Terrain {
  hills: Hill[];
  river: Vec[];
  roads: Vec[][];
  baseClutter: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashPair(a: string, b: string): number {
  const s = a < b ? a + b : b + a;
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function hillLoss(terrain: Terrain, a: Vec, b: Vec): number {
  let worst = 0;
  const samples = 10;
  for (let i = 1; i < samples; i += 1) {
    const t = i / samples;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    for (const hill of terrain.hills) {
      const d = distance(p, hill);
      if (d < hill.r) {
        const depth = 1 - d / hill.r;
        worst = Math.max(worst, hill.loss * depth);
      }
    }
  }
  return worst;
}

export function snrForLink(a: SimNode, b: SimNode, terrain: Terrain): number {
  const dMeters = Math.max(distance(a, b) * METERS_PER_UNIT, 20);
  const dKm = dMeters / 1000;
  const fspl = 32.44 + 20 * Math.log10(433) + 20 * Math.log10(dKm);
  const tx = (a.txPower + b.txPower) / 2;
  const clutter = terrain.baseClutter;
  const hills = hillLoss(terrain, a, b);
  const jitter = hashPair(a.id, b.id) * 2.5;
  const rx = tx - fspl - clutter - hills + jitter;
  return rx - NOISE_FLOOR_DBM;
}

export function linkCost(snr: number): number {
  return 1 / Math.max(snr + 15, 1);
}

export function buildTerrain(key: ScenarioKey): Terrain {
  const rng = mulberry32(key === 'urban' ? 11 : key === 'mountain' ? 23 : 37);
  if (key === 'urban') {
    return {
      baseClutter: 50,
      hills: [
        { x: 260, y: 200, r: 110, loss: 16 },
        { x: 760, y: 520, r: 130, loss: 18 },
      ],
      river: [
        { x: 0, y: 470 },
        { x: 240, y: 440 },
        { x: 430, y: 500 },
        { x: 640, y: 430 },
        { x: 1000, y: 470 },
      ],
      roads: [
        [
          { x: 60, y: 120 },
          { x: 300, y: 260 },
          { x: 520, y: 330 },
          { x: 820, y: 380 },
          { x: 960, y: 560 },
        ],
        [
          { x: 140, y: 620 },
          { x: 380, y: 520 },
          { x: 620, y: 460 },
          { x: 880, y: 240 },
        ],
      ],
    };
  }
  if (key === 'mountain') {
    return {
      baseClutter: 32,
      hills: [
        { x: 320, y: 180, r: 160, loss: 26 },
        { x: 560, y: 260, r: 140, loss: 22 },
        { x: 760, y: 150, r: 120, loss: 20 },
        { x: 400, y: 520, r: 150, loss: 24 },
        { x: 700, y: 520, r: 130, loss: 18 },
      ],
      river: [
        { x: 120, y: 660 },
        { x: 300, y: 600 },
        { x: 520, y: 620 },
        { x: 760, y: 580 },
        { x: 980, y: 620 },
      ],
      roads: [
        [
          { x: 120, y: 620 },
          { x: 260, y: 540 },
          { x: 420, y: 460 },
          { x: 560, y: 380 },
          { x: 700, y: 300 },
          { x: 860, y: 220 },
        ],
      ],
    };
  }
  const hills: Hill[] = Array.from({ length: 4 }, () => ({
    x: 100 + rng() * 800,
    y: 100 + rng() * 500,
    r: 70 + rng() * 60,
    loss: 14 + rng() * 12,
  }));
  return {
    baseClutter: 46,
    hills,
    river: [
      { x: 0, y: 380 },
      { x: 260, y: 360 },
      { x: 520, y: 400 },
      { x: 760, y: 350 },
      { x: 1000, y: 390 },
    ],
    roads: [
      [
        { x: 80, y: 140 },
        { x: 300, y: 220 },
        { x: 520, y: 220 },
        { x: 760, y: 260 },
        { x: 940, y: 200 },
      ],
      [
        { x: 160, y: 620 },
        { x: 360, y: 540 },
        { x: 560, y: 540 },
        { x: 760, y: 470 },
        { x: 920, y: 520 },
      ],
    ],
  };
}