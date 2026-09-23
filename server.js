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

/* =========================
   DATABASE
========================= */

function loadData() {
  try {
    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    if (!Array.isArray(data.users))
      data.users = [];

    if (!Array.isArray(data.messages))
      data.messages = [];

    if (!Array.isArray(data.friendRequests))
      data.friendRequests = [];

    return data;

  } catch {
    return {
      users: [],
      messages: [],
      friendRequests: []
    };
  }
}

function saveData(data) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );
}


/* =========================
   PASSWORD
========================= */

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");
}


/* =========================
   HELPERS
========================= */

function findUser(db, username) {
  return db.users.find(
    u =>
      u.username.toLowerCase() ===
      String(username).toLowerCase()
  );
}

function areFriends(user1, user2) {

  if (!user1 || !user2) return false;

  const a = Array.isArray(user1.friends)
    ? user1.friends
    : [];

  const b = Array.isArray(user2.friends)
    ? user2.friends
    : [];

  return (
    a.includes(user2.username) &&
    b.includes(user1.username)
  );
}

function send(socket, data) {

  if (
    socket &&
    socket.readyState === WebSocket.OPEN
  ) {
    socket.send(
      JSON.stringify(data)
    );
  }
}


/* =========================
   HTTP
========================= */

const server = http.createServer(
  (req, res) => {

    let url = req.url.split("?")[0];

    if (url === "/")
      url = "/index.html";

    const publicDir =
      path.join(__dirname, "public");

    const filePath =
      path.join(publicDir, url);

    if (!filePath.startsWith(publicDir)) {

      res.writeHead(403);

      return res.end(
        "Forbidden"
      );
    }

    fs.readFile(
      filePath,
      (err, data) => {

        if (err) {

          res.writeHead(404);

          return res.end(
            "Not Found"
          );
        }

        let type =
          "text/html; charset=utf-8";

        if (filePath.endsWith(".css"))
          type = "text/css";

        if (filePath.endsWith(".js"))
          type = "application/javascript";

        if (filePath.endsWith(".json"))
          type = "application/json";

        res.writeHead(
          200,
          {
            "Content-Type": type
          }
        );

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

const onlineUsers =
  new Map();


wss.on(
  "connection",
  socket => {

    socket.user = null;
    socket.room = null;


    socket.on(
      "message",
      raw => {

        let message;

        try {

          message =
            JSON.parse(
              raw.toString()
            );

        } catch {

          return;

        }


        /* =====================
           REGISTER
        ===================== */

        if (
          message.type ===
          "register"
        ) {

          const db =
            loadData();

          const username =
            String(
              message.username || ""
            ).trim();

          const password =
            String(
              message.password || ""
            );


          if (
            !username ||
            !password
          ) {

            send(
              socket,
              {
                type:
                  "register-result",
                success:false,
                message:
                  "Vui lòng nhập đầy đủ"
              }
            );

            return;
          }


          if (
            username.length < 3
          ) {

            send(
              socket,
              {
                type:
                  "register-result",
                success:false,
                message:
                  "Tên đăng nhập ít nhất 3 ký tự"
              }
            );

            return;
          }


          if (
            password.length < 4
          ) {

            send(
              socket,
              {
                type:
                  "register-result",
                success:false,
                message:
                  "Mật khẩu ít nhất 4 ký tự"
              }
            );

            return;
          }


          if (
            findUser(
              db,
              username
            )
          ) {

            send(
              socket,
              {
                type:
                  "register-result",
                success:false,
                message:
                  "Tên đăng nhập đã tồn tại"
              }
            );

            return;
          }


          const user = {

            id:
              crypto.randomUUID(),

            username,

            password:
              hashPassword(password),

            friends:[]

          };


          db.users.push(user);

          saveData(db);


          send(
            socket,
            {
              type:
                "register-result",
              success:true,
              message:
                "Đăng ký thành công"
            }
          );

          return;
        }


        /* =====================
           LOGIN
        ===================== */

        if (
          message.type ===
          "login"
        ) {

          const db =
            loadData();

          const username =
            String(
              message.username || ""
            ).trim();

          const password =
            String(
              message.password || ""
            );


          const user =
            db.users.find(
              u =>
                u.username ===
                  username &&
                u.password ===
                  hashPassword(
                    password
                  )
            );


          if (!user) {

            send(
              socket,
              {
                type:
                  "login-result",
                success:false,
                message:
                  "Sai tài khoản hoặc mật khẩu"
              }
            );

            return;
          }


          socket.user =
            user.username;


          onlineUsers.set(
            user.username,
            socket
          );


          send(
            socket,
            {
              type:
                "login-result",
              success:true,
              username:
                user.username
            }
          );

          return;
        }


        /* =====================
           CREATE SESSION
        ===================== */

        if (
          message.type ===
          "create-session"
        ) {

          const db =
            loadData();

          const username =
            String(
              message.username || ""
            ).trim();

          const password =
            String(
              message.password || ""
            );


          const user =
            db.users.find(
              u =>
                u.username ===
                  username &&
                u.password ===
                  hashPassword(
                    password
                  )
            );


          if (!user) {

            send(
              socket,
              {
                type:
                  "session-created",
                success:false
              }
            );

            return;
          }


          const token =
            crypto.randomBytes(
              32
            ).toString("hex");


          user.sessionToken =
            token;

          saveData(db);


          socket.user =
            user.username;


          onlineUsers.set(
            user.username,
            socket
          );


          send(
            socket,
            {
              type:
                "session-created",
              success:true,
              username:
                user.username,
              token
            }
          );

          return;
        }


        /* =====================
           AUTO LOGIN
        ===================== */

        if (
          message.type ===
          "session-login"
        ) {

          const db =
            loadData();

          const username =
            String(
              message.username || ""
            ).trim();

          const token =
            String(
              message.token || ""
            );


          const user =
            db.users.find(
              u =>
                u.username ===
                  username &&
                u.sessionToken ===
                  token
            );


          if (!user) {

            send(
              socket,
              {
                type:
                  "session-result",
                success:false
              }
            );

            return;
          }


          socket.user =
            user.username;


          onlineUsers.set(
            user.username,
            socket
          );


          send(
            socket,
            {
              type:
                "session-result",
              success:true,
              username:
                user.username
            }
          );

          return;
        }


        /* =====================
           LOGOUT
        ===================== */

        if (
          message.type ===
          "logout"
        ) {

          const db =
            loadData();


          if (socket.user) {

            const user =
              findUser(
                db,
                socket.user
              );


            if (user) {

              delete user.sessionToken;

            }

            onlineUsers.delete(
              socket.user
            );

          }


          saveData(db);

          socket.user = null;


          send(
            socket,
            {
              type:
                "logout-result",
              success:true
            }
          );

          return;
        }


        /* =====================
           SEARCH USERS
        ===================== */

        if (
          message.type ===
          "search-users"
        ) {

          if (!socket.user)
            return;


          const db =
            loadData();

          const query =
            String(
              message.query || ""
            )
            .trim()
            .toLowerCase();


          if (!query) {

            send(
              socket,
              {
                type:
                  "search-results",
                users:[]
              }
            );

            return;
          }


          const results =
            db.users
              .filter(
                user =>
                  user.username
                    .toLowerCase()
                    .includes(query) &&
                  user.username !==
                    socket.user
              )
              .slice(0,20)
              .map(
                user => {

                  const me =
                    findUser(
                      db,
                      socket.user
                    );

                  return {

                    username:
                      user.username,

                    friend:
                      areFriends(
                        me,
                        user
                      )

                  };

                }
              );


          send(
            socket,
            {
              type:
                "search-results",
              users:results
            }
          );

          return;
        }


        /* =====================
           FRIEND REQUEST
        ===================== */

        if (
          message.type ===
          "friend-request"
        ) {

          if (!socket.user)
            return;


          const db =
            loadData();

          const target =
            String(
              message.username || ""
            ).trim();


          const me =
            findUser(
              db,
              socket.user
            );

          const other =
            findUser(
              db,
              target
            );


          if (!other) {

            send(
              socket,
              {
                type:
                  "friend-request-result",
                success:false,
                message:
                  "Không tìm thấy người dùng"
              }
            );

            return;
          }


          if (
            me.username ===
            other.username
          ) {

            send(
              socket,
              {
                type:
                  "friend-request-result",
                success:false,
                message:
                  "Không thể kết bạn với chính mình"
              }
            );

            return;
          }


          if (
            areFriends(
              me,
              other
            )
          ) {

            send(
              socket,
              {
                type:
                  "friend-request-result",
                success:false,
                message:
                  "Hai người đã là bạn"
              }
            );

            return;
          }


          const existing =
            db.friendRequests.find(
              r =>
                r.from ===
                  me.username &&
                r.to ===
                  other.username &&
                r.status ===
                  "pending"
            );


          if (existing) {

            send(
              socket,
              {
                type:
                  "friend-request-result",
                success:false,
                message:
                  "Đã gửi lời mời trước đó"
              }
            );

            return;
          }


          const reverse =
            db.friendRequests.find(
              r =>
                r.from ===
                  other.username &&
                r.to ===
                  me.username &&
                r.status ===
                  "pending"
            );


          if (reverse) {

            send(
              socket,
              {
                type:
                  "friend-request-result",
                success:false,
                message:
                  "Người này đã gửi lời mời cho bạn"
              }
            );

            return;
          }


          db.friendRequests.push({

            id:
              crypto.randomUUID(),

            from:
              me.username,

            to:
              other.username,

            status:
              "pending",

            time:
              Date.now()

          });


          saveData(db);


          send(
            socket,
            {
              type:
                "friend-request-result",
              success:true,
              message:
                "Đã gửi lời mời kết bạn"
            }
          );


          const targetSocket =
            onlineUsers.get(
              other.username
            );


          if (targetSocket) {

            send(
              targetSocket,
              {
                type:
                  "friend-request-received",
                from:
                  me.username
              }
            );

          }

          return;
        }


        /* =====================
           GET FRIEND REQUESTS
        ===================== */

        if (
          message.type ===
          "get-friend-requests"
        ) {

          if (!socket.user)
            return;


          const db =
            loadData();


          const requests =
            db.friendRequests
              .filter(
                r =>
                  r.to ===
                    socket.user &&
                  r.status ===
                    "pending"
              );


          send(
            socket,
            {
              type:
                "friend-requests",
              requests
            }
          );

          return;
        }


        /* =====================
           ACCEPT FRIEND
        ===================== */

        if (
          message.type ===
          "accept-friend"
        ) {

          if (!socket.user)
            return;


          const db =
            loadData();

          const from =
            String(
              message.username || ""
            ).trim();


          const request =
            db.friendRequests.find(
              r =>
                r.from ===
                  from &&
                r.to ===
                  socket.user &&
                r.status ===
                  "pending"
            );


          if (!request) {

            send(
              socket,
              {
                type:
                  "friend-action-result",
                success:false,
                message:
                  "Lời mời không tồn tại"
              }
            );

            return;
          }


          const me =
            findUser(
              db,
              socket.user
            );

          const other =
            findUser(
              db,
              from
            );


          if (!me || !other)
            return;


          if (
            !Array.isArray(
              me.friends
            )
          )
            me.friends=[];


          if (
            !Array.isArray(
              other.friends
            )
          )
            other.friends=[];


          if (
            !me.friends.includes(
              other.username
            )
          ) {

            me.friends.push(
              other.username
            );

          }


          if (
            !other.friends.includes(
              me.username
            )
          ) {

            other.friends.push(
              me.username
            );

          }


          request.status =
            "accepted";


          saveData(db);


          send(
            socket,
            {
              type:
                "friend-action-result",
              success:true,
              message:
                "Đã kết bạn"
            }
          );


          send(
            socket,
            {
              type:
                "friend-added",
              username:
                other.username
            }
          );


          const otherSocket =
            onlineUsers.get(
              other.username
            );


          if (otherSocket) {

            send(
              otherSocket,
              {
                type:
                  "friend-added",
                username:
                  me.username
              }
            );

          }

          return;
        }


        /* =====================
           REJECT FRIEND
        ===================== */

        if (
          message.type ===
          "reject-friend"
        ) {

          if (!socket.user)
            return;


          const db =
            loadData();


          const from =
            String(
              message.username || ""
            ).trim();


          const request =
            db.friendRequests.find(
              r =>
                
