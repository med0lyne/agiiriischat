const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// HTTP server (Railway needs this to stay alive)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('AGIIRISCHAT OK');
});

// WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

const rooms = {};

function broadcast(roomId, msg, excludeId = null) {
  const room = rooms[roomId];
  if (!room) return;
  const data = JSON.stringify(msg);
  for (const [id, client] of Object.entries(room)) {
    if (id !== excludeId && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

function getRoomMembers(roomId) {
  return Object.entries(rooms[roomId] || {}).map(([id, c]) => ({ id, name: c.name }));
}

wss.on('connection', (ws) => {
  let clientId = null, clientRoom = null, clientName = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join': {
        clientId = msg.id;
        clientRoom = msg.room;
        clientName = msg.name;
        if (!rooms[clientRoom]) rooms[clientRoom] = {};
        rooms[clientRoom][clientId] = { ws, name: clientName };
        ws.send(JSON.stringify({
          type: 'room_members',
          members: getRoomMembers(clientRoom).filter(m => m.id !== clientId)
        }));
        broadcast(clientRoom, { type: 'peer_joined', id: clientId, name: clientName }, clientId);
        console.log(`[+] ${clientName} joined "${clientRoom}"`);
        break;
      }
      case 'leave': {
        if (clientRoom && rooms[clientRoom]) {
          delete rooms[clientRoom][clientId];
          broadcast(clientRoom, { type: 'peer_left', id: clientId, name: clientName });
          if (Object.keys(rooms[clientRoom]).length === 0) delete rooms[clientRoom];
        }
        break;
      }
      case 'chat':
        broadcast(clientRoom, { type: 'chat', id: clientId, name: clientName, text: msg.text }, clientId);
        break;
      case 'speaking':
        broadcast(clientRoom, { type: 'speaking', id: clientId, speaking: msg.speaking }, clientId);
        break;
      case 'photo':
        broadcast(clientRoom, { type: 'photo', id: clientId, name: clientName, data: msg.data, mime: msg.mime }, clientId);
        break;
      case 'location':
        broadcast(clientRoom, { type: 'location', id: clientId, name: clientName, lat: msg.lat, lng: msg.lng }, clientId);
        break;
      case 'offer':
      case 'answer':
      case 'ice': {
        const target = rooms[clientRoom]?.[msg.target];
        if (target && target.ws.readyState === 1) {
          target.ws.send(JSON.stringify({ ...msg, from: clientId }));
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (clientRoom && rooms[clientRoom] && clientId) {
      delete rooms[clientRoom][clientId];
      broadcast(clientRoom, { type: 'peer_left', id: clientId, name: clientName });
      if (Object.keys(rooms[clientRoom]).length === 0) delete rooms[clientRoom];
      console.log(`[x] ${clientName} disconnected`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`📡 AGIIRISCHAT server running on port ${PORT}`);
});
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// HTTP server (Railway needs this to stay alive)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('AGIIRISCHAT OK');
});

// WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

const rooms = {};

function broadcast(roomId, msg, excludeId = null) {
  const room = rooms[roomId];
  if (!room) return;
  const data = JSON.stringify(msg);
  for (const [id, client] of Object.entries(room)) {
    if (id !== excludeId && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

function getRoomMembers(roomId) {
  return Object.entries(rooms[roomId] || {}).map(([id, c]) => ({ id, name: c.name }));
}

wss.on('connection', (ws) => {
  let clientId = null, clientRoom = null, clientName = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join': {
        clientId = msg.id;
        clientRoom = msg.room;
        clientName = msg.name;
        if (!rooms[clientRoom]) rooms[clientRoom] = {};
        rooms[clientRoom][clientId] = { ws, name: clientName };
        ws.send(JSON.stringify({
          type: 'room_members',
          members: getRoomMembers(clientRoom).filter(m => m.id !== clientId)
        }));
        broadcast(clientRoom, { type: 'peer_joined', id: clientId, name: clientName }, clientId);
        console.log(`[+] ${clientName} joined "${clientRoom}"`);
        break;
      }
      case 'leave': {
        if (clientRoom && rooms[clientRoom]) {
          delete rooms[clientRoom][clientId];
          broadcast(clientRoom, { type: 'peer_left', id: clientId, name: clientName });
          if (Object.keys(rooms[clientRoom]).length === 0) delete rooms[clientRoom];
        }
        break;
      }
      case 'chat':
        broadcast(clientRoom, { type: 'chat', id: clientId, name: clientName, text: msg.text }, clientId);
        break;
      case 'speaking':
        broadcast(clientRoom, { type: 'speaking', id: clientId, speaking: msg.speaking }, clientId);
        break;
      case 'photo':
        broadcast(clientRoom, { type: 'photo', id: clientId, name: clientName, data: msg.data, mime: msg.mime }, clientId);
        break;
      case 'location':
        broadcast(clientRoom, { type: 'location', id: clientId, name: clientName, lat: msg.lat, lng: msg.lng }, clientId);
        break;
      case 'offer':
      case 'answer':
      case 'ice': {
        const target = rooms[clientRoom]?.[msg.target];
        if (target && target.ws.readyState === 1) {
          target.ws.send(JSON.stringify({ ...msg, from: clientId }));
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (clientRoom && rooms[clientRoom] && clientId) {
      delete rooms[clientRoom][clientId];
      broadcast(clientRoom, { type: 'peer_left', id: clientId, name: clientName });
      if (Object.keys(rooms[clientRoom]).length === 0) delete rooms[clientRoom];
      console.log(`[x] ${clientName} disconnected`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`📡 AGIIRISCHAT server running on port ${PORT}`);
});
