// models/Room.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender: String,
  message: String,
  type: { type: String, default: "user" },
  timestamp: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  hostName: String,
  participants: [{ id: String, name: String }],
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now }
});

const Room = mongoose.model("Room", roomSchema);

export default Room;
