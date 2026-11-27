import { useCallback, useEffect, useRef, useState } from 'react';
import type { LinkState } from './types';

const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

interface BluetoothCharacteristicLike {
  value?: DataView;
  startNotifications(): Promise<BluetoothCharacteristicLike>;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
}

interface BluetoothDeviceLike {
  name?: string;
  gatt?: {
    connect(): Promise<{ getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike> }> }>;
  };
}

interface BluetoothNavigator {
  bluetooth?: {
    requestDevice(options: {
      filters: { namePrefix: string }[];
      optionalServices: string[];
    }): Promise<BluetoothDeviceLike>;
  };
}

export function useBle(onLine: (line: string) => void, onState: (state: LinkState, detail?: string) => void) {
  const [deviceName, setDeviceName] = useState('');
  const deviceRef = useRef<BluetoothDeviceLike | null>(null);
  const rxRef = useRef<BluetoothCharacteristicLike | null>(null);
  const txRef = useRef<BluetoothCharacteristicLike | null>(null);
  const bufferRef = useRef('');
  const handlerRef = useRef(onLine);
  handlerRef.current = onLine;
  const stateRef = useRef(onState);
  stateRef.current = onState;
  const notifyHandlerRef = useRef<((event: Event) => void) | null>(null);

  const supported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  const disconnect = useCallback(async () => {
    const tx = txRef.current;
    if (tx && notifyHandlerRef.current) {
      try {
        tx.removeEventListener('characteristicvaluechanged', notifyHandlerRef.current);
      } catch {
        // 忽略
      }
    }
    notifyHandlerRef.current = null;
    rxRef.current = null;
    txRef.current = null;
    bufferRef.current = '';
    stateRef.current('idle');
  }, []);

  const connect = useCallback(async () => {
    const nav = navigator as unknown as BluetoothNavigator;
    if (!nav.bluetooth) {
      stateRef.current('error', '当前浏览器不支持 Web Bluetooth（iOS 请用演示模式）');
      return;
    }
    try {
      stateRef.current('connecting');
      const device = await nav.bluetooth.requestDevice({
        filters: [{ namePrefix: 'ResQNet' }],
        optionalServices: [NUS_SERVICE],
      });
      deviceRef.current = device;
      setDeviceName(device.name ?? 'ResQNet-GW');
      const server = await device.gatt?.connect();
      if (!server) throw new Error('GATT 连接失败');
      const service = await server.getPrimaryService(NUS_SERVICE);
      const rx = await service.getCharacteristic(NUS_RX);
      const tx = await service.getCharacteristic(NUS_TX);
      rxRef.current = rx;
      txRef.current = tx;
      await tx.startNotifications();
      const handler = (event: Event) => {
        const target = event.target as unknown as { value?: DataView };
        if (!target.value) return;
        const decoder = new TextDecoder();
        bufferRef.current += decoder.decode(target.value, { stream: true });
        let index = bufferRef.current.indexOf('\n');
        while (index >= 0) {
          const line = bufferRef.current.slice(0, index).trim();
          bufferRef.current = bufferRef.current.slice(index + 1);
          index = bufferRef.current.indexOf('\n');
          if (line) handlerRef.current(line);
        }
      };
      notifyHandlerRef.current = handler;
      tx.addEventListener('characteristicvaluechanged', handler);
      stateRef.current('connected');
    } catch (error) {
      stateRef.current('error', error instanceof Error ? error.message : '蓝牙连接失败');
    }
  }, []);

  const send = useCallback(async (payload: Record<string, unknown>): Promise<boolean> => {
    const rx = rxRef.current;
    if (!rx) return false;
    const data = new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
    try {
      for (let offset = 0; offset < data.length; offset += 20) {
        const chunk = data.slice(offset, offset + 20);
        if (rx.writeValueWithoutResponse) await rx.writeValueWithoutResponse(chunk);
        else await rx.writeValue(chunk);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => () => {
    void disconnect();
  }, [disconnect]);

  return { connect, disconnect, send, supported, deviceName };
}