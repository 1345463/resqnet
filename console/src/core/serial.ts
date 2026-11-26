import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings } from './types';
import type { GatewayHandlers, GatewayStatus } from './gateway';
import type { PositionPayload, SosPayload, TextPayload } from './store';

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface SerialNavigator {
  serial?: {
    requestPort(): Promise<SerialPortLike>;
  };
}

export function useSerial(settings: Settings, handlers: GatewayHandlers) {
  const [status, setStatus] = useState<GatewayStatus>('off');
  const [lastError, setLastError] = useState('');
  const [connected, setConnected] = useState(false);
  const portRef = useRef<SerialPortLike | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const aliveRef = useRef(false);

  const disconnect = useCallback(async () => {
    aliveRef.current = false;
    try {
      await readerRef.current?.cancel();
    } catch {
      // 端口可能已断开
    }
    readerRef.current = null;
    try {
      writerRef.current?.releaseLock();
    } catch {
      // writer 可能已失效
    }
    writerRef.current = null;
    try {
      await portRef.current?.close();
    } catch {
      // 端口可能已断开
    }
    portRef.current = null;
    setConnected(false);
    setStatus('off');
  }, []);

  const connect = useCallback(async () => {
    const nav = navigator as unknown as SerialNavigator;
    if (!nav.serial) {
      setStatus('error');
      setLastError('当前浏览器不支持 Web Serial，请用 Chrome/Edge 或桌面端');
      return;
    }
    try {
      setStatus('connecting');
      setLastError('');
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: settings.serialBaud || 115200 });
      if (!port.writable || !port.readable) throw new Error('串口不可读写');
      portRef.current = port;
      writerRef.current = port.writable.getWriter();
      aliveRef.current = true;
      setConnected(true);
      setStatus('online');

      const reader = port.readable.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      void (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            buffer += decoder.decode(value, { stream: true });
            let index = buffer.indexOf('\n');
            while (index >= 0) {
              const line = buffer.slice(0, index).trim();
              buffer = buffer.slice(index + 1);
              index = buffer.indexOf('\n');
              if (!line) continue;
              let data: Record<string, unknown>;
              try {
                data = JSON.parse(line) as Record<string, unknown>;
              } catch {
                continue;
              }
              const type = String(data.type ?? '');
              if (type === 'hello') {
                setLastError('');
              } else if (type === 'position') {
                handlersRef.current.onPosition(data as unknown as PositionPayload);
              } else if (type === 'text') {
                handlersRef.current.onText(data as unknown as TextPayload);
              } else if (type === 'sos') {
                handlersRef.current.onSos(data as unknown as SosPayload);
              } else if (type === 'offline') {
                handlersRef.current.onOffline(String(data.nodeId ?? ''));
              }
            }
          }
        } catch {
          // 读取异常在 finally 处理
        } finally {
          if (aliveRef.current) {
            aliveRef.current = false;
            setConnected(false);
            setStatus('error');
            setLastError('串口已断开');
          }
        }
      })();
    } catch (error) {
      setStatus('error');
      setLastError(error instanceof Error ? error.message : '串口连接失败');
    }
  }, [settings.serialBaud]);

  const send = useCallback((payload: Record<string, unknown>): boolean => {
    const writer = writerRef.current;
    if (!writer) return false;
    try {
      void writer.write(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => () => {
    void disconnect();
  }, [disconnect]);

  const supported = typeof navigator !== 'undefined' && 'serial' in navigator;

  return { status, lastError, send, connect, disconnect, connected, supported };
}