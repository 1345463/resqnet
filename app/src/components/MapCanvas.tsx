import { useEffect, useRef } from 'react';
import type { MeshEngine } from '../core/engine';
import type { Role, SimNode } from '../core/types';
import { WORLD_H, WORLD_W } from '../core/terrain';

const ROLE_COLOR: Record<Role, string> = {
  phone: '#38bdf8',
  relay: '#34d399',
  drone: '#a78bfa',
  car: '#fbbf24',
  command: '#fb7185',
};

const ROLE_LABEL: Record<Role, string> = {
  phone: '终端',
  relay: '中继',
  drone: '无人机',
  car: '救援车',
  command: '指挥车',
};

interface Props {
  engine: MeshEngine;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MapCanvas({ engine, selectedId, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(320, Math.floor(rect.width * dpr));
      canvas.height = Math.max(240, Math.floor(rect.height * dpr));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const toScreen = (x: number, y: number) => {
      const pad = 26;
      const w = canvas.width;
      const h = canvas.height;
      const scale = Math.min((w - pad * 2) / WORLD_W, (h - pad * 2) / WORLD_H);
      const ox = (w - WORLD_W * scale) / 2;
      const oy = (h - WORLD_H * scale) / 2;
      return { x: ox + x * scale, y: oy + y * scale, scale };
    };

    const drawTerrain = () => {
      const w = canvas.width;
      const h = canvas.height;
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0a1524');
      bg.addColorStop(1, '#071018');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= WORLD_W; x += 100) {
        const a = toScreen(x, 0);
        const b = toScreen(x, WORLD_H);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (let y = 0; y <= WORLD_H; y += 100) {
        const a = toScreen(0, y);
        const b = toScreen(WORLD_W, y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const hill of engine.terrain.hills) {
        const c = toScreen(hill.x, hill.y);
        const r = hill.r * c.scale;
        const grad = ctx.createRadialGradient(c.x, c.y, r * 0.15, c.x, c.y, r);
        grad.addColorStop(0, 'rgba(45, 74, 62, 0.55)');
        grad.addColorStop(0.65, 'rgba(30, 52, 44, 0.35)');
        grad.addColorStop(1, 'rgba(16, 30, 26, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.12)';
        ctx.stroke();
      }

      ctx.beginPath();
      engine.terrain.river.forEach((p, i) => {
        const s = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.lineWidth = Math.max(2, 3 * toScreen(0, 0).scale);
      ctx.stroke();

      ctx.setLineDash([8, 6]);
      for (const road of engine.terrain.roads) {
        ctx.beginPath();
        road.forEach((p, i) => {
          const s = toScreen(p.x, p.y);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.10)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };

    const nodeScreen = (node: SimNode) => toScreen(node.x, node.y);

    const drawLinks = () => {
      const scale = toScreen(0, 0).scale;
      for (const link of engine.links) {
        const a = engine.nodes.find((n) => n.id === link.a);
        const b = engine.nodes.find((n) => n.id === link.b);
        if (!a || !b) continue;
        const sa = nodeScreen(a);
        const sb = nodeScreen(b);
        const hot = selectedRef.current === link.a || selectedRef.current === link.b;
        const strength = Math.max(0, Math.min(1, (link.snr + 9) / 30));
        const color = strength > 0.55 ? '52, 211, 153' : strength > 0.3 ? '250, 204, 21' : '248, 113, 113';
        ctx.strokeStyle = `rgba(${color}, ${hot ? 0.5 : 0.1 + strength * 0.1})`;
        ctx.lineWidth = hot ? Math.max(1.4, 1.6 * scale) : Math.max(0.6, 0.7 * scale);
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
      }
    };

    const drawRelay = () => {
      if (!engine.showRelay) return;
      for (const node of engine.nodes) {
        if (!node.online) continue;
        const relay = engine.relayFor(node.id);
        if (!relay) continue;
        const target = engine.nodes.find((n) => n.id === relay.id);
        if (!target) continue;
        const a = nodeScreen(node);
        const b = nodeScreen(target);
        const hot = selectedRef.current === node.id;
        ctx.strokeStyle = hot ? 'rgba(34, 211, 238, 0.75)' : 'rgba(34, 211, 238, 0.10)';
        ctx.lineWidth = hot ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (hot) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const tipX = b.x - Math.cos(angle) * 12;
          const tipY = b.y - Math.sin(angle) * 12;
          ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - Math.cos(angle - 0.5) * 9, tipY - Math.sin(angle - 0.5) * 9);
          ctx.lineTo(tipX - Math.cos(angle + 0.5) * 9, tipY - Math.sin(angle + 0.5) * 9);
          ctx.closePath();
          ctx.fill();
        }
      }
    };

    const drawTrails = () => {
      for (const node of engine.nodes) {
        if (!node.mobile || node.trail.length < 2) continue;
        ctx.beginPath();
        node.trail.forEach((p, i) => {
          const s = toScreen(p.x, p.y);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.strokeStyle = `${ROLE_COLOR[node.role]}22`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    const drawNodes = () => {
      const { scale } = toScreen(0, 0);
      const now = performance.now() / 1000;
      const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
      for (const node of engine.nodes) {
        const s = toScreen(node.x, node.y);
        const r = (node.role === 'command' ? 9 : node.role === 'phone' ? 6.5 : 8) * Math.max(0.85, Math.min(1.4, scale * 1.6));
        const color = node.online ? ROLE_COLOR[node.role] : '#475569';

        if (selectedRef.current === node.id) {
          const pulse = 1 + Math.sin(now * 3) * 0.12;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r * 2 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `${color}22`;
          ctx.fill();
          ctx.strokeStyle = `${color}aa`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        if (node.trail.length > 0) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, r + 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(9, 14, 24, 0.7)';
          ctx.fill();
        }

        ctx.beginPath();
        if (node.role === 'command') {
          ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
        } else {
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        }
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(8, 15, 26, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const battery = Math.max(0, Math.min(1, node.battery));
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * battery);
        ctx.strokeStyle = battery > 0.4 ? 'rgba(74, 222, 128, 0.55)' : battery > 0.2 ? 'rgba(250, 204, 21, 0.6)' : 'rgba(248, 113, 113, 0.7)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        const label = node.name;
        const fontSize = Math.max(9, Math.min(12, 10 * scale));
        ctx.font = `${fontSize}px "Noto Sans SC", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        const textWidth = ctx.measureText(label).width;
        const box = { x1: s.x - textWidth / 2 - 2, y1: s.y + r + 2, x2: s.x + textWidth / 2 + 2, y2: s.y + r + fontSize + 6 };
        const clash = placed.some((p) => box.x1 < p.x2 && box.x2 > p.x1 && box.y1 < p.y2 && box.y2 > p.y1);
        const forced = selectedRef.current === node.id || node.role !== 'phone';
        if (forced || !clash) {
          ctx.fillStyle = node.online ? 'rgba(226, 232, 240, 0.82)' : 'rgba(148, 163, 184, 0.5)';
          ctx.fillText(label, s.x, s.y + r + 13);
          placed.push(box);
        }
      }
    };

    const drawTeams = () => {
      const scale = toScreen(0, 0).scale;
      for (const team of engine.teams) {
        const s = toScreen(team.x, team.y);
        if (team.status === 'moving' && team.targetX !== undefined && team.targetY !== undefined) {
          const t = toScreen(team.targetX, team.targetY);
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const size = 10 * Math.max(0.85, Math.min(1.3, scale * 1.6));
        ctx.beginPath();
        ctx.rect(s.x - size, s.y - size, size * 2, size * 2);
        ctx.fillStyle = team.status === 'onsite' ? '#34d399' : team.status === 'moving' ? '#22d3ee' : '#e2e8f0';
        ctx.fill();
        ctx.strokeStyle = 'rgba(8, 15, 26, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(8, 15, 26, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x - size * 0.45, s.y);
        ctx.lineTo(s.x + size * 0.45, s.y);
        ctx.moveTo(s.x, s.y - size * 0.45);
        ctx.lineTo(s.x, s.y + size * 0.45);
        ctx.stroke();
        const label = `${team.name} · ${team.members}人`;
        ctx.font = '10px "Noto Sans SC", system-ui, sans-serif';
        ctx.textAlign = 'center';
        const width = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(6, 12, 21, 0.7)';
        ctx.fillRect(s.x - width / 2 - 2, s.y - size - 14, width + 4, 13);
        ctx.fillStyle = team.status === 'onsite' ? '#86efac' : '#e2e8f0';
        ctx.fillText(label, s.x, s.y - size - 4);
      }
    };

    const drawPackets = () => {
      for (const flight of engine.inFlight) {
        const a = engine.nodes.find((n) => n.id === flight.from);
        const b = engine.nodes.find((n) => n.id === flight.to);
        if (!a || !b) continue;
        const sa = nodeScreen(a);
        const sb = nodeScreen(b);
        const x = sa.x + (sb.x - sa.x) * flight.progress;
        const y = sa.y + (sb.y - sa.y) * flight.progress;
        const color = flight.packet.priority === 0 ? '#f87171' : flight.packet.priority >= 3 ? '#94a3b8' : '#22d3ee';
        const r = flight.packet.priority === 0 ? 3.2 : 2.2;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = `${color}22`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    };

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawTerrain();
      drawLinks();
      drawRelay();
      drawTrails();
      drawNodes();
      drawTeams();
      drawPackets();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onPointerDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = (event.clientX - rect.left) * dpr;
      const py = (event.clientY - rect.top) * dpr;
      const pad = 26;
      const scale = Math.min((canvas.width - pad * 2) / WORLD_W, (canvas.height - pad * 2) / WORLD_H);
      const ox = (canvas.width - WORLD_W * scale) / 2;
      const oy = (canvas.height - WORLD_H * scale) / 2;
      const wx = (px - ox) / scale;
      const wy = (py - oy) / scale;
      let best: { id: string; d: number } | null = null;
      for (const node of engine.nodes) {
        const d = Math.hypot(node.x - wx, node.y - wy);
        if (!best || d < best.d) best = { id: node.id, d };
      }
      if (best && best.d < 22) onSelect(best.id);
    };
    canvas.addEventListener('pointerdown', onPointerDown);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
  }, [engine, onSelect]);

  return <canvas ref={canvasRef} className="map-canvas" aria-label="应急通信态势图" />;
}

export function roleLabel(role: Role): string {
  return ROLE_LABEL[role];
}

export function roleColor(role: Role): string {
  return ROLE_COLOR[role];
}