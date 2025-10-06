import mongoose from "mongoose";

const RoomSchema = new mongoose.Schema({
  code: { type: String, unique: true, default: () => Math.random().toString(36).substring(2, 8).toUpperCase() },
  hostName: { type: String, required: true },
  hostProfile: { type: Object, required: true }, // Store host user profile
  admissionRequired: { type: Boolean, default: true },
  waitingList: [
    {
      id: String,
      name: String,
      profile: Object,
    },
  ],
  messages: [
    {
      sender: String,
      message: String,
      timestamp: { type: Date, default: Date.now }
    }
  ],
  // Optionally, add other room-related fields like createdAt, updatedAt
}, { timestamps: true });

const Room = mongoose.model("Room", RoomSchema);

export default Room;
