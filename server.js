const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
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

// ===== ESP32 ENDPOINTS (ADD THESE) =====

// ESP32 sends status updates (relay states, modes)
app.post("/api/esp32/status", (req, res) => {
  console.log("[ESP32] Status update received:", req.body);
  latestData = { ...latestData, ...req.body, timestamp: Date.now() };
  io.emit("data_update", latestData);
  res.json({ success: true, message: "Status updated" });
});

// ESP32 sends sensor data (voltage, current, LDR)
app.post("/api/esp32/data", (req, res) => {
  console.log("[ESP32] Sensor data received:", req.body);
  latestData = { ...latestData, ...req.body, timestamp: Date.now() };
  io.emit("sensor_update", req.body);
  res.json({ success: true, message: "Data received" });
});

// ESP32 checks for commands
app.get("/api/esp32/commands", (req, res) => {
  const commands = [...commandQueue];
  commandQueue = [];
  console.log(`[ESP32] Sending ${commands.length} commands`);
  res.json({ commands: commands });
});

// ===== WEB INTERFACE ENDPOINTS =====

// Get current status for web dashboard
app.get("/api/status", (req, res) => {
  res.json(latestData);
});

// Send command from web to ESP32
app.post("/api/command", (req, res) => {
  const { type, value } = req.body;
  commandQueue.push({ type, value });
  console.log(`[WEB] Command added: ${type} = ${value}`);
  io.emit("command_sent", { type, value });
  res.json({ success: true, message: "Command sent successfully" });
});

// Historical data for chart
app.get("/api/history", (req, res) => {
  const history = [];
  for (let i = 0; i < 24; i++) {
    history.push({
      hour: i,
      voltage: 210 + Math.random() * 20,
      current: Math.random() * 15,
      power: Math.random() * 3000,
      ldrValue: 500 + Math.random() * 3000,
    });
  }
  res.json(history);
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Socket.io connection
io.on("connection", (socket) => {
  console.log("[Socket] Client connected");
  socket.emit("data_update", latestData);
  socket.on("disconnect", () => {
    console.log("[Socket] Client disconnected");
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`ESP32 endpoints:`);
  console.log(`  POST /api/esp32/status`);
  console.log(`  POST /api/esp32/data`);
  console.log(`  GET  /api/esp32/commands`);
  console.log(`Web endpoints:`);
  console.log(`  GET  /api/status`);
  console.log(`  POST /api/command`);
});
