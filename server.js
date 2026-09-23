import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { users: [], messages: [], groups: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const server = http.createServer((req, res) => {
  let url = req.url.split("?")[0];

  if (url === "/") {
    url = "/index.html";
  }

  const filePath = path.join(__dirname, "public", url);

  if (!filePath.startsWith(path.join(__dirname, "public"))) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not Found");
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

wss.on("connection", socket => {
  socket.on("message", data => {
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
          peer.send(JSON.stringify({ type: "peer-joined" }));
        }
      }

      room.add(socket);
      return;
    }

    const room = rooms.get(socket.room);

    if (!room) return;

    for (const peer of room) {
      if (peer !== socket && peer.readyState === WebSocket.OPEN) {
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
        peer.send(JSON.stringify({ type: "peer-left" }));
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
