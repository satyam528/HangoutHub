import Room from "./Room.js";

export default function roomSocketHandler(io, socket) {
  console.log("User connected (socket.io):", socket.id);

  socket.on("join-room", async (data) => {
  const { roomCode, userName } = data;  // destructure from object

  try {
    const room = await Room.findOne({ code: roomCode });
    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    const user = { id: socket.id, name: userName };
    room.participants.push(user);
    await room.save();

    socket.join(roomCode);
    socket.emit("room-joined", {room, user});
    socket.to(roomCode).emit("user-joined", user);
  } catch (err) {
    console.error("Join error:", err);
  }
 });

  socket.on("send-message", async (data) => {
  try {
    const room = await Room.findOne({ "participants.id": socket.id });
    if (!room) return;

    const sender = room.participants.find(u => u.id === socket.id);
    const msg = {
      sender: sender ? sender.name : "Unknown",
      message: data.message,  // Use data.message, not just message
      type: "user",
      timestamp: new Date()
    };

    room.messages.push(msg);
    await room.save();

    io.to(room.code).emit("new-message", msg);
  } catch (err) {
    console.error("Message error:", err);
  }
});


  socket.on("disconnect", async () => {
    try {
      const room = await Room.findOne({ "participants.id": socket.id });
      if (!room) return;

      room.participants = room.participants.filter(p => p.id !== socket.id);
      await room.save();

      io.to(room.code).emit("user-left", socket.id);
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  });
}
