const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = {};

const server = http.createServer(function(req, res) {
  res.writeHead(200);
  res.end("OK");
});

const wss = new WebSocketServer({ server: server });

wss.on("connection", function(ws) {
  var clientId = null;
  var clientRoom = null;
  var clientName = null;

  ws.on("message", function(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }

    if (msg.type === "join") {
      clientId = msg.id;
      clientRoom = msg.room;
      clientName = msg.name;
      if (!rooms[clientRoom]) rooms[clientRoom] = {};
      rooms[clientRoom][clientId] = { ws: ws, name: clientName };
      var others = [];
      Object.keys(rooms[clientRoom]).forEach(function(id) {
        if (id !== clientId) others.push({ id: id, name: rooms[clientRoom][id].name });
      });
      ws.send(JSON.stringify({ type: "room_members", members: others }));
      broadcast(clientRoom, { type: "peer_joined", id: clientId, name: clientName }, clientId);

    } else if (msg.type === "leave") {
      leave();

    } else if (msg.type === "chat") {
      broadcast(clientRoom, { type: "chat", id: clientId, name: clientName, text: msg.text }, clientId);

    } else if (msg.type === "speaking") {
      broadcast(clientRoom, { type: "speaking", id: clientId, speaking: msg.speaking }, clientId);

    } else if (msg.type === "photo") {
      broadcast(clientRoom, { type: "photo", id: clientId, name: clientName, data: msg.data }, clientId);

    } else if (msg.type === "location") {
      broadcast(clientRoom, { type: "location", id: clientId, name: clientName, lat: msg.lat, lng: msg.lng }, clientId);

    } else if (msg.type === "offer" || msg.type === "answer" || msg.type === "ice") {
      if (rooms[clientRoom] && rooms[clientRoom][msg.target]) {
        var t = rooms[clientRoom][msg.target];
        if (t.ws.readyState === 1) {
          msg.from = clientId;
          t.ws.send(JSON.stringify(msg));
        }
      }
    }
  });

  ws.on("close", function() {
    leave();
  });

  function leave() {
    if (clientRoom && rooms[clientRoom] && clientId) {
      delete rooms[clientRoom][clientId];
      broadcast(clientRoom, { type: "peer_left", id: clientId, name: clientName });
      if (Object.keys(rooms[clientRoom]).length === 0) delete rooms[clientRoom];
    }
  }
});

function broadcast(roomId, msg, excludeId) {
  var room = rooms[roomId];
  if (!room) return;
  var data = JSON.stringify(msg);
  Object.keys(room).forEach(function(id) {
    if (id !== excludeId && room[id].ws.readyState === 1) {
      room[id].ws.send(data);
    }
  });
}

server.listen(PORT, function() {
  console.log("AGIIRISCHAT running on port " + PORT);
});
