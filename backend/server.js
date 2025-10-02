import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import connectDB from "./db.js";
import roomRoutes from "./roomRoutes.js";    // create separately
import roomSocketHandler from "./roomSocket.js";  // create separately

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

connectDB();

app.use(cors());
app.use(bodyParser.json());

app.use("/api/rooms", roomRoutes);

app.get("/", (req, res) => {
  res.send("Backend server is running!");
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  roomSocketHandler(io, socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
