export type Role = 'phone' | 'relay' | 'drone' | 'car' | 'command' | 'gateway';

export interface ConsoleNode {
  id: string;
  name: string;
  callsign?: string;
  role: Role;
  lat: number;
  lon: number;
  battery: number;
  online: boolean;
  lastSeen: number;
  source: 'gateway' | 'manual';
}

export type IncidentStatus = 'open' | 'responding' | 'closed';

export interface Incident {
  id: string;
  nodeId: string;
  nodeName: string;
  lat: number;
  lon: number;
  note: string;
  level: 1 | 2 | 3;
  status: IncidentStatus;
  createdAt: number;
  ackedAt?: number;
}

export type MessageStatus = 'queued' | 'sent' | 'received' | 'failed';

export interface Message {
  id: string;
  direction: 'in' | 'out';
  nodeId: string;
  nodeName: string;
  text: string;
  status: MessageStatus;
  ts: number;
}

export type LinkSource = 'ws' | 'serial';

export interface Settings {
  source: LinkSource;
  gatewayUrl: string;
  serialBaud: number;
  token: string;
  channel: string;
  emergencyMode: boolean;
  callsign: string;
  authorizationRef: string;
  agency: string;
  bands: string;
  powerW: number;
  reportedAt: string;
  mapCenter: [number, number];
  mapZoom: number;
}

export interface ConsoleState {
  nodes: ConsoleNode[];
  incidents: Incident[];
  messages: Message[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  source: 'ws',
  gatewayUrl: '',
  serialBaud: 115200,
  token: '',
  channel: 'cmd',
  emergencyMode: false,
  callsign: '',
  authorizationRef: '',
  agency: '',
  bands: '430-440MHz / 144-148MHz',
  powerW: 5,
  reportedAt: '',
  mapCenter: [30.6598, 104.0633],
  mapZoom: 13,
};

export const ROLE_LABEL: Record<Role, string> = {
  phone: '终端',
  relay: '中继',
  drone: '无人机',
  car: '救援车',
  command: '指挥车',
  gateway: '网关',
};

export const ROLE_COLOR: Record<Role, string> = {
  phone: '#38bdf8',
  relay: '#34d399',
  drone: '#a78bfa',
  car: '#fbbf24',
  command: '#fb7185',
  gateway: '#22d3ee',
};