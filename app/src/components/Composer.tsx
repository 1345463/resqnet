import { useEffect, useRef, useState } from 'react';
import type { Channel, SimNode } from '../core/types';

interface Props {
  node: SimNode | null;
  channel: Channel;
  onChannel: (channel: Channel) => void;
  onSendText: (text: string) => void;
  onSendSOS: () => void;
  onSendVoice: (url: string, duration: number) => void;
  onBeidou: () => void;
  onNearfield: () => void;
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

function makeBeep(seconds = 2.4): string {
  const sampleRate = 8000;
  const total = Math.floor(seconds * sampleRate);
  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + total * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, total * 2, true);
  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 4) * Math.min(1, (seconds - t) * 4);
    const tone = Math.sin(2 * Math.PI * 520 * t) * 0.22 + Math.sin(2 * Math.PI * 780 * t) * 0.1;
    view.setInt16(44 + i * 2, tone * env * 32767, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export function Composer({ node, channel, onChannel, onSendText, onSendSOS, onSendVoice, onBeidou, onNearfield }: Props) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [hint, setHint] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((performance.now() - startedRef.current) / 1000));
    }, 200);
    return () => window.clearInterval(timer);
  }, [recording]);

  async function startRecording() {
    setHint('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const duration = Math.max(0.6, (performance.now() - startedRef.current) / 1000);
        onSendVoice(URL.createObjectURL(blob), duration);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setSeconds(0);
      };
      recorderRef.current = recorder;
      startedRef.current = performance.now();
      recorder.start();
      setRecording(true);
    } catch {
      setHint('无法访问麦克风，可用右侧「模拟语音」按钮演示');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <section className="composer panel">
      <div className="composer-head">
        <span className="composer-target">
          {node ? `当前节点：${node.name}` : '请先在左侧或地图上选择节点'}
        </span>
        <button type="button" className="sos-btn" disabled={!node} onClick={onSendSOS}>
          SOS 求救
        </button>
      </div>
      <div className="composer-row">
        <select value={channel} onChange={(e) => onChannel(e.target.value as Channel)} disabled={!node}>
          <option value="public">公共频道</option>
          <option value="team">队伍频道（E2EE）</option>
        </select>
        <button type="button" className="ghost" disabled={!node} onClick={onBeidou}>
          北斗求救
        </button>
        <button type="button" className="ghost" disabled={!node} onClick={onNearfield}>
          近场语音
        </button>
      </div>
      <div className="composer-row">
        <input
          value={text}
          placeholder="输入文字，发给指挥车（多跳转发）"
          disabled={!node}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && text.trim()) {
              onSendText(text);
              setText('');
            }
          }}
        />
        <button
          type="button"
          className="primary"
          disabled={!node || !text.trim()}
          onClick={() => {
            onSendText(text);
            setText('');
          }}
        >
          发送
        </button>
      </div>
      <div className="composer-row">
        <button
          type="button"
          className={`voice-btn ${recording ? 'is-recording' : ''}`}
          disabled={!node}
          onClick={() => {
            if (recording) stopRecording();
            else void startRecording();
          }}
        >
          {recording ? `停止并发送 · ${seconds}s` : '按住说话（点击录音）'}
        </button>
        <button type="button" className="ghost" disabled={!node} onClick={() => onSendVoice(makeBeep(2.4), 2.4)}>
          模拟语音
        </button>
      </div>
      {hint && <p className="composer-hint">{hint}</p>}
    </section>
  );
}