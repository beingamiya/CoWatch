// 📺 CoWatch Server (Final Fixed Version)
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

// Optional colored logs
let colors;
try {
  colors = require("colors/safe");
} catch {
  colors = {
    cyan: (s) => s,
    red: (s) => s,
    green: (s) => s,
    yellow: (s) => s,
    blue: (s) => s,
    magenta: (s) => s,
    gray: (s) => s,
  };
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3000;

// -----------------------------
// 🧩 In-Memory Data Structures
// -----------------------------
const rooms = new Map();
const CONNECTION_TIMEOUT = 120000;
const CLEANUP_INTERVAL = 60000;

// -----------------------------
// 🕓 Utility Functions
// -----------------------------
function log(message, color = "cyan") {
  console.log(colors[color](`[${new Date().toLocaleTimeString()}] ${message}`));
}

function createRoom(roomId) {
  rooms.set(roomId, {
    users: new Map(),
    currentMedia: { video: null, audio: null },
    mediaState: {
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now(),
    },
    createdAt: Date.now(),
  });
  log(`Room created: ${roomId}`, "green");
}

function removeUserFromRoom(socket) {
  const { roomId, username } = socket;
  if (!roomId || !rooms.has(roomId)) return;

  const room = rooms.get(roomId);
  room.users.delete(socket.id);

  if (room.users.size === 0) {
    rooms.delete(roomId);
    log(`Room ${roomId} deleted (empty)`, "red");
  } else {
    io.to(roomId).emit("user-left", {
      username,
      userCount: room.users.size,
      users: Array.from(room.users.values()).map((u) => u.username),
    });
  }
}

// -----------------------------
// 🧹 Periodic Cleanup
// -----------------------------
setInterval(() => {
  const now = Date.now();
  let removedUsers = 0,
    removedRooms = 0;

  for (const [roomId, room] of rooms.entries()) {
    for (const [socketId, user] of room.users.entries()) {
      const lastSeen = user.lastActivity || user.joinedAt;
      if (now - lastSeen > CONNECTION_TIMEOUT) {
        room.users.delete(socketId);
        removedUsers++;
      }
    }

    if (room.users.size === 0) {
      rooms.delete(roomId);
      removedRooms++;
    }
  }

  if (removedUsers > 0 || removedRooms > 0) {
    log(`Cleanup: ${removedUsers} users, ${removedRooms} rooms removed`, "yellow");
  }
}, CLEANUP_INTERVAL);

// -----------------------------
// 💾 File Upload Setup
// -----------------------------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + file.originalname);
  },
});

const allowedTypes = [
  "video/mp4",
  "video/avi",
  "video/mov",
  "video/mkv",
  "video/webm",
  "video/x-flv",
  "video/x-ms-wmv",
  "video/mpeg",
  "video/3gpp",
];

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type"));
  },
});

// -----------------------------
// 🌍 Static + API Routes
// -----------------------------
app.use(express.static(path.join(__dirname)));
app.use("/uploads", express.static(uploadDir));

app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

// ✅ Room list API
app.get("/api/rooms", (_, res) => {
  const roomList = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    userCount: room.users.size,
    users: Array.from(room.users.values()).map((u) => u.username),
    hasMedia: !!(room.currentMedia.video || room.currentMedia.audio),
  }));
  res.json(roomList);
});

// ✅ Room validation API
app.get("/api/room/:id/validate", (req, res) => {
  const roomId = req.params.id;
  res.json({
    exists: rooms.has(roomId),
    roomId,
  });
});

// ✅ Room info API
app.get("/api/room/:id", (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found" });

  res.json({
    id: req.params.id,
    userCount: room.users.size,
    users: Array.from(room.users.values()).map((u) => u.username),
    currentMedia: room.currentMedia,
    mediaState: room.mediaState,
  });
});

// ✅ File upload API
app.post("/api/upload", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const fileUrl = `/uploads/${req.file.filename}`;
  log(`File uploaded: ${req.file.originalname} → ${req.file.filename}`, "magenta");

  res.json({
    success: true,
    url: fileUrl,
    name: req.file.originalname,
    size: req.file.size,
  });
});

// -----------------------------
// ⚡ Socket.IO Logic
// -----------------------------
io.on("connection", (socket) => {
  log(`🔗 New connection: ${socket.id}`, "cyan");

  // 🧩 Join room
  socket.on("join-room", ({ roomId, username }) => {
    if (!rooms.has(roomId)) createRoom(roomId);
    const room = rooms.get(roomId);

    socket.join(roomId);
    socket.username = username;
    socket.roomId = roomId;

    room.users.set(socket.id, {
      username,
      joinedAt: Date.now(),
      lastActivity: Date.now(),
    });

    // Notify others
    io.to(roomId).emit("user-joined", {
      username,
      userCount: room.users.size,
      users: Array.from(room.users.values()).map((u) => u.username),
    });

    // Send room info to new user
    socket.emit("room-joined", {
      roomId,
      username,
      userCount: room.users.size,
      users: Array.from(room.users.values()).map((u) => u.username),
      currentMedia: room.currentMedia,
      mediaState: room.mediaState,
    });

    log(`${username} joined room ${roomId}`, "blue");

    // 🧠 FIX: Send current media state immediately to new joiner
    if (room.currentMedia.video || room.currentMedia.audio) {
      const type = room.currentMedia.video ? "video" : "audio";
      const source = room.currentMedia.video
        ? room.currentMedia.video.source
        : room.currentMedia.audio.source;

      socket.emit("media-loaded", {
        type,
        source,
        username: "System",
      });

      socket.emit("media-sync", {
        action: room.mediaState.isPlaying ? "play" : "pause",
        currentTime:
          room.mediaState.currentTime +
          (room.mediaState.isPlaying
            ? (Date.now() - room.mediaState.lastUpdate) / 1000
            : 0),
        username: "System",
      });
    }
  });

  // 🕹️ Media control events
  socket.on("media-event", ({ roomId, action, currentTime }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    room.mediaState = {
      isPlaying: action === "play",
      currentTime,
      lastUpdate: Date.now(),
    };

    socket.to(roomId).emit("media-sync", {
      action,
      currentTime,
      username: socket.username,
    });
  });

  // 🎥 Media loading
  socket.on("media-load", ({ roomId, type, source }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    room.currentMedia[type] = { source, loadedBy: socket.username };

    socket.to(roomId).emit("media-loaded", {
      type,
      source,
      username: socket.username,
    });
  });

  // 💬 Chat message
  socket.on("chat-message", ({ roomId, message }) => {
    socket.to(roomId).emit("chat-message", {
      username: socket.username,
      message,
      timestamp: Date.now(),
    });
  });

  // ❤️ Heartbeat
  socket.on("heartbeat", ({ roomId }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const user = room.users.get(socket.id);
    if (user) user.lastActivity = Date.now();
  });

  // ❌ Disconnect
  socket.on("disconnect", () => {
    removeUserFromRoom(socket);
    log(`❌ ${socket.id} disconnected`, "gray");
  });
});

// -----------------------------
// 🚀 Start Server
// -----------------------------
server.listen(PORT, () => {
  log(`🚀 Cowatch Server running at http://localhost:${PORT}`, "green");
  log(`📱 Open your browser at http://localhost:${PORT}`, "cyan");
});

process.on("SIGINT", () => {
  log("🛑 SIGINT received. Shutting down...", "red");
  server.close(() => process.exit(0));
});
