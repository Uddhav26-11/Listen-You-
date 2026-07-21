import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import consultationRoutes from "./routes/consultation.routes.js";
import { notFound, errorHandler } from "./middleware/error.middleware.js";

dotenv.config();
connectDB();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  },
});

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

// Serve saved consultation recordings
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/consultations", consultationRoutes);

app.use(notFound);
app.use(errorHandler);

// Socket.io: signaling + live conversation events.
// This is where WebRTC signaling (offer/answer/ICE candidates) and the
// real-time AI conversation stream (STT chunks in, TTS/text chunks out,
// mood snapshot updates) will be wired in.
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("join-consultation", (consultationId) => {
    socket.join(consultationId);
  });

  // WebRTC signaling relay (placeholder — one user + one AI "peer" per room)
  socket.on("webrtc-signal", ({ consultationId, signal }) => {
    socket.to(consultationId).emit("webrtc-signal", signal);
  });

  // Placeholder for streaming mood snapshot updates to the client UI
  socket.on("mood-update", ({ consultationId, snapshot }) => {
    socket.to(consultationId).emit("mood-update", snapshot);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Listen You! server running on port ${PORT}`);
});
