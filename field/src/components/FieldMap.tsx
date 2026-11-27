import { useEffect, useRef, useState } from 'react';
import type { Peer, SelfPosition } from '../core/types';
import { wgs84ToGcj02 } from '../core/coords';

const TILE = 256;

function project(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
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

const ROLE_COLOR: Record<string, string> = {
  phone: '#38bdf8',
  relay: '#34d399',
  drone: '#a78bfa',
  car: '#fbbf24',
  command: '#fb7185',
  gateway: '#22d3ee',
};

interface Props {
  self: SelfPosition | null;
  peers: Peer[];
}

export function FieldMap({ self, peers }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(15);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const selfRef = useRef(self);
  selfRef.current = self;
  const peersRef = useRef(peers);
  peersRef.current = peers;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let cssW = 360;
    let cssH = 360;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = Math.max(280, rect.width);
      cssH = Math.max(280, rect.height);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const centerLatLon = () => {
      const me = selfRef.current;
      return me ? [me.lat, me.lon] : [30.6598, 104.0633];
    };

    const toScreen = (lat: number, lon: number) => {
      const [glat, glon] = wgs84ToGcj02(lat, lon);
      const [clat, clon] = centerLatLon();
      const [gclat, gclon] = wgs84ToGcj02(clat, clon);
      const p = project(glat, glon, zoomRef.current);
      const c = project(gclat, gclon, zoomRef.current);
      return { x: p.x - c.x + cssW / 2, y: p.y - c.y + cssH / 2 };
    };

    const drawTiles = () => {
      const [clat, clon] = centerLatLon();
      const [gclat, gclon] = wgs84ToGcj02(clat, clon);
      const c = project(gclat, gclon, zoomRef.current);
      const left = c.x - cssW / 2;
      const top = c.y - cssH / 2;
      const max = 2 ** zoomRef.current;
      const startX = Math.floor(left / TILE);
      const endX = Math.floor((left + cssW) / TILE);
      const startY = Math.floor(top / TILE);
      const endY = Math.floor((top + cssH) / TILE);
      for (let x = startX; x <= endX; x += 1) {
        for (let y = startY; y <= endY; y += 1) {
          if (y < 0 || y >= max) continue;
          const wrapped = ((x % max) + max) % max;
          const img = getTile(zoomRef.current, wrapped, y);
          const dx = Math.floor(x * TILE - left);
          const dy = Math.floor(y * TILE - top);
          if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, dx, dy, TILE, TILE);
          else {
            ctx.fillStyle = '#0d1727';
            ctx.fillRect(dx, dy, TILE, TILE);
          }
        }
      }
    };

    const drawPeers = () => {
      const now = performance.now() / 1000;
      for (const peer of peersRef.current) {
        const p = toScreen(peer.lat, peer.lon);
        const r = 7;
        if (peer.sos) {
          const pulse = 1 + Math.sin(now * 4) * 0.25;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.4 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = peer.sos ? '#ef4444' : ROLE_COLOR[peer.role] || '#94a3b8';
        ctx.fill();
        ctx.strokeStyle = 'rgba(8, 15, 26, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '10px "Noto Sans SC", system-ui, sans-serif';
        ctx.textAlign = 'center';
        const label = peer.name;
        const width = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(6, 12, 21, 0.65)';
        ctx.fillRect(p.x - width / 2 - 2, p.y + r + 1, width + 4, 13);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(label, p.x, p.y + r + 11);
      }
    };

    const drawSelf = () => {
      const me = selfRef.current;
      if (!me) return;
      const p = toScreen(me.lat, me.lon);
      const metersPerPixel = (156543.03392 * Math.cos((me.lat * Math.PI) / 180)) / 2 ** zoomRef.current;
      const accuracyPx = Math.min(120, Math.max(10, me.accuracy / metersPerPixel));
      ctx.beginPath();
      ctx.arc(p.x, p.y, accuracyPx, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = 'rgba(8, 15, 26, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const draw = () => {
      ctx.fillStyle = '#071018';
      ctx.fillRect(0, 0, cssW, cssH);
      drawTiles();
      drawPeers();
      drawSelf();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="field-map">
      <canvas ref={canvasRef} aria-label="现场地图" />
      <div className="map-zoom">
        <button type="button" onClick={() => setZoom((z) => Math.min(17, z + 1))}>+</button>
        <button type="button" onClick={() => setZoom((z) => Math.max(12, z - 1))}>−</button>
      </div>
      <span className="map-zoom-label">z{zoom}</span>
    </div>
  );
}