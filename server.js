import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    return JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch {
    return {
      users: [],
      messages: [],
      groups: []
    };
  }
}

function saveData(data) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );
}

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");
}

/* ================= HTTP ================= */

const server = http.createServer((req, res) => {

  let url = req.url.split("?")[0];

  if (url === "/") {
    url = "/index.html";
  }

  const publicDir =
    path.join(__dirname, "public");

  const filePath =
    path.join(publicDir, url);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {

    if (err) {
      res.writeHead(404);
      return res.end("Not Found");
    }

    let type =
      "text/html; charset=utf-8";

    if (filePath.endsWith(".css")) {
      type = "text/css";
    }

    if (filePath.endsWith(".js")) {
      type = "application/javascript";
    }

    res.writeHead(200, {
      "Content-Type": type
    });

    res.end(data);

  });

});

/* ================= WEBSOCKET ================= */

const wss =
  new WebSocketServer({
    server
  });

const rooms = new Map();

/* ================= CONNECTION ================= */

wss.on("connection", socket => {

  socket.user = null;
  socket.room = null;

  socket.on("message", raw => {

    let message;

    try {
      message =
        JSON.parse(raw.toString());
    } catch {
      return;
    }

    /* ================= REGISTER ================= */

    if (message.type === "register") {

      const db = loadData();

      const username =
        String(message.username || "")
          .trim();

      const password =
        String(message.password || "");

      if (!username || !password) {

        socket.send(
          JSON.stringify({
            type: "register-result",
            success: false,
            message:
              "Vui lòng nhập đầy đủ"
          })
        );

        return;
      }

      if (username.length < 3) {

        socket.send(
          JSON.stringify({
            type: "register-result",
            success: false,
            message:
              "Tên đăng nhập phải có ít nhất 3 ký tự"
          })
        );

        return;
      }

      if (password.length < 4) {

        socket.send(
          JSON.stringify({
            type: "register-result",
            success: false,
            message:
              "Mật khẩu phải có ít nhất 4 ký tự"
          })
        );

        return;
      }

      const exists =
        db.users.find(
          user =>
            user.username.toLowerCase() ===
            username.toLowerCase()
        );

      if (exists) {

        socket.send(
          JSON.stringify({
            type: "register-result",
            success: false,
            message:
              "Tên đăng nhập đã tồn tại"
          })
        );

        return;
      }

      const user = {
        id: crypto.randomUUID(),
        username,
        password:
          hashPassword(password)
      };

      db.users.push(user);

      saveData(db);

      socket.send(
        JSON.stringify({
          type: "register-result",
          success: true,
          message:
            "Đăng ký thành công"
        })
      );

      return;
    }

    /* ================= LOGIN ================= */

    if (message.type === "login") {

      const db = loadData();

      const username =
        String(message.username || "")
          .trim();

      const password =
        String(message.password || "");

      const user =
        db.users.find(
          item =>
            item.username === username &&
            item.password ===
              hashPassword(password)
        );

      if (!user) {

        socket.send(
          JSON.stringify({
            type: "login-result",
            success: false,
            message:
              "Sai tài khoản hoặc mật khẩu"
          })
        );

        return;
      }

      socket.user = user.username;

      socket.send(
        JSON.stringify({
          type: "login-result",
          success: true,
          username: user.username
        })
      );

      return;
    }

    /* ================= AUTO LOGIN ================= */

    /*
      Bản này vẫn xác thực lại tài khoản
      qua username + token phiên.

      Token được tạo khi client yêu cầu
      và không chứa mật khẩu.
    */

    if (message.type === "session-login") {

      const db = loadData();

      const username =
        String(message.username || "")
          .trim();

      const token =
        String(message.token || "");

      if (!username || !token) {

        socket.send(
          JSON.stringify({
            type: "session-result",
            success: false
          })
        );

        return;
      }

      const user =
        db.users.find(
          item =>
            item.username === username &&
            item.sessionToken === token
        );

      if (!user) {

        socket.send(
          JSON.stringify({
            type: "session-result",
            success: false
          })
        );

        return;
      }

      socket.user =
        user.username;

      socket.send(
        JSON.stringify({
          type: "session-result",
          success: true,
          username:
            user.username
        })
      );

      return;
    }

    /* ================= CREATE SESSION ================= */

    if (message.type === "create-session") {

      const db = loadData();

      const username =
        String(message.username || "")
          .trim();

      const password =
        String(message.password || "");

      const user =
        db.users.find(
          item =>
            item.username === username &&
            item.password ===
              hashPassword(password)
        );

      if (!user) {

        socket.send(
          JSON.stringify({
            type: "session-created",
            success: false
          })
        );

        return;
      }

      const token =
        crypto.randomBytes(32)
          .toString("hex");

      user.sessionToken = token;

      saveData(db);

      socket.user =
        user.username;

      socket.send(
        JSON.stringify({
          type: "session-created",
          success: true,
          username:
            user.username,
          token
        })
      );

      return;
    }

    /* ================= LOGOUT ================= */

    if (message.type === "logout") {

      const db = loadData();

      if (socket.user) {

        const user =
          db.users.find(
            item =>
              item.username ===
              socket.user
          );

        if (user) {
          delete user.sessionToken;
        }

        saveData(db);
      }

      socket.user = null;

      socket.send(
        JSON.stringify({
          type: "logout-result",
          success: true
        })
      );

      return;
    }

    /* ================= JOIN ROOM ================= */

    if (message.type === "join") {

      const roomName =
        String(message.room || "")
          .trim();

      if (!roomName) {
        return;
      }

      /* rời phòng cũ */

      if (socket.room) {

        const oldRoom =
          rooms.get(socket.room);

        if (oldRoom) {

          oldRoom.delete(socket);

          for (const peer of oldRoom) {

            if (
              peer.readyState ===
              WebSocket.OPEN
            ) {

              peer.send(
                JSON.stringify({
                  type: "peer-left"
                })
              );

            }

          }

          if (oldRoom.size === 0) {
            rooms.delete(socket.room);
          }
        }
      }

      socket.room =
        roomName;

      if (!rooms.has(roomName)) {

        rooms.set(
          roomName,
          new Set()
        );

      }

      const room =
        rooms.get(roomName);

      for (const peer of room) {

        if (
          peer.readyState ===
          WebSocket.OPEN
        ) {

          peer.send(
            JSON.stringify({
              type: "peer-joined"
            })
          );

        }

      }

      room.add(socket);

      return;
    }

    /* ================= CHAT ================= */

    if (message.type === "chat") {

      if (!socket.user) {
        return;
      }

      if (!socket.room) {
        return;
      }

      const text =
        String(message.text || "")
          .trim();

      if (!text) {
        return;
      }

      const db = loadData();

      const chatMessage = {
        id:
          crypto.randomUUID(),

        from:
          socket.user,

        text,

        time:
          Date.now(),

        room:
          socket.room
      };

      db.messages.push(
        chatMessage
      );

      saveData(db);

      const room =
        rooms.get(socket.room);

      if (!room) {
        return;
      }

      for (const peer of room) {

        if (
          peer.readyState ===
          WebSocket.OPEN
        ) {

          peer.send(
            JSON.stringify({
              type: "chat",
              message:
                chatMessage
            })
          );

        }

      }

      return;
    }

    /* ================= WEBRTC ================= */

    const room =
      rooms.get(socket.room);

    if (!room) {
      return;
    }

    for (const peer of room) {

      if (
        peer !== socket &&
        peer.readyState ===
        WebSocket.OPEN
      ) {

        peer.send(
          raw.toString()
        );

      }

    }

  });


  /* ================= CLOSE ================= */

  socket.on("close", () => {

    const room =
      rooms.get(socket.room);

    if (!room) {
      return;
    }

    room.delete(socket);

    for (const peer of room) {

      if (
        peer.readyState ===
        WebSocket.OPEN
      ) {

        peer.send(
          JSON.stringify({
            type: "peer-left"
          })
        );

      }

    }

    if (room.size === 0) {

      rooms.delete(
        socket.room
      );

    }

  });

});


/* ================= START ================= */

server.listen(
  PORT,
  () => {

    console.log(
      `WiFi Call server running on port ${PORT}`
    );

  }
);
