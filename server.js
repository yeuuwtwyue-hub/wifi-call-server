import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const file = path.join(__dirname, "public", "index.html");

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end("Cannot load app");
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });
      res.end(data);
    });

    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

wss.on("connection", (socket) => {
  socket.on("message", (data) => {
    let message;

    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (message.type === "join") {
      socket.room = message.room;

      if (!rooms.has(socket.room)) {
        rooms.set(socket.room, new Set());
      }

      const room = rooms.get(socket.room);

      for (const peer of room) {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            type: "peer-joined"
          }));
        }
      }

      room.add(socket);
      return;
    }

    const room = rooms.get(socket.room);
    if (!room) return;

    for (const peer of room) {
      if (
        peer !== socket &&
        peer.readyState === WebSocket.OPEN
      ) {
        peer.send(data.toString());
      }
    }
  });

  socket.on("close", () => {
    const room = rooms.get(socket.room);
    if (!room) return;

    room.delete(socket);

    for (const peer of room) {
      if (peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({
          type: "peer-left"
        }));
      }
    }

    if (room.size === 0) {
      rooms.delete(socket.room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`WiFi Call server running on port ${PORT}`);
});
