export type LinkState = 'idle' | 'connecting' | 'connected' | 'error' | 'sim';

export interface Peer {
  id: string;
  name: string;
  role: string;
  lat: number;
  lon: number;
  battery: number;
  lastSeen: number;
  sos?: boolean;
}

export interface FieldMessage {
  id: string;
  direction: 'in' | 'out';
  text: string;
  ts: number;
  status: 'sent' | 'acked' | 'received' | 'failed';
}

export interface SelfPosition {
  lat: number;
  lon: number;
  accuracy: number;
  updatedAt: number;
}