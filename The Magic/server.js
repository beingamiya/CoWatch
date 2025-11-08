// 📺 CoWatch Server - Fast Video Loading with Streaming
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

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
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 3000;

// Data structures
const rooms = new Map();
const CONNECTION_TIMEOUT = 120000;
const CLEANUP_INTERVAL = 60000;
const SYNC_CHECK_INTERVAL = 5000;

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
      lastAction: null,
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

function getRoomCurrentTime(room) {
  if (!room.mediaState.isPlaying) {
    return room.mediaState.currentTime;
  }
  
  const timeSinceUpdate = (Date.now() - room.mediaState.lastUpdate) / 1000;
  return room.mediaState.currentTime + timeSinceUpdate;
}

// Cleanup
setInterval(() => {
  const now = Date.now();
  let removedUsers = 0, removedRooms = 0;

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
    log(`Cleanup: ${removedUsers} users, ${removedRooms} rooms`, "yellow");
  }
}, CLEANUP_INTERVAL);

// Sync broadcast
setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size > 0 && (room.currentMedia.video || room.currentMedia.audio)) {
      const currentTime = getRoomCurrentTime(room);
      
      io.to(roomId).emit("sync-check", {
        isPlaying: room.mediaState.isPlaying,
        currentTime: currentTime,
        timestamp: Date.now(),
      });
    }
  }
}, SYNC_CHECK_INTERVAL);

// File upload setup
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
  "video/mp4", "video/avi", "video/mov", "video/mkv",
  "video/webm", "video/x-flv", "video/x-ms-wmv",
  "video/mpeg", "video/3gpp",
];

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type"));
  },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 CRITICAL FIX: Video Streaming with Range Request Support
// This allows videos to start playing immediately without full download
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// 🎬 Optimized Video Streaming Endpoint
app.get("/uploads/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadDir, filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    log(`File not found: ${filename}`, "red");
    return res.status(404).json({ error: "File not found" });
  }
  
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  log(`📹 Streaming request: ${filename} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`, "cyan");
  
  if (range) {
    // ✅ PARTIAL CONTENT REQUEST (Range Request)
    // This is what makes video streaming fast!
    
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    
    if (start >= fileSize) {
      res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
      return;
    }
    
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
    };
    
    log(`📦 Serving chunk: ${start}-${end}/${fileSize} (${(chunksize / 1024).toFixed(2)} KB)`, "green");
    
    res.writeHead(206, head); // 206 = Partial Content
    file.pipe(res);
    
  } else {
    // ✅ FULL FILE REQUEST (for downloads)
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes', // Tell browser we support range requests
      'Cache-Control': 'public, max-age=31536000',
    };
    
    log(`📦 Serving full file: ${filename}`, "green");
    
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Other routes
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

app.get("/api/rooms", (_, res) => {
  const roomList = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    userCount: room.users.size,
    users: Array.from(room.users.values()).map((u) => u.username),
    hasMedia: !!(room.currentMedia.video || room.currentMedia.audio),
    mediaState: {
      isPlaying: room.mediaState.isPlaying,
      currentTime: getRoomCurrentTime(room),
    },
  }));
  res.json(roomList);
});

app.get("/api/room/:id/validate", (req, res) => {
  const roomId = req.params.id;
  res.json({
    exists: rooms.has(roomId),
    roomId,
  });
});

app.get("/api/room/:id", (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found" });

  res.json({
    id: req.params.id,
    userCount: room.users.size,
    users: Array.from(room.users.values()).map((u) => u.username),
    currentMedia: room.currentMedia,
    mediaState: {
      isPlaying: room.mediaState.isPlaying,
      currentTime: getRoomCurrentTime(room),
      lastAction: room.mediaState.lastAction,
    },
  });
});

// 📤 Upload endpoint with progress tracking
app.post("/api/upload", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const fileUrl = `/uploads/${req.file.filename}`;
  const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
  
  log(`✅ Upload complete: ${req.file.originalname} (${fileSizeMB} MB)`, "magenta");

  res.json({
    success: true,
    url: fileUrl,
    name: req.file.originalname,
    size: req.file.size,
    sizeMB: fileSizeMB
  });
});

