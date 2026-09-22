import { WebSocketServer } from "ws";

const port = process.env.PORT || 3000;
const wss = new WebSocketServer({ port });
const rooms = new Map();

function sendToOthers(room, sender, message) {
  const peers = rooms.get(room) || new Set();
  for (const peer of peers) {
    if (peer !== sender && peer.readyState === 1) {
      peer.send(message);
    }
  }
}

wss.on("connection", (ws) => {
  let room = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      room = String(msg.room || "").trim();
      if (!room) return;

      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);

      ws.send(JSON.stringify({ type: "joined", room }));
      return;
    }

    if (room) sendToOthers(room, ws, raw.toString());
  });

  ws.on("close", () => {
    if (!room || !rooms.has(room)) return;
    rooms.get(room).delete(ws);
    if (rooms.get(room).size === 0) rooms.delete(room);
  });
});

console.log(`WiFi Call signaling server listening on port ${port}`);
