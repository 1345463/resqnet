import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConsoleNode, ConsoleState, Incident, IncidentStatus, Message, MessageStatus, Role, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'resqnet.console.v1';

function loadState(): ConsoleState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { nodes: [], incidents: [], messages: [], settings: DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ConsoleState>;
    return {
      nodes: parsed.nodes ?? [],
      incidents: parsed.incidents ?? [],
      messages: parsed.messages ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch {
    return { nodes: [], incidents: [], messages: [], settings: DEFAULT_SETTINGS };
  }
}

let seq = 1;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${seq++}`;

export interface PositionPayload {
  nodeId: string;
  name?: string;
  callsign?: string;
  role?: Role;
  lat: number;
  lon: number;
  battery?: number;
  ts?: number;
}

export interface TextPayload {
  nodeId: string;
  name?: string;
  text: string;
  ts?: number;
}

export interface SosPayload extends PositionPayload {
  note?: string;
  level?: 1 | 2 | 3;
}

export function useConsoleStore() {
  const [state, setState] = useState<ConsoleState>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  const upsertNode = useCallback((payload: PositionPayload) => {
    setState((prev) => {
      const now = payload.ts ?? Date.now();
      const index = prev.nodes.findIndex((n) => n.id === payload.nodeId);
      const base: ConsoleNode = index >= 0
        ? prev.nodes[index]
        : {
            id: payload.nodeId,
            name: payload.name ?? payload.nodeId,
            role: payload.role ?? 'phone',
            callsign: payload.callsign,
            lat: payload.lat,
            lon: payload.lon,
            battery: payload.battery ?? 1,
            online: true,
            lastSeen: now,
            source: 'gateway',
          };
      const next: ConsoleNode = {
        ...base,
        name: payload.name ?? base.name,
        callsign: payload.callsign ?? base.callsign,
        role: payload.role ?? base.role,
        lat: payload.lat,
        lon: payload.lon,
        battery: payload.battery ?? base.battery,
        online: true,
        lastSeen: now,
        source: 'gateway',
      };
      const nodes = [...prev.nodes];
      if (index >= 0) nodes[index] = next;
      else nodes.push(next);
      return { ...prev, nodes };
    });
  }, []);

  const ingestText = useCallback((payload: TextPayload) => {
    setState((prev) => {
      const message: Message = {
        id: nextId('in'),
        direction: 'in',
        nodeId: payload.nodeId,
        nodeName: payload.name ?? prev.nodes.find((n) => n.id === payload.nodeId)?.name ?? payload.nodeId,
        text: payload.text,
        status: 'received',
        ts: payload.ts ?? Date.now(),
      };
      const nodes = prev.nodes.map((n) =>
        n.id === payload.nodeId ? { ...n, lastSeen: Date.now(), online: true } : n
      );
      return { ...prev, nodes, messages: [message, ...prev.messages].slice(0, 500) };
    });
  }, []);

  const ingestSos = useCallback((payload: SosPayload) => {
    upsertNode(payload);
    setState((prev) => {
      const incident: Incident = {
        id: nextId('s'),
        nodeId: payload.nodeId,
        nodeName: payload.name ?? prev.nodes.find((n) => n.id === payload.nodeId)?.name ?? payload.nodeId,
        lat: payload.lat,
        lon: payload.lon,
        note: payload.note ?? '一键求救',
        level: payload.level ?? 3,
        status: 'open',
        createdAt: payload.ts ?? Date.now(),
      };
      return { ...prev, incidents: [incident, ...prev.incidents] };
    });
  }, [upsertNode]);

  const setNodeOffline = useCallback((nodeId: string) => {
    setState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, online: false } : n)),
    }));
  }, []);

  const createOutbound = useCallback((nodeId: string, nodeName: string, text: string) => {
    const message: Message = {
      id: nextId('out'),
      direction: 'out',
      nodeId,
      nodeName,
      text,
      status: 'queued',
      ts: Date.now(),
    };
    setState((prev) => ({ ...prev, messages: [message, ...prev.messages].slice(0, 500) }));
    return message.id;
  }, []);

  const setMessageStatus = useCallback((id: string, status: MessageStatus) => {
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => (m.id === id ? { ...m, status } : m)),
    }));
  }, []);

  const setIncidentStatus = useCallback((id: string, status: IncidentStatus) => {
    setState((prev) => ({
      ...prev,
      incidents: prev.incidents.map((i) =>
        i.id === id ? { ...i, status, ackedAt: status === 'responding' ? Date.now() : i.ackedAt } : i
      ),
    }));
  }, []);

  const addManualNode = useCallback((name: string, role: Role, lat: number, lon: number, callsign?: string) => {
    setState((prev) => ({
      ...prev,
      nodes: [
        ...prev.nodes,
        {
          id: nextId('m'),
          name,
          callsign,
          role,
          lat,
          lon,
          battery: 1,
          online: false,
          lastSeen: Date.now(),
          source: 'manual',
        },
      ],
    }));
  }, []);

  const removeNode = useCallback((id: string) => {
    setState((prev) => ({ ...prev, nodes: prev.nodes.filter((n) => n.id !== id) }));
  }, []);

  const loadDemo = useCallback(() => {
    const now = Date.now();
    const base: [number, number] = [30.6598, 104.0633];
    const nodes: ConsoleNode[] = [
      { id: 'cmd', name: '指挥车', role: 'command', lat: base[0] - 0.004, lon: base[1] - 0.006, battery: 0.92, online: true, lastSeen: now, source: 'gateway' },
      { id: 'r1', name: '中继-山顶', role: 'relay', lat: base[0] + 0.006, lon: base[1] - 0.003, battery: 0.81, online: true, lastSeen: now, source: 'gateway' },
      { id: 'd1', name: '无人机-01', role: 'drone', lat: base[0] + 0.002, lon: base[1] + 0.004, battery: 0.63, online: true, lastSeen: now, source: 'gateway' },
      { id: 'c1', name: '救援车-01', role: 'car', lat: base[0] - 0.002, lon: base[1] + 0.005, battery: 0.74, online: true, lastSeen: now, source: 'gateway' },
      { id: 'u1', name: '队员-01', callsign: 'BG8XXX', role: 'phone', lat: base[0] + 0.003, lon: base[1] + 0.001, battery: 0.55, online: true, lastSeen: now, source: 'gateway' },
      { id: 'u2', name: '队员-02', callsign: 'BG8YYY', role: 'phone', lat: base[0] + 0.004, lon: base[1] + 0.002, battery: 0.31, online: true, lastSeen: now, source: 'gateway' },
      { id: 'u3', name: '居民-07', role: 'phone', lat: base[0] - 0.001, lon: base[1] + 0.003, battery: 0.68, online: false, lastSeen: now - 9 * 60_000, source: 'gateway' },
    ];
    setState((prev) => ({
      ...prev,
      nodes,
      incidents: [
        {
          id: 'demo-sos-1',
          nodeId: 'u2',
          nodeName: '队员-02',
          lat: base[0] + 0.004,
          lon: base[1] + 0.002,
          note: '腿部受伤，需要担架',
          level: 3,
          status: 'open',
          createdAt: now - 4 * 60_000,
        },
      ],
      messages: [
        { id: 'demo-m1', direction: 'in', nodeId: 'u2', nodeName: '队员-02', text: '我们在河道东侧，两人受困', status: 'received', ts: now - 5 * 60_000 },
        { id: 'demo-m2', direction: 'out', nodeId: 'u2', nodeName: '队员-02', text: '收到，救援车已出发', status: 'sent', ts: now - 4 * 60_000 },
      ],
    }));
  }, []);

  const exportJson = useCallback(() => JSON.stringify(state, null, 2), [state]);

  const importJson = useCallback((raw: string) => {
    const parsed = JSON.parse(raw) as ConsoleState;
    setState({
      nodes: parsed.nodes ?? [],
      incidents: parsed.incidents ?? [],
      messages: parsed.messages ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    });
  }, []);

  const clearAll = useCallback(() => {
    setState((prev) => ({ nodes: [], incidents: [], messages: [], settings: prev.settings }));
  }, []);

  const actions = useMemo(
    () => ({
      patchSettings,
      upsertNode,
      ingestText,
      ingestSos,
      setNodeOffline,
      createOutbound,
      setMessageStatus,
      setIncidentStatus,
      addManualNode,
      removeNode,
      loadDemo,
      exportJson,
      importJson,
      clearAll,
    }),
    [patchSettings, upsertNode, ingestText, ingestSos, setNodeOffline, createOutbound, setMessageStatus, setIncidentStatus, addManualNode, removeNode, loadDemo, exportJson, importJson, clearAll]
  );

  return { state, actions };
}