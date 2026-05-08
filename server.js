const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");

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

// Store ESP32 data
let esp32Data = {
  voltage: 0,
  current: 0,
  power: 0,
  ldrValue: 0,
  wapdaAvailable: false,
  isSunny: false,
  isDayTime: true,
  wapdaRelayState: false,
  heavyLoadState: false,
  wapdaAutoMode: true,
  heavyLoadAutoMode: true,
  currentHour: 12,
  lastUpdate: new Date().toLocaleTimeString(),
};

// Store event history (last 50 events)
let eventHistory = [];
let dailyStats = {
  date: new Date().toDateString(),
  wapdaUsageHours: 0,
  loadOnHours: 0,
  solarSavingHours: 0,
  lastWapdaOnTime: null,
  lastWapdaOffTime: null,
  totalSwitches: 0,
};

// Store ESP32 last seen
let lastSeen = Date.now();
let esp32Online = false;

// Command queue for ESP32
let commandQueue = [];

// Predefined modes
let userMode = "HOME"; // HOME, SAVING, PERFORMANCE

// ========== HELPER FUNCTIONS ==========

function addEvent(eventType, eventMessage, eventDetails) {
  const event = {
    id: Date.now(),
    type: eventType, // 'info', 'warning', 'success', 'danger'
    message: eventMessage,
    details: eventDetails,
    timestamp: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString(),
  };

  eventHistory.unshift(event); // Add to beginning
  if (eventHistory.length > 50) eventHistory.pop(); // Keep last 50

  console.log(`[EVENT] ${event.message}`);
  io.emit("new-event", event);
  return event;
}

function updateDailyStats() {
  const today = new Date().toDateString();
  if (dailyStats.date !== today) {
    // Reset daily stats for new day
    dailyStats = {
      date: today,
      wapdaUsageHours: 0,
      loadOnHours: 0,
      solarSavingHours: 0,
      lastWapdaOnTime: null,
      lastWapdaOffTime: null,
      totalSwitches: 0,
    };
  }
}

function calculateSystemStatus() {
  if (!esp32Online)
    return {
      status: "offline",
      message: "ESP32 Offline",
      color: "red",
      icon: "🔴",
    };
  if (!esp32Data.wapdaAvailable && !esp32Data.isDayTime)
    return {
      status: "no_power",
      message: "No Power Available",
      color: "red",
      icon: "🔴",
    };
  if (esp32Data.wapdaAvailable && !esp32Data.isSunny && esp32Data.isDayTime)
    return {
      status: "backup",
      message: "Running on Backup (Grid)",
      color: "orange",
      icon: "🟡",
    };
  if (esp32Data.isSunny && esp32Data.isDayTime)
    return {
      status: "solar",
      message: "Running on Solar Power",
      color: "green",
      icon: "🟢",
    };
  if (esp32Data.wapdaAvailable)
    return {
      status: "normal",
      message: "System Running Normally",
      color: "green",
      icon: "🟢",
    };
  return {
    status: "warning",
    message: "System Running on Backup",
    color: "orange",
    icon: "🟡",
  };
}

// ========== ESP32 ENDPOINTS ==========

app.post("/api/esp32/status", (req, res) => {
  console.log("\n📡 [ESP32] Status Update Received");

  // Update last seen
  lastSeen = Date.now();
  esp32Online = true;

  // Check for state changes and add events
  if (esp32Data.wapdaRelayState !== req.body.wapdaRelayState) {
    const action = req.body.wapdaRelayState ? "ON" : "OFF";
    addEvent(
      "info",
      `WAPDA Relay Turned ${action}`,
      `Relay state changed to ${action}`,
    );
    dailyStats.totalSwitches++;
  }

  if (esp32Data.heavyLoadState !== req.body.heavyLoadState) {
    const action = req.body.heavyLoadState ? "ON" : "OFF";
    addEvent(
      "warning",
      `Heavy Load Turned ${action}`,
      `Load state changed to ${action}`,
    );
  }

  if (esp32Data.wapdaAvailable !== req.body.wapdaAvailable) {
    if (req.body.wapdaAvailable) {
      addEvent(
        "success",
        "WAPDA Power Restored",
        "Grid power is now available",
      );
      dailyStats.lastWapdaOnTime = new Date();
    } else {
      addEvent("danger", "WAPDA Power Outage", "Grid power is unavailable");
      dailyStats.lastWapdaOffTime = new Date();
    }
  }

  if (esp32Data.isSunny !== req.body.isSunny && req.body.isDayTime) {
    if (req.body.isSunny) {
      addEvent("success", "Solar Power Available", "Bright sunlight detected");
      dailyStats.solarSavingHours += 0.5;
    } else {
      addEvent("warning", "Solar Power Reduced", "Cloudy/Dark conditions");
    }
  }

  esp32Data = {
    ...esp32Data,
    ...req.body,
    lastUpdate: new Date().toLocaleTimeString(),
  };
  updateDailyStats();

  io.emit("data-update", esp32Data);
  io.emit("system-status", calculateSystemStatus());
  io.emit("last-seen", { lastSeen: lastSeen, online: esp32Online });

  res.json({ success: true });
});

