import { useEffect, useMemo, useRef, useState } from 'react';
import { MeshEngine } from '../core/engine';
import type { ScenarioKey } from '../core/types';

export function useSimulation() {
  const engineRef = useRef<MeshEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new MeshEngine('urban');
    if (import.meta.env.DEV) {
      (window as unknown as { __resq?: MeshEngine }).__resq = engineRef.current;
    }
  }
  const engine = engineRef.current;
  const [snap, setSnap] = useState(() => engine.getSnapshot());

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastSnap = 0;
    const auto = new URLSearchParams(window.location.search).get('auto') === '1';
    const timers: number[] = [];
    if (auto) {
      const command = engine.nodes.find((node) => node.role === 'command');
      const phones = engine.nodes.filter((node) => node.role === 'phone');
      if (command && phones.length > 0) {
        const far = phones.reduce((best, node) => {
          const d = Math.hypot(node.x - command.x, node.y - command.y);
          const bestD = Math.hypot(best.x - command.x, best.y - command.y);
          return d > bestD ? node : best;
        }, phones[0]);
        timers.push(window.setTimeout(() => engine.sendSOS(far.id), 1500));
        timers.push(window.setTimeout(() => engine.sendText(far.id, '这里是演示消息：需要医疗与担架支援'), 6500));
      }
    }
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      engine.tick(dt);
      if (now - lastSnap > 220) {
        lastSnap = now;
        setSnap(engine.getSnapshot());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [engine]);

  const actions = useMemo(
    () => ({
      select: (id: string | null) => {
        engine.select(id);
        setSnap(engine.getSnapshot());
      },
      setScenario: (key: ScenarioKey) => {
        engine.load(key);
        setSnap(engine.getSnapshot());
      },
      toggleNode: (id: string) => {
        engine.toggleNode(id);
        setSnap(engine.getSnapshot());
      },
      toggleRelay: () => {
        engine.toggleShowRelay();
        setSnap(engine.getSnapshot());
      },
      sendText: (id: string, text: string) => {
        engine.sendText(id, text);
        setSnap(engine.getSnapshot());
      },
      sendSOS: (id: string) => {
        engine.sendSOS(id);
        setSnap(engine.getSnapshot());
      },
      sendVoice: (id: string, url: string, duration: number) => {
        engine.sendVoice(id, url, duration);
        setSnap(engine.getSnapshot());
      },
    }),
    [engine]
  );

  return { engine, snap, actions };
}