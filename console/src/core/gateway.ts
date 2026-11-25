import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings } from './types';
import type { PositionPayload, SosPayload, TextPayload } from './store';

export type GatewayStatus = 'off' | 'connecting' | 'online' | 'error';

export interface GatewayHandlers {
  onPosition: (payload: PositionPayload) => void;
  onText: (payload: TextPayload) => void;
  onSos: (payload: SosPayload) => void;
  onOffline: (nodeId: string) => void;
}

export function useGateway(settings: Settings, handlers: GatewayHandlers) {
  const [status, setStatus] = useState<GatewayStatus>('off');
  const [gatewayName, setGatewayName] = useState('');
  const [lastError, setLastError] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const url = settings.gatewayUrl.trim();
    if (!url) {
      setStatus('off');
      setGatewayName('');
      return;
    }
    let closed = false;
    let reconnectTimer = 0;

    const connect = () => {
      if (closed) return;
      setStatus('connecting');
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch {
        setStatus('error');
        setLastError('网关地址无效');
        return;
      }
      socketRef.current = socket;
      socket.onopen = () => {
        setStatus('online');
        setLastError('');
        socket.send(JSON.stringify({ type: 'auth', token: settings.token, channel: settings.channel }));
      };
      socket.onmessage = (event) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(data.type ?? '');
        if (type === 'hello') {
          setGatewayName(String(data.gateway ?? ''));
          return;
        }
        if (type === 'position') {
          handlersRef.current.onPosition(data as unknown as PositionPayload);
          return;
        }
        if (type === 'text') {
          handlersRef.current.onText(data as unknown as TextPayload);
          return;
        }
        if (type === 'sos') {
          handlersRef.current.onSos(data as unknown as SosPayload);
          return;
        }
        if (type === 'offline') {
          handlersRef.current.onOffline(String(data.nodeId ?? ''));
        }
      };
      socket.onerror = () => {
        setStatus('error');
        setLastError('网关连接失败');
      };
      socket.onclose = () => {
        if (closed) return;
        setStatus('error');
        retryRef.current = Math.min(15, retryRef.current + 1);
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
      setStatus('off');
    };
  }, [settings.gatewayUrl, settings.token, settings.channel]);

  const send = useCallback((payload: Record<string, unknown>): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  return { status, gatewayName, lastError, send };
}