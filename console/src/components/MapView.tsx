import { useEffect, useRef } from 'react';
import type { ConsoleNode, Incident } from '../core/types';
import { ROLE_COLOR } from '../core/types';
import { wgs84ToGcj02 } from '../core/coords';

const TILE = 256;

function project(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function unproject(x: number, y: number, zoom: number): { lat: number; lon: number } {
  const scale = TILE * 2 ** zoom;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

const tileCache = new Map<string, HTMLImageElement>();

function getTile(z: number, x: number, y: number): HTMLImageElement {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;
  const img = new Image();
  const sub = (Math.abs(x + y) % 4) + 1;
  img.src = `https://webrd0${sub}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`;
  tileCache.set(key, img);
  return img;
}

export interface FocusTarget {
  lat: number;
  lon: number;
  zoom: number;
  key: number;
}

interface Props {
  nodes: ConsoleNode[];
  incidents: Incident[];
  center: [number, number];
  zoom: number;
  selectedId: string | null;
  focus: FocusTarget | null;
  onSelect: (id: string) => void;
  onViewChange: (center: [number, number], zoom: number) => void;
}

export function MapView({ nodes, incidents, center, zoom, selectedId, focus, onSelect, onViewChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef({ center, zoom });
  const selectedRef = useRef(selectedId);
  const nodesRef = useRef(nodes);
  const incidentsRef = useRef(incidents);
  const dragRef = useRef<{ active: boolean; moved: boolean; lastX: number; lastY: number }>({ active: false, moved: false, lastX: 0, lastY: 0 });
  const wheelTimer = useRef(0);
  const zoomFnRef = useRef<((delta: number) => void) | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  selectedRef.current = selectedId;
  nodesRef.current = nodes;
  incidentsRef.current = incidents;

  useEffect(() => {
    viewRef.current = { center, zoom };
  }, [center, zoom]);

  useEffect(() => {
    if (!focus) return;
    viewRef.current = { center: [focus.lat, focus.lon], zoom: focus.zoom };
  }, [focus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let cssW = 800;
    let cssH = 600;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = Math.max(320, rect.width);
      cssH = Math.max(260, rect.height);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const toScreen = (lat: number, lon: number) => {
      const [glat, glon] = wgs84ToGcj02(lat, lon);
      const view = viewRef.current;
      const p = project(glat, glon, view.zoom);
      const c = project(view.center[0], view.center[1], view.zoom);
      return { x: p.x - c.x + cssW / 2, y: p.y - c.y + cssH / 2 };
    };

    const drawTiles = () => {
      const view = viewRef.current;
      const c = project(view.center[0], view.center[1], view.zoom);
      const left = c.x - cssW / 2;
      const top = c.y - cssH / 2;
      const max = 2 ** view.zoom;
      const startX = Math.floor(left / TILE);
      const endX = Math.floor((left + cssW) / TILE);
      const startY = Math.floor(top / TILE);
      const endY = Math.floor((top + cssH) / TILE);
      let drawn = 0;
      for (let x = startX; x <= endX; x += 1) {
        for (let y = startY; y <= endY; y += 1) {
          if (y < 0 || y >= max) continue;
          const wrapped = ((x % max) + max) % max;
          const img = getTile(view.zoom, wrapped, y);
          const dx = Math.floor(x * TILE - left);
          const dy = Math.floor(y * TILE - top);
          if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, dx, dy, TILE, TILE);
            drawn += 1;
          } else {
            ctx.fillStyle = '#0d1727';
            ctx.fillRect(dx, dy, TILE, TILE);
          }
        }
      }
      if (drawn === 0) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('底图未加载（可离线使用坐标网格）', cssW / 2, 20);
      }
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.lineWidth = 1;
      for (let x = startX; x <= endX; x += 1) {
        const dx = Math.floor(x * TILE - left);
        ctx.beginPath();
        ctx.moveTo(dx, 0);
        ctx.lineTo(dx, cssH);
        ctx.stroke();
      }
      for (let y = startY; y <= endY; y += 1) {
        const dy = Math.floor(y * TILE - top);
        ctx.beginPath();
        ctx.moveTo(0, dy);
        ctx.lineTo(cssW, dy);
        ctx.stroke();
      }
    };

    const drawIncidents = () => {
      const now = performance.now() / 1000;
      for (const incident of incidentsRef.current) {
        if (incident.status === 'closed') continue;
        const p = toScreen(incident.lat, incident.lon);
        const pulse = 1 + Math.sin(now * 3 + incident.createdAt) * 0.25;
        const radius = 14 * pulse;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
        ctx.fill();
        ctx.strokeStyle = incident.status === 'open' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(251, 191, 36, 0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = incident.status === 'open' ? '#ef4444' : '#fbbf24';
        ctx.fill();
      }
    };

    const drawNodes = () => {
      const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
      for (const node of nodesRef.current) {
        const p = toScreen(node.lat, node.lon);
        const selected = selectedRef.current === node.id;
        const r = node.role === 'command' ? 8 : node.role === 'phone' ? 6 : 7.5;
        const color = node.online ? ROLE_COLOR[node.role] : '#475569';
        if (!node.online) {
          ctx.setLineDash([3, 3]);
        }
        ctx.beginPath();
        if (node.role === 'command') ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
        else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(8, 15, 26, 0.9)';
        ctx.stroke();
        ctx.setLineDash([]);
        if (selected) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        const label = node.callsign ? `${node.name} · ${node.callsign}` : node.name;
        ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
        ctx.textAlign = 'center';
        const width = ctx.measureText(label).width;
        const box = { x1: p.x - width / 2 - 2, y1: p.y + r + 2, x2: p.x + width / 2 + 2, y2: p.y + r + 16 };
        const clash = placed.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
        if (selected || !clash) {
          ctx.fillStyle = 'rgba(6, 12, 21, 0.65)';
          ctx.fillRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
          ctx.fillStyle = node.online ? 'rgba(226, 232, 240, 0.9)' : 'rgba(148, 163, 184, 0.6)';
          ctx.fillText(label, p.x, p.y + r + 13);
          placed.push(box);
        }
      }
    };

    const draw = () => {
      ctx.fillStyle = '#071018';
      ctx.fillRect(0, 0, cssW, cssH);
      drawTiles();
      drawIncidents();
      drawNodes();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const pick = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let best: { id: string; d: number } | null = null;
      for (const node of nodesRef.current) {
        const p = toScreen(node.lat, node.lon);
        const d = Math.hypot(p.x - x, p.y - y);
        if (!best || d < best.d) best = { id: node.id, d };
      }
      if (best && best.d < 18) onSelectRef.current(best.id);
    };

    const onPointerDown = (event: PointerEvent) => {
      dragRef.current = { active: true, moved: false, lastX: event.clientX, lastY: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      const view = viewRef.current;
      const c = project(view.center[0], view.center[1], view.zoom);
      const next = unproject(c.x - dx, c.y - dy, view.zoom);
      view.center = [next.lat, next.lon];
    };
    const onPointerUp = () => {
      const drag = dragRef.current;
      drag.active = false;
      if (drag.moved) onViewChangeRef.current(viewRef.current.center, viewRef.current.zoom);
      else pick(drag.lastX, drag.lastY);
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const view = viewRef.current;
      const c = project(view.center[0], view.center[1], view.zoom);
      const world = unproject(c.x - cssW / 2 + x, c.y - cssH / 2 + y, view.zoom);
      const nextZoom = Math.max(4, Math.min(17, view.zoom + (event.deltaY < 0 ? 1 : -1)));
      const p = project(world.lat, world.lon, nextZoom);
      const nextCenter = unproject(p.x - (x - cssW / 2), p.y - (y - cssH / 2), nextZoom);
      viewRef.current = { center: [nextCenter.lat, nextCenter.lon], zoom: nextZoom };
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => {
        onViewChangeRef.current(viewRef.current.center, viewRef.current.zoom);
      }, 200);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    zoomFnRef.current = (delta: number) => {
      const view = viewRef.current;
      const nextZoom = Math.max(4, Math.min(17, view.zoom + delta));
      if (nextZoom === view.zoom) return;
      viewRef.current = { center: view.center, zoom: nextZoom };
      onViewChangeRef.current(view.center, nextZoom);
    };

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.clearTimeout(wheelTimer.current);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="map-canvas" aria-label="应急态势地图" />
      <div className="map-zoom">
        <button type="button" onClick={() => zoomFnRef.current?.(1)} aria-label="放大">+</button>
        <button type="button" onClick={() => zoomFnRef.current?.(-1)} aria-label="缩小">−</button>
      </div>
    </>
  );
}