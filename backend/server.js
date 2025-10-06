import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

// --- Fix __dirname in ES module ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// --- Serve Frontend ---
app.use(express.static(path.join(__dirname, "../frontend")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// --- In-memory storage for rooms ---
const rooms = {}; // { roomCode: { host: {}, participants: [], messages: [] } }

// --- Socket.io handlers ---
io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  // --- Create Room ---
  socket.on("create-room", ({ hostProfile }) => {
    const roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    rooms[roomCode] = {
      host: { ...hostProfile, socketId: socket.id },
      participants: [],
      messages: [],
    };
    const participant = { ...hostProfile, socketId: socket.id };
    rooms[roomCode].participants.push(participant);

    socket.join(roomCode);

    // Notify the host
    socket.emit("room-joined", {
      room: { code: roomCode, messages: [] },
      user: participant,
      participants: [],
    });

    console.log(`Room created: ${roomCode} by ${hostProfile.name}`);
  });

  // --- Join Room ---
  socket.on("join-room", ({ roomCode, userProfile }) => {
    if (!userProfile) {
      socket.emit("error", { message: "User profile is required to join room" });
      return;
    }

    const room = rooms[roomCode];
    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    const participant = { ...userProfile, socketId: socket.id };
    if (!room.participants.find(p => p.id === userProfile.id)) {
      room.participants.push(participant);
    }

    socket.join(roomCode);

    // Notify joining user
    socket.emit("room-joined", {
      room: { code: roomCode, messages: room.messages },
      user: participant,
      participants: room.participants.filter(p => p.id !== userProfile.id),
    });

    // Notify others in the room
    socket.to(roomCode).emit("room-joined", {
      room: { code: roomCode, messages: room.messages },
      user: participant,
      participants: room.participants.filter(p => p.id !== userProfile.id),
    });

    console.log(`${userProfile.name} joined room: ${roomCode}`);
  });

  // --- Chat messages ---
  socket.on("send-message", ({ roomCode, message }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const sender = room.participants.find(p => p.socketId === socket.id);
    const msgObj = {
      sender: sender ? sender.name : "Unknown",
      message,
      type: "user",
    };

    room.messages.push(msgObj);
    io.to(roomCode).emit("new-message", msgObj);
  });

  // --- WebRTC signaling ---
  socket.on("video-offer", ({ to, sdp }) => {
    socket.to(to).emit("video-offer", { from: socket.id, sdp });
  });

  socket.on("video-answer", ({ to, sdp }) => {
    socket.to(to).emit("video-answer", { from: socket.id, sdp });
  });

  socket.on("new-ice-candidate", ({ to, candidate }) => {
    socket.to(to).emit("new-ice-candidate", { from: socket.id, candidate });
  });

  // --- Disconnect handler ---
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      const index = room.participants.findIndex(p => p.socketId === socket.id);
      if (index !== -1) {
        const user = room.participants.splice(index, 1)[0];
        socket.to(roomCode).emit("new-message", {
          sender: "System",
          message: `${user.name} left the room`,
          type: "system",
        });
      }
    }
  });
});

// --- Start server ---
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
