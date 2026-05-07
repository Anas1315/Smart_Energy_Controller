const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Store latest data
let latestData = {
  voltage: 0,
  current: 0,
  power: 0,
  ldrValue: 0,
  wapdaAvailable: false,
  isDayTime: true,
  isSunny: false,
  wapdaRelayState: false,
  heavyLoadState: false,
  wapdaAutoMode: true,
  heavyLoadAutoMode: true,
  currentHour: 0,
  ldrControlEnabled: true,
  ldrSunThreshold: 1500,
  ldrDarkThreshold: 800,
  timestamp: Date.now(),
};

// Store command queue
let commandQueue = [];

// ESP32 endpoints (your deployed ESP32 API)
const ESP32_API_BASE =
  process.env.ESP32_API_URL ||
  "https://smart-energy-controller-knb7.onrender.com";

// API Routes for ESP32
app.post("/api/esp32/status", (req, res) => {
  console.log("[ESP32] Status update received at:", new Date().toISOString());
  latestData = { ...latestData, ...req.body, timestamp: Date.now() };
  io.emit("data_update", latestData);
  res.json({ success: true, message: "Status updated" });
});

app.get("/api/esp32/commands", (req, res) => {
  const commands = [...commandQueue];
  commandQueue = [];
  console.log(`[ESP32] Sending ${commands.length} commands`);
  res.json({ commands });
});

app.post("/api/esp32/data", (req, res) => {
  console.log("[ESP32] Sensor data received:", req.body);
  latestData = { ...latestData, ...req.body };
  io.emit("sensor_update", req.body);
  res.json({ success: true, message: "Data received" });
});

// Web interface API endpoints
app.get("/api/status", (req, res) => {
  res.json(latestData);
});

app.post("/api/command", (req, res) => {
  const { type, value } = req.body;
  commandQueue.push({ type, value });
  console.log(`[WEB] Command added: ${type} = ${value}`);

  // Forward command to ESP32 if needed
  io.emit("command_sent", { type, value });

  res.json({ success: true, message: "Command sent successfully" });
});

// Serve main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check endpoint for Render
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Generate historical data endpoint
app.get("/api/history", (req, res) => {
  // Generate realistic historical data
  const history = [];
  const now = new Date();
  const currentHour = now.getHours();

  for (let i = 0; i < 24; i++) {
    const hour = (currentHour - 23 + i + 24) % 24;
    // Simulate solar production pattern
    let solarFactor = 0;
    if (hour >= 6 && hour <= 18) {
      solarFactor = Math.sin((Math.PI * (hour - 6)) / 12);
    }

    history.push({
      hour: hour,
      voltage: 210 + Math.random() * 15,
      current: solarFactor * 10 + Math.random() * 3,
      power: solarFactor * 2200 + Math.random() * 500,
      ldrValue: solarFactor * 3000 + 500,
    });
  }
  res.json(history);
});

// Socket.io connection
io.on("connection", (socket) => {
  console.log("[Socket] New client connected from:", socket.handshake.address);

  // Send current data immediately
  socket.emit("data_update", latestData);

  socket.on("disconnect", () => {
    console.log("[Socket] Client disconnected");
  });
});

// Error handling
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`╔════════════════════════════════════════════════╗`);
  console.log(`║     SMART ENERGY CONTROLLER WEB SERVER        ║`);
  console.log(`║     Version: 3.0 - Render Deploy Ready        ║`);
  console.log(`╠════════════════════════════════════════════════╣`);
  console.log(`║  Server running on: http://0.0.0.0:${PORT}      ║`);
  console.log(`║  Web interface: http://localhost:${PORT}        ║`);
  console.log(`║  API endpoint: http://localhost:${PORT}/api     ║`);
  console.log(`║  Health check: http://localhost:${PORT}/health  ║`);
  console.log(`╚════════════════════════════════════════════════╝`);
});
