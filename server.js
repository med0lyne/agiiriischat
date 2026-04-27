/**
 * SQUAD RADIO — Servidor de señalización WebRTC
 * Sin dependencias externas. Solo Node.js built-ins.
 * 
 * Uso: node server.js
 * Puerto: 3000 (o PORT env var)
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ─── WebSocket manual (RFC 6455) ─────────────────────────────────────────────
class WSServer {
  constructor(httpServer) {
    this.clients = new Map(); // socket -> { id, name, room, send }
    httpServer.on('upgrade', (req, socket, head) => this._upgrade(req, socket, head));
  }

  _upgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }

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

    socket.on('data', buf => this._onData(socket, buf));
    socket.on('close', () => this._onClose(socket));
    socket.on('error', () => this._onClose(socket));

    const send = (obj) => this._send(socket, JSON.stringify(obj));
    this.clients.set(socket, { send, name: '', room: '', id: '' });
    this.emit('connection', socket, send);
  }

  _send(socket, text) {
    try {
      const payload = Buffer.from(text, 'utf8');
      const len = payload.length;
      let header;
      if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81; header[1] = len;
      } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81; header[1] = 126;
        header.writeUInt16BE(len, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81; header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
      }
      socket.write(Buffer.concat([header, payload]));
    } catch(e) {}
  }

  _onData(socket, buf) {
    try {
      let offset = 0;
      while (offset < buf.length) {
        const fin = (buf[offset] & 0x80) !== 0;
        const opcode = buf[offset] & 0x0f;
        offset++;
        if (opcode === 0x8) { this._onClose(socket); return; } // close
        if (opcode === 0x9) { this._send(socket, ''); return; } // ping -> ignore (pong would need opcode 0xA)

        const masked = (buf[offset] & 0x80) !== 0;
        let payloadLen = buf[offset] & 0x7f;
        offset++;

        if (payloadLen === 126) { payloadLen = buf.readUInt16BE(offset); offset += 2; }
        else if (payloadLen === 127) { payloadLen = Number(buf.readBigUInt64BE(offset)); offset += 8; }

        let payload;
        if (masked) {
          const mask = buf.slice(offset, offset + 4); offset += 4;
          payload = Buffer.alloc(payloadLen);
          for (let i = 0; i < payloadLen; i++) payload[i] = buf[offset + i] ^ mask[i % 4];
          offset += payloadLen;
        } else {
          payload = buf.slice(offset, offset + payloadLen);
          offset += payloadLen;
        }

        if (opcode === 0x1 || opcode === 0x0) {
          try {
            const msg = JSON.parse(payload.toString('utf8'));
            this.emit('message', socket, msg);
          } catch(e) {}
        }
      }
    } catch(e) {}
  }

  _onClose(socket) {
    if (!this.clients.has(socket)) return;
    this.emit('close', socket);
    this.clients.delete(socket);
    try { socket.destroy(); } catch(e) {}
  }

  emit(event, ...args) {
    if (this._handlers && this._handlers[event]) {
      this._handlers[event].forEach(fn => fn(...args));
    }
  }

  on(event, fn) {
    if (!this._handlers) this._handlers = {};
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(fn);
  }
}

// ─── HTTP Server (sirve el cliente) ──────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const clientPath = path.join(__dirname, 'client.html');
    if (fs.existsSync(clientPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(clientPath));
    } else {
      res.writeHead(404); res.end('client.html not found');
    }
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

// ─── Signaling logic ─────────────────────────────────────────────────────────
const wss = new WSServer(server);
const rooms = new Map(); // roomId -> Map<clientId, socket>

function getRoomMembers(roomId) {
  return rooms.get(roomId) || new Map();
}

function broadcastToRoom(roomId, msg, exceptId = null) {
  const members = getRoomMembers(roomId);
  for (const [cid, sock] of members) {
    if (cid === exceptId) continue;
    const client = wss.clients.get(sock);
    if (client) client.send(msg);
  }
}

wss.on('connection', (socket, send) => {
  console.log('[+] Cliente conectado');
});

wss.on('message', (socket, msg) => {
  const client = wss.clients.get(socket);
  if (!client) return;

  switch (msg.type) {
    case 'join': {
      const { id, name, room } = msg;
      client.id = id;
      client.name = name;
      client.room = room;

      if (!rooms.has(room)) rooms.set(room, new Map());
      const roomMap = rooms.get(room);

      // Send existing members list to newcomer
      const existingMembers = [];
      for (const [cid, sock] of roomMap) {
        const c = wss.clients.get(sock);
        if (c) existingMembers.push({ id: cid, name: c.name });
      }
      client.send({ type: 'room_members', members: existingMembers });

      // Add to room
      roomMap.set(id, socket);

      // Notify others
      broadcastToRoom(room, { type: 'peer_joined', id, name }, id);

      console.log(`[JOIN] ${name} (${id}) -> room:${room} | members: ${roomMap.size}`);
      break;
    }

    case 'leave': {
      handleLeave(socket, client);
      break;
    }

    case 'chat': {
      broadcastToRoom(client.room, { type: 'chat', id: client.id, name: client.name, text: msg.text }, client.id);
      break;
    }

    case 'speaking': {
      broadcastToRoom(client.room, { type: 'speaking', id: client.id, speaking: msg.speaking }, client.id);
      break;
    }

    // WebRTC signaling — relay to specific peer
    case 'offer':
    case 'answer':
    case 'ice': {
      const targetSocket = getRoomMembers(client.room).get(msg.target);
      if (targetSocket) {
        const targetClient = wss.clients.get(targetSocket);
        if (targetClient) {
          targetClient.send({ ...msg, from: client.id });
        }
      }
      break;
    }
  }
});

wss.on('close', (socket) => {
  const client = wss.clients.get(socket);
  if (client && client.id) handleLeave(socket, client);
  console.log('[-] Cliente desconectado');
});

function handleLeave(socket, client) {
  if (!client.room || !client.id) return;
  const roomMap = rooms.get(client.room);
  if (roomMap) {
    roomMap.delete(client.id);
    if (roomMap.size === 0) rooms.delete(client.room);
    else broadcastToRoom(client.room, { type: 'peer_left', id: client.id, name: client.name });
  }
  client.room = '';
  client.id = '';
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║        SQUAD RADIO — SERVIDOR        ║`);
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║  http://localhost:${PORT}              ║`);
  console.log(`║  Comparte tu IP local a tus amigos   ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
  
  // Show local IP
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  → En tu red local: http://${net.address}:${PORT}`);
      }
    }
  }
  console.log('');
});
