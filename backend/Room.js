import mongoose from "mongoose";

const participantSchema = new mongoose.Schema({
  id: String,
  name: String
});

const messageSchema = new mongoose.Schema({
  sender: String,
  message: String,
  type: String,
  timestamp: Date
});

const roomSchema = new mongoose.Schema({
  code: String,
  hostName: String,
  participants: [participantSchema],
  messages: [messageSchema]
});

const Room = mongoose.model("Room", roomSchema);

export default Room;
