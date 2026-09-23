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


/* =========================
   WEB SERVER
========================= */

const server = http.createServer(
  (req, res) => {

    let url =
      req.url.split("?")[0];

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

    fs.readFile(
      filePath,
      (err, data) => {

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

      }
    );

  }
);


/* =========================
   WEBSOCKET
========================= */

const wss =
  new WebSocketServer({
    server
  });

const rooms =
  new Map();


wss.on(
  "connection",
  socket => {

    socket.on(
      "message",
      data => {

        let message;

        try {

          message =
            JSON.parse(
              data.toString()
            );

        } catch {

          return;

        }


        /* ĐĂNG KÝ */

        if (
          message.type ===
          "register"
        ) {

          const db =
            loadData();

          if (
            !message.username ||
            !message.password
          ) {

            socket.send(
              JSON.stringify({
                type:
                  "register-result",
                success:false,
                message:
                  "Thiếu tên đăng nhập hoặc mật khẩu"
              })
            );

            return;
          }


          const exists =
            db.users.find(
              user =>
                user.username ===
                message.username
            );


          if (exists) {

            socket.send(
              JSON.stringify({
                type:
                  "register-result",
                success:false,
                message:
                  "Tên đăng nhập đã tồn tại"
              })
            );

            return;
          }


          db.users.push({

            id:
              crypto.randomUUID(),

            username:
              message.username,

            password:
              hashPassword(
                message.password
              )

          });


          saveData(db);


          socket.send(
            JSON.stringify({

              type:
                "register-result",

              success:true,

              message:
                "Đăng ký thành công"

            })
          );

          return;
        }


        /* ĐĂNG NHẬP */

        if (
          message.type ===
          "login"
        ) {

          const db =
            loadData();


          const user =
            db.users.find(
              user =>
                user.username ===
                  message.username &&
                user.password ===
                  hashPassword(
                    message.password
                  )
            );


          if (!user) {

            socket.send(
              JSON.stringify({

                type:
                  "login-result",

                success:false,

                message:
                  "Sai tài khoản hoặc mật khẩu"

              })
            );

            return;
          }


          socket.user =
            user.username;


          socket.send(
            JSON.stringify({

              type:
                "login-result",

              success:true,

              username:
                user.username

            })
          );

          return;
        }


        /* VÀO PHÒNG */

        if (
          message.type ===
          "join"
        ) {

          socket.room =
            message.room;


          if (
            !rooms.has(
              socket.room
            )
          ) {

            rooms.set(
              socket.room,
              new Set()
            );

          }


          const room =
            rooms.get(
              socket.room
            );


          for (
            const peer of room
          ) {

            if (
              peer.readyState ===
              WebSocket.OPEN
            ) {

              peer.send(
                JSON.stringify({
                  type:
                    "peer-joined"
                })
              );

            }

          }


          room.add(socket);

          return;
        }


        /* CHAT */

        if (
          message.type ===
          "chat"
        ) {

          const db =
            loadData();


          const chatMessage = {

            id:
              crypto.randomUUID(),

            from:
              socket.user ||
              "Khách",

            text:
              message.text,

            time:
              Date.now()

          };


          db.messages.push(
            chatMessage
          );

          saveData(db);


          const room =
            rooms.get(
              socket.room
            );


          if (room) {

            for (
              const peer of room
            ) {

              if (
                peer.readyState ===
                WebSocket.OPEN
              ) {

                peer.send(
                  JSON.stringify({

                    type:
                      "chat",

                    message:
                      chatMessage

                  })
                );

              }

            }

          }

          return;
        }


        /* CHUYỂN WEBRTC */

        const room =
          rooms.get(
            socket.room
          );


        if (!room) return;


        for (
          const peer of room
        ) {

          if (
            peer !== socket &&
            peer.readyState ===
            WebSocket.OPEN
          ) {

            peer.send(
              data.toString()
            );

          }

        }

      }
    );


    socket.on(
      "close",
      () => {

        const room =
          rooms.get(
            socket.room
          );


        if (!room) return;


        room.delete(socket);


        for (
          const peer of room
        ) {

          if (
            peer.readyState ===
            WebSocket.OPEN
          ) {

            peer.send(
              JSON.stringify({
                type:
                  "peer-left"
              })
            );

          }

        }


        if (
          room.size === 0
        ) {

          rooms.delete(
            socket.room
          );

        }

      }
    );

  }
);


/* =========================
   START SERVER
========================= */

server.listen(
  PORT,
  () => {

    console.log(
      `WiFi Call server running on port ${PORT}`
    );

  }
);
