// backend/server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";

import connectDB from "./config/db.js";
import roomRoutes from "./routes/roomRoutes.js";
import roomSocketHandler from "./sockets/roomSocket.js";

// --- Load environment variables ---
dotenv.config();

// --- App setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(bodyParser.json());

// --- Connect MongoDB ---
connectDB();

// --- Routes ---
app.use("/api/rooms", roomRoutes);

// --- Root route (for browser testing) ---
app.get("/", (req, res) => {
  res.send("✅ Backend server is running!");
});

// --- Socket.io ---
io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);
  roomSocketHandler(io, socket);
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