app.post("/api/esp32/data", (req, res) => {
  console.log("\n📊 [ESP32] Sensor Data Received");
  esp32Data = {
    ...esp32Data,
    ...req.body,
    lastUpdate: new Date().toLocaleTimeString(),
  };
  lastSeen = Date.now();
  esp32Online = true;

  io.emit("data-update", esp32Data);
  io.emit("last-seen", { lastSeen: lastSeen, online: esp32Online });
  res.json({ success: true });
});

app.get("/api/esp32/commands", (req, res) => {
  const commands = [...commandQueue];
  commandQueue = [];
  res.json({ commands });
});

// ========== WEB INTERFACE ENDPOINTS ==========

app.get("/api/status", (req, res) => {
  res.json(esp32Data);
});

app.get("/api/events", (req, res) => {
  res.json(eventHistory);
});

app.get("/api/daily-stats", (req, res) => {
  res.json(dailyStats);
});

app.get("/api/system-status", (req, res) => {
  res.json(calculateSystemStatus());
});

app.get("/api/last-seen", (req, res) => {
  res.json({ lastSeen: lastSeen, online: esp32Online });
});

app.get("/api/user-mode", (req, res) => {
  res.json({ mode: userMode });
});

app.post("/api/command", (req, res) => {
  const { type, value } = req.body;
  commandQueue.push({ type, value });
  console.log("\n🌐 [WEB] Command sent:", type, "=", value);

  if (type === "WAPDA_RELAY") {
    addEvent(
      "info",
      `Manual command: WAPDA Relay ${value ? "ON" : "OFF"}`,
      "User initiated",
    );
  } else if (type === "HEAVY_LOAD") {
    addEvent(
      "info",
      `Manual command: Heavy Load ${value ? "ON" : "OFF"}`,
      "User initiated",
    );
  } else if (type === "USER_MODE") {
    const modes = { 1: "HOME", 2: "SAVING", 3: "PERFORMANCE" };
    userMode = modes[value] || "HOME";
    addEvent(
      "info",
      `User Mode Changed to ${userMode}`,
      `System behavior updated`,
    );

    // Apply mode-specific settings
    if (userMode === "SAVING") {
      commandQueue.push({ type: "WAPDA_MODE", value: 0 });
      commandQueue.push({ type: "HEAVY_LOAD_MODE", value: 1 });
    } else if (userMode === "PERFORMANCE") {
      commandQueue.push({ type: "WAPDA_MODE", value: 0 });
      commandQueue.push({ type: "HEAVY_LOAD_MODE", value: 0 });
    } else {
      commandQueue.push({ type: "WAPDA_MODE", value: 1 });
      commandQueue.push({ type: "HEAVY_LOAD_MODE", value: 1 });
    }
  }

  io.emit("command-sent", { type, value });
  res.json({ success: true });
});

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

// Serve main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ========== SOCKET.IO ==========
io.on("connection", (socket) => {
  console.log("👤 Client connected");
  socket.emit("data-update", esp32Data);
  socket.emit("events-list", eventHistory);
  socket.emit("daily-stats", dailyStats);
  socket.emit("system-status", calculateSystemStatus());
  socket.emit("last-seen", { lastSeen: lastSeen, online: esp32Online });
  socket.emit("user-mode", { mode: userMode });
});

// ========== START SERVER ==========
const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║     SMART ENERGY CONTROLLER v3.2 - FULL FEATURES      ║");
  console.log("╠════════════════════════════════════════════════════════╣");
  console.log(`║  🌐 Web Interface: http://localhost:${PORT}              ║`);
  console.log(`║  📡 API Status:    http://localhost:${PORT}/api/status   ║`);
  console.log("║  ✨ New Features:                                      ║");
  console.log("║     - System Status Box                                ║");
  console.log("║     - Event History Log                                ║");
  console.log("║     - Daily Summary                                    ║");
  console.log("║     - Smart Notifications                              ║");
  console.log("║     - Fail-Safe Indicators                             ║");
  console.log("║     - User Modes (Home/Saving/Performance)             ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");
});
