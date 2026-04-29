/**
 * AGIIRISCHAT — WebSocket Server v3
 * Handles: voice PTT signaling, chat, location, meetup points, crew events
 *
 * Deploy on Render.com (free tier)
 * npm install ws
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'agiirischat' }));
});

const wss = new WebSocketServer({ server });

// rooms: { roomId: { clientId: { ws, name, userId } } }
const rooms = {};
// meetup points per room: { roomId: { lat, lng, label, setBy } }
const meetupPoints = {};

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
  return Object.entries(rooms[roomId] || {}).map(([id, c]) => ({
    id, name: c.name, userId: c.userId || null
  }));
}

wss.on('connection', (ws) => {
  let clientId = null, clientRoom = null, clientName = null, clientUserId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'join': {
        clientId = msg.id;
        clientRoom = msg.room;
        clientName = msg.name;
        clientUserId = msg.userId || null;

        if (!rooms[clientRoom]) rooms[clientRoom] = {};
        rooms[clientRoom][clientId] = { ws, name: clientName, userId: clientUserId };

        // Send existing members + current meetup point
        ws.send(JSON.stringify({
          type: 'room_state',
          members: getRoomMembers(clientRoom).filter(m => m.id !== clientId),
          meetupPoint: meetupPoints[clientRoom] || null
        }));

        broadcast(clientRoom, { type: 'peer_joined', id: clientId, name: clientName, userId: clientUserId }, clientId);
        console.log(`[+] ${clientName} joined "${clientRoom}"`);
        break;
      }

      case 'leave': {
        leave();
        break;
      }

      case 'list_rooms': {
        // Send back all active rooms with member counts
        const roomList = Object.entries(rooms).map(([name, members]) => ({
          name,
          count: Object.keys(members).length
        })).filter(r => r.count > 0);
        ws.send(JSON.stringify({ type: 'rooms_list', rooms: roomList }));
        break;
      }

      case 'chat':
        broadcast(clientRoom, { type: 'chat', id: clientId, name: clientName, text: msg.text }, clientId);
        break;

      case 'speaking':
        broadcast(clientRoom, { type: 'speaking', id: clientId, speaking: msg.speaking }, clientId);
        break;

      case 'photo':
        broadcast(clientRoom, { type: 'photo', id: clientId, name: clientName, data: msg.data }, clientId);
        break;

      case 'location':
        broadcast(clientRoom, { type: 'location', id: clientId, name: clientName, lat: msg.lat, lng: msg.lng }, clientId);
        break;

      // Meetup point — set by any crew member, broadcast to all
      case 'meetup_set': {
        const point = { lat: msg.lat, lng: msg.lng, label: msg.label || 'Punto de encuentro', setBy: clientName };
        meetupPoints[clientRoom] = point;
        broadcast(clientRoom, { type: 'meetup_update', point }, null); // include sender
        console.log(`[📍] Meetup set in "${clientRoom}" by ${clientName}`);
        break;
      }

      case 'meetup_clear': {
        delete meetupPoints[clientRoom];
        broadcast(clientRoom, { type: 'meetup_clear' }, null);
        break;
      }

      // WebRTC signaling
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

  ws.on('close', () => leave());
  ws.on('error', () => leave());

  function leave() {
    if (clientRoom && rooms[clientRoom] && clientId) {
      delete rooms[clientRoom][clientId];
      broadcast(clientRoom, { type: 'peer_left', id: clientId, name: clientName });
      if (Object.keys(rooms[clientRoom]).length === 0) {
        delete rooms[clientRoom];
        delete meetupPoints[clientRoom]; // clear meetup when room empty
      }
      console.log(`[-] ${clientName} left "${clientRoom}"`);
    }
  }
});

server.listen(PORT, () => {
  console.log(`📡 AGIIRISCHAT server running on port ${PORT}`);
});
