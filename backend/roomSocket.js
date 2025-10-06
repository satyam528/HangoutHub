// roomSocket.js
const { Server } = require("socket.io");

const rooms = {}; // store all active rooms in memory

module.exports = function (io) {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // --- CREATE ROOM ---
    socket.on("create-room", ({ hostProfile }) => {
      const roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();

      // Create a new room entry
      const newRoom = {
        code: roomCode,
        host: hostProfile,
        participants: [hostProfile],
        messages: []
      };
      rooms[roomCode] = newRoom;

      socket.join(roomCode);
      console.log(`Room ${roomCode} created by ${hostProfile.name}`);

      // Send event back to creator
      io.to(socket.id).emit("room-created", {
        roomCode,
        room: newRoom,
        hostUser: hostProfile
      });
    });

    // --- JOIN ROOM ---
    socket.on("join-room", ({ roomCode, userName, userId }) => {
      const room = rooms[roomCode];
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      const user = { name: userName, id: userId };
      room.participants.push(user);
      socket.join(roomCode);
      console.log(`${userName} joined room ${roomCode}`);

      // Notify the user who joined
      io.to(socket.id).emit("room-joined", {
        room,
        user,
        participants: room.participants
      });

      // Notify others in the room
      socket.to(roomCode).emit("user-joined", { id: socket.id, name: userName });
    });

    // --- SIGNALING / MEDIA / CHAT EVENTS (your existing code) ---
    socket.on("signal", ({ to, description, candidate }) => {
      io.to(to).emit("signal", { from: socket.id, description, candidate });
    });

    socket.on("media-status-update", ({ roomCode, isAudioMuted, isVideoMuted, isScreenSharing }) => {
      socket.to(roomCode).emit("media-status-update", {
        userId: socket.id,
        isAudioMuted,
        isVideoMuted,
        isScreenSharing,
      });
    });

    socket.on("speaking-status", ({ roomCode, isSpeaking }) => {
      socket.to(roomCode).emit("speaking-status", { userId: socket.id, isSpeaking });
    });

    socket.on("quality-changed", ({ roomCode, quality }) => {
      socket.to(roomCode).emit("participant-quality-changed", {
        userId: socket.id,
        quality
      });
    });

    socket.on("connection-quality", ({ roomCode, quality, stats }) => {
      socket.to(roomCode).emit("participant-connection-quality", {
        userId: socket.id,
        quality,
        stats
      });
    });

    socket.on("send-message", ({ roomCode, message }) => {
      io.in(roomCode).emit("new-message", { senderId: socket.id, message });
    });

    socket.on("leave-room", ({ roomCode }) => {
      socket.leave(roomCode);
      socket.to(roomCode).emit("user-left", { userId: socket.id });
      console.log(`User ${socket.id} left room ${roomCode}`);
    });

    socket.on("disconnect", () => {
      const userRooms = Array.from(socket.rooms).filter(r => r !== socket.id);
      userRooms.forEach(roomCode => {
        socket.to(roomCode).emit("user-left", { userId: socket.id });
        console.log(`User ${socket.id} disconnected and left room ${roomCode}`);
      });
    });
  });
};
