import express from "express";
import Room from "./Room.js";

const router = express.Router();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Create new room
router.post("/create", async (req, res) => {
  try {
    const { hostName } = req.body;
    if (!hostName) return res.status(400).json({ error: "Host name required" });

    const code = generateRoomCode();
    const room = new Room({
      code,
      hostName,
      participants: [],
      messages: []
    });
    await room.save();

    res.json({ roomCode: code });
  } catch (err) {
    console.error("Error creating room:", err);
    res.status(500).json({ error: "Failed to create room" });
  }
});

export default router;
