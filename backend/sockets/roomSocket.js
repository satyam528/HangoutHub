// backend/sockets/roomSocket.js
import Room from "../models/Room.js";

export default function roomSocketHandler(io, socket) {
  console.log("🔌 User connected:", socket.id);

  // --- Join Room ---
  socket.on("join-room", async ({ roomCode, userName }) => {
    try {
      let room = await Room.findOne({ code: roomCode });
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      const user = { id: socket.id, name: userName };
      room.participants.push(user);
      await room.save();

      socket.join(roomCode);

      // Send full room state to the joining user
      socket.emit("room-joined", { room, user });

      // Notify others in the room
      socket.to(roomCode).emit("user-joined", { user });
    } catch (err) {
      console.error("Join error:", err);
    }
  });

  // --- Handle Messages ---
  socket.on("send-message", async ({ message }) => {
    try {
      const room = await Room.findOne({ "participants.id": socket.id });
      if (!room) return;

      const sender = room.participants.find((u) => u.id === socket.id);

      const msg = {
        sender: sender?.name || "Unknown",
        message,
        type: "user",
        timestamp: new Date(),
      };

      room.messages.push(msg);
      await room.save();

      io.to(room.code).emit("new-message", msg);
    } catch (err) {
      console.error("Message error:", err);
    }
  });

  // --- Disconnect ---
  socket.on("disconnect", async () => {
    try {
      const room = await Room.findOne({ "participants.id": socket.id });
      if (!room) return;

      const user = room.participants.find((u) => u.id === socket.id);
      room.participants = room.participants.filter((u) => u.id !== socket.id);
      await room.save();

      io.to(room.code).emit("user-left", {
        userId: socket.id,
        userName: user?.name || "Unknown",
      });

      if (room.participants.length === 0) {
        await Room.deleteOne({ code: room.code });
        console.log(`🗑️ Room ${room.code} deleted (empty)`);
      }
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  });
}
