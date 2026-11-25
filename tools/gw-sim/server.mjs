// ResQNet 网关模拟器（无依赖）
// 用法：node tools/gw-sim/server.mjs
// 管理端设置里填 ws://127.0.0.1:8081/
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8081);
const clients = new Set();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('ResQNet gateway simulator: ws://127.0.0.1:' + PORT + '/\n');
});

function encodeFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function send(socket, obj) {
  if (socket.destroyed) return;
  socket.write(encodeFrame(JSON.stringify(obj)));
}

function broadcast(obj) {
  for (const socket of clients) send(socket, obj);
}

function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const b1 = buffer[offset];
    const b2 = buffer[offset + 1];
    const opcode = b1 & 0x0f;
    const masked = (b2 & 0x80) !== 0;
    let len = b2 & 0x7f;
    let pos = offset + 2;
    if (len === 126) {
      if (pos + 2 > buffer.length) break;
      len = buffer.readUInt16BE(pos);
      pos += 2;
    } else if (len === 127) {
      if (pos + 8 > buffer.length) break;
      len = Number(buffer.readBigUInt64BE(pos));
      pos += 8;
    }
    const maskKey = masked ? buffer.subarray(pos, pos + 4) : null;
    if (masked) pos += 4;
    if (pos + len > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(pos, pos + len));
    if (maskKey) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= maskKey[i % 4];
    }
    offset = pos + len;
    if (opcode === 0x8) frames.push({ type: 'close' });
    else if (opcode === 0x1) frames.push({ type: 'text', data: payload.toString('utf8') });
  }
  return { frames, rest: buffer.subarray(offset) };
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  clients.add(socket);
  console.log('[sim] client connected');
  send(socket, { type: 'hello', gateway: 'sim-gw', nodeId: 'sim1' });

  let pending = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    const { frames, rest } = decodeFrames(pending);
    pending = rest;
    for (const frame of frames) {
      if (frame.type === 'close') {
        socket.end();
        continue;
      }
      let msg;
      try {
        msg = JSON.parse(frame.data);
      } catch {
        continue;
      }
      if (msg.type === 'auth') {
        console.log('[sim] auth', msg.channel || '');
      }
      if (msg.type === 'command') {
        console.log('[sim] downlink ->', msg.to, msg.text);
        send(socket, { type: 'ack', messageId: msg.id, ok: true });
        if (msg.to !== '*') {
          send(socket, {
            type: 'text',
            nodeId: msg.to,
            name: '队员-01',
            text: `收到：${msg.text}`,
            ts: Date.now(),
          });
        }
      }
    }
  });
  socket.on('close', () => {
    clients.delete(socket);
    console.log('[sim] client disconnected');
  });
  socket.on('error', () => clients.delete(socket));
});

const nodes = [
  { nodeId: 'u1', name: '队员-01', callsign: 'BG8XXX', role: 'phone', lat: 30.6628, lon: 104.0643, battery: 0.82 },
  { nodeId: 'u2', name: '队员-02', callsign: 'BG8YYY', role: 'phone', lat: 30.6638, lon: 104.0653, battery: 0.46 },
  { nodeId: 'r1', name: '中继-山顶', role: 'relay', lat: 30.6658, lon: 104.0603, battery: 0.91 },
  { nodeId: 'd1', name: '无人机-01', role: 'drone', lat: 30.6618, lon: 104.0673, battery: 0.64 },
];

setInterval(() => {
  for (const node of nodes) {
    broadcast({
      type: 'position',
      ...node,
      lat: node.lat + (Math.random() - 0.5) * 0.0006,
      lon: node.lon + (Math.random() - 0.5) * 0.0006,
      battery: Math.max(0.1, node.battery - Math.random() * 0.001),
      ts: Date.now(),
    });
  }
}, 4000);

setTimeout(() => {
  broadcast({
    type: 'sos',
    nodeId: 'u2',
    name: '队员-02',
    lat: 30.6638,
    lon: 104.0653,
    note: '河道东侧，腿部受伤，需要担架',
    level: 3,
    ts: Date.now(),
  });
  console.log('[sim] sent SOS');
}, 6000);

setTimeout(() => {
  broadcast({ type: 'text', nodeId: 'u1', name: '队员-01', text: '已到达东岸，正在搜寻', ts: Date.now() });
}, 9000);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ResQNet gateway simulator on ws://127.0.0.1:${PORT}/`);
});