// Socket.IO logic
io.on("connection", (socket) => {
  log(`🔗 New connection: ${socket.id}`, "cyan");

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

    socket.to(roomId).emit("user-joined", {
      username,
      userCount: room.users.size,
      users: Array.from(room.users.values()).map((u) => u.username),
    });

    const currentTime = getRoomCurrentTime(room);

    socket.emit("room-joined", {
      roomId,
      username,
      userCount: room.users.size,
      users: Array.from(room.users.values()).map((u) => u.username),
      currentMedia: room.currentMedia,
      mediaState: {
        isPlaying: room.mediaState.isPlaying,
        currentTime: currentTime,
        lastAction: room.mediaState.lastAction,
      },
    });

    log(`✅ ${username} joined room ${roomId} (${room.users.size} users)`, "blue");

    if (room.currentMedia.video || room.currentMedia.audio) {
      const type = room.currentMedia.video ? "video" : "audio";
      const mediaData = room.currentMedia.video || room.currentMedia.audio;
      const source = mediaData.source;
      const isYouTube = mediaData.isYouTube || false;

      socket.emit("media-loaded", {
        type,
        source,
        username: "System",
        isYouTube: isYouTube
      });

      setTimeout(() => {
        const syncTime = getRoomCurrentTime(room);
        
        socket.emit("media-sync", {
          action: room.mediaState.isPlaying ? "play" : "pause",
          currentTime: syncTime,
          username: "System",
          isInitialSync: true,
          forceSeek: true,
          isYouTube: isYouTube
        });
        
        log(`🎯 Synced ${username} → ${syncTime.toFixed(2)}s (${room.mediaState.isPlaying ? 'PLAYING' : 'PAUSED'})${isYouTube ? ' YouTube' : ''}`, "cyan");
      }, 150);
    }
  });

  socket.on("play", ({ roomId, currentTime, isYouTube }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    room.mediaState = {
      isPlaying: true,
      currentTime: currentTime,
      lastUpdate: Date.now(),
      lastAction: socket.username,
      isYouTube: isYouTube || false
    };

    io.to(roomId).emit("media-sync", {
      action: "play",
      currentTime: currentTime,
      username: socket.username,
      isYouTube: isYouTube || false
    });

    log(`▶️  ${socket.username} PLAYED at ${currentTime.toFixed(2)}s${isYouTube ? ' (YouTube)' : ''} in ${roomId}`, "green");
  });

  socket.on("pause", ({ roomId, currentTime, isYouTube }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    room.mediaState = {
      isPlaying: false,
      currentTime: currentTime,
      lastUpdate: Date.now(),
      lastAction: socket.username,
      isYouTube: isYouTube || false
    };

    io.to(roomId).emit("media-sync", {
      action: "pause",
      currentTime: currentTime,
      username: socket.username,
      isYouTube: isYouTube || false
    });

    log(`⏸️  ${socket.username} PAUSED at ${currentTime.toFixed(2)}s${isYouTube ? ' (YouTube)' : ''} in ${roomId}`, "yellow");
  });

  socket.on("seek", ({ roomId, currentTime, isYouTube }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    room.mediaState.currentTime = currentTime;
    room.mediaState.lastUpdate = Date.now();
    room.mediaState.lastAction = socket.username;
    room.mediaState.isYouTube = isYouTube || false;

    io.to(roomId).emit("media-sync", {
      action: "seek",
      currentTime: currentTime,
      username: socket.username,
      isYouTube: isYouTube || false
    });

    log(`⏭️  ${socket.username} SEEKED to ${currentTime.toFixed(2)}s${isYouTube ? ' (YouTube)' : ''} in ${roomId}`, "magenta");
  });

  socket.on("media-load", ({ roomId, type, source, isYouTube }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    
    room.currentMedia[type] = { 
      source, 
      loadedBy: socket.username,
      isYouTube: isYouTube || false
    };
    
    room.mediaState = {
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now(),
      lastAction: socket.username,
      isYouTube: isYouTube || false
    };

    io.to(roomId).emit("media-loaded", {
      type,
      source,
      username: socket.username,
      isYouTube: isYouTube || false
    });

    log(`🎬 ${socket.username} loaded ${type}${isYouTube ? ' (YouTube)' : ''}: ${source}`, "magenta");
  });

  socket.on("chat-message", ({ roomId, message }) => {
    const timestamp = Date.now();
    
    io.to(roomId).emit("chat-message", {
      username: socket.username,
      message,
      timestamp,
    });
  });

  socket.on("heartbeat", ({ roomId, currentTime, isPlaying }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const user = room.users.get(socket.id);
    if (user) user.lastActivity = Date.now();

    if (typeof currentTime === 'number' && typeof isPlaying === 'boolean') {
      room.mediaState.currentTime = currentTime;
      room.mediaState.isPlaying = isPlaying;
      room.mediaState.lastUpdate = Date.now();
    }
  });

  socket.on("request-sync", ({ roomId }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    const currentTime = getRoomCurrentTime(room);

    socket.emit("media-sync", {
      action: room.mediaState.isPlaying ? "play" : "pause",
      currentTime: currentTime,
      username: "System",
      isSync: true,
      forceSeek: true,
    });

    log(`🔄 Sent sync to ${socket.username}: ${currentTime.toFixed(2)}s`, "cyan");
  });

  socket.on("disconnect", () => {
    removeUserFromRoom(socket);
    log(`❌ ${socket.username || socket.id} disconnected`, "gray");
  });
});

server.listen(PORT, () => {
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "green");
  log(`🚀 CoWatch Server (Fast Streaming) Running!`, "green");
  log(`📱 Local:   http://localhost:${PORT}`, "cyan");
  log(`🎬 Feature: Range Request Streaming Enabled`, "cyan");
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "green");
});

process.on("SIGINT", () => {
  log("🛑 Shutting down gracefully...", "red");
  server.close(() => {
    log("👋 Server closed", "red");
    process.exit(0);
  });
});