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
  esp32Online: false,
  lastSeen: Date.now(),
};

// Store event history (last 100 events)
let eventHistory = [];

// Store alerts
let alerts = [];

// Store daily stats with proper calculations
let dailyStats = {
  date: new Date().toDateString(),
  wapdaUsageHours: 0,
  loadOnHours: 0,
  solarSavingHours: 0,
  totalSwitches: 0,
  peakPower: 0,
  avgVoltage: 220,
  energyGenerated: 0,
  energyConsumed: 0,
  unitsConsumed: 0,
  unitsSaved: 0,
  costSaved: 0,
  costUsed: 0,
  lastWapdaOnTime: null,
  lastWapdaOffTime: null,
  lastLoadOnTime: null,
  lastLoadOffTime: null,
};

// Store hourly data for charts
let hourlyData = Array(24)
  .fill()
  .map(() => ({
    hour: 0,
    voltage: 0,
    current: 0,
    power: 0,
    ldrValue: 0,
  }));

// Store system status
let systemStatus = {
  status: "normal",
  message: "System Running Normally",
  color: "green",
  icon: "fa-check-circle",
};

// Command queue
let commandQueue = [];
let userMode = "HOME";

// Electricity cost rate (per unit/kWh in Rupees)
const COST_PER_UNIT = 30; // PKR per kWh

// ========== HELPER FUNCTIONS ==========

function addEvent(eventType, eventMessage, eventDetails) {
  const event = {
    id: Date.now(),
    type: eventType,
    message: eventMessage,
    details: eventDetails,
    timestamp: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString(),
  };
  eventHistory.unshift(event);
  if (eventHistory.length > 100) eventHistory.pop();
  io.emit("new-event", event);
  return event;
}

function addAlert(alertType, alertMessage, alertPriority) {
  const alert = {
    id: Date.now(),
    type: alertType,
    message: alertMessage,
    priority: alertPriority,
    timestamp: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString(),
    read: false,
  };
  alerts.unshift(alert);
  if (alerts.length > 50) alerts.pop();
  io.emit("new-alert", alert);
  return alert;
}

function updateDailyStats() {
  const today = new Date().toDateString();
  if (dailyStats.date !== today) {
    // Save previous day's data to history if needed
    dailyStats = {
      date: today,
      wapdaUsageHours: 0,
      loadOnHours: 0,
      solarSavingHours: 0,
      totalSwitches: 0,
      peakPower: 0,
      avgVoltage: 220,
      energyGenerated: 0,
      energyConsumed: 0,
      unitsConsumed: 0,
      unitsSaved: 0,
      costSaved: 0,
      costUsed: 0,
      lastWapdaOnTime: null,
      lastWapdaOffTime: null,
      lastLoadOnTime: null,
      lastLoadOffTime: null,
    };
  }

  // Calculate units and costs
  dailyStats.unitsConsumed = (dailyStats.energyConsumed / 1000).toFixed(2);
  dailyStats.unitsSaved = (dailyStats.energyGenerated / 1000).toFixed(2);
  dailyStats.costUsed = (dailyStats.unitsConsumed * COST_PER_UNIT).toFixed(2);
  dailyStats.costSaved = (dailyStats.unitsSaved * COST_PER_UNIT).toFixed(2);
}

function updateSystemStatus() {
  const now = Date.now();
  const timeSinceLastSeen = (now - esp32Data.lastSeen) / 1000;

  // Check if ESP32 is online (seen within last 60 seconds)
  esp32Data.esp32Online = timeSinceLastSeen < 60;

  if (!esp32Data.esp32Online) {
    systemStatus = {
      status: "offline",
      message: "ESP32 OFFLINE",
      color: "red",
      icon: "fa-wifi",
    };
    addAlert("danger", "ESP32 is offline! No data received.", "high");
  } else if (!esp32Data.wapdaAvailable && !esp32Data.isDayTime) {
    systemStatus = {
      status: "no_power",
      message: "NO POWER AVAILABLE",
      color: "red",
      icon: "fa-bolt",
    };
    addAlert(
      "danger",
      "No power source available! System may shut down.",
      "high",
    );
  } else if (
    esp32Data.wapdaAvailable &&
    !esp32Data.isSunny &&
    esp32Data.isDayTime
  ) {
    systemStatus = {
      status: "backup",
      message: "RUNNING ON GRID BACKUP",
      color: "orange",
      icon: "fa-plug",
    };
  } else if (esp32Data.isSunny && esp32Data.isDayTime) {
    systemStatus = {
      status: "solar",
      message: "SOLAR POWER ACTIVE",
      color: "green",
      icon: "fa-sun",
    };
  } else if (esp32Data.wapdaAvailable) {
    systemStatus = {
      status: "normal",
      message: "SYSTEM NORMAL",
      color: "green",
      icon: "fa-check-circle",
    };
  } else {
    systemStatus = {
      status: "warning",
      message: "SYSTEM WARNING",
      color: "orange",
      icon: "fa-exclamation-triangle",
    };
  }

  io.emit("system-status", systemStatus);
}

// ========== ESP32 ENDPOINTS ==========

app.post("/api/esp32/status", (req, res) => {
  console.log("\n📡 [ESP32] Status Update Received");

  // Update last seen
  esp32Data.lastSeen = Date.now();
  esp32Data.esp32Online = true;

  // Check for state changes and add events
  if (esp32Data.wapdaRelayState !== req.body.wapdaRelayState) {
    const action = req.body.wapdaRelayState ? "ON" : "OFF";
    addEvent("info", `WAPDA Relay Turned ${action}`, `Manual/Auto control`);
    dailyStats.totalSwitches++;
  }

  if (esp32Data.heavyLoadState !== req.body.heavyLoadState) {
    const action = req.body.heavyLoadState ? "ON" : "OFF";
    addEvent("warning", `Heavy Load Turned ${action}`, `Load state changed`);
    if (req.body.heavyLoadState) {
      dailyStats.lastLoadOnTime = new Date();
    } else {
      dailyStats.lastLoadOffTime = new Date();
      if (dailyStats.lastLoadOnTime) {
        const duration =
          (dailyStats.lastLoadOffTime - dailyStats.lastLoadOnTime) /
          (1000 * 3600);
        dailyStats.loadOnHours += duration;
      }
    }
  }

  if (esp32Data.wapdaAvailable !== req.body.wapdaAvailable) {
    if (req.body.wapdaAvailable) {
      addEvent("success", "Grid Power Restored", "WAPDA is now available");
      addAlert(
        "success",
        "Grid power restored! System back to normal.",
        "medium",
      );
      dailyStats.lastWapdaOnTime = new Date();
    } else {
      addEvent("danger", "Grid Power Outage", "WAPDA is unavailable");
      addAlert(
        "danger",
        "Grid power outage! Running on solar/battery.",
        "high",
      );
      dailyStats.lastWapdaOffTime = new Date();
      if (dailyStats.lastWapdaOnTime) {
        const duration =
          (dailyStats.lastWapdaOffTime - dailyStats.lastWapdaOnTime) /
          (1000 * 3600);
        dailyStats.wapdaUsageHours += duration;
      }
    }
  }

  if (esp32Data.isSunny !== req.body.isSunny && req.body.isDayTime) {
    if (req.body.isSunny) {
      addEvent("success", "Solar Power Available", "Bright sunlight detected");
      addAlert(
        "success",
        "Solar power is now available! Saving energy.",
        "low",
      );
    } else {
      addEvent("warning", "Solar Power Reduced", "Cloudy/Dark conditions");
    }
  }

  // Update data
  esp32Data = {
    ...esp32Data,
    ...req.body,
    lastUpdate: new Date().toLocaleTimeString(),
  };

  // Update hourly data
  const hour = new Date().getHours();
  hourlyData[hour] = {
    hour: hour,
    voltage: esp32Data.voltage,
    current: esp32Data.current,
    power: esp32Data.power,
    ldrValue: esp32Data.ldrValue,
  };

  // Update peak power
  if (esp32Data.power > dailyStats.peakPower) {
    dailyStats.peakPower = esp32Data.power;
  }

  // Update energy consumed
  if (esp32Data.power > 0) {
    dailyStats.energyConsumed += esp32Data.power * (5 / 3600); // 5 second interval
    dailyStats.energyGenerated +=
      (esp32Data.isSunny ? esp32Data.power * 0.7 : 0) * (5 / 3600);
  }

  updateDailyStats();
  updateSystemStatus();

  io.emit("data-update", esp32Data);
  io.emit("daily-stats", dailyStats);
  io.emit("hourly-data", hourlyData);
  io.emit("last-seen", {
    lastSeen: esp32Data.lastSeen,
    online: esp32Data.esp32Online,
  });

  res.json({ success: true });
});

app.post("/api/esp32/data", (req, res) => {
  console.log("\n📊 [ESP32] Sensor Data Received");

  esp32Data = {
    ...esp32Data,
    ...req.body,
    lastUpdate: new Date().toLocaleTimeString(),
  };
  esp32Data.lastSeen = Date.now();
  esp32Data.esp32Online = true;

  // Update hourly data
  const hour = new Date().getHours();
  hourlyData[hour] = {
    hour: hour,
    voltage: req.body.voltage || 0,
    current: req.body.current || 0,
    power: req.body.power || 0,
    ldrValue: req.body.ldrValue || 0,
  };

  // Update peak power
  if (req.body.power > dailyStats.peakPower) {
    dailyStats.peakPower = req.body.power;
  }

  // Update voltage average
  dailyStats.avgVoltage = (dailyStats.avgVoltage + (req.body.voltage || 0)) / 2;

  // Update energy consumed
  if (req.body.power > 0) {
    dailyStats.energyConsumed += (req.body.power || 0) * (5 / 3600);
    dailyStats.energyGenerated +=
      (esp32Data.isSunny ? (req.body.power || 0) * 0.7 : 0) * (5 / 3600);
  }

  updateDailyStats();
  updateSystemStatus();

  io.emit("data-update", esp32Data);
  io.emit("daily-stats", dailyStats);
  io.emit("hourly-data", hourlyData);
  io.emit("last-seen", {
    lastSeen: esp32Data.lastSeen,
    online: esp32Data.esp32Online,
  });

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

app.get("/api/alerts", (req, res) => {
  res.json(alerts);
});

app.get("/api/daily-stats", (req, res) => {
  res.json(dailyStats);
});

app.get("/api/system-status", (req, res) => {
  res.json(systemStatus);
});

app.get("/api/last-seen", (req, res) => {
  res.json({ lastSeen: esp32Data.lastSeen, online: esp32Data.esp32Online });
});

app.get("/api/user-mode", (req, res) => {
  res.json({ mode: userMode });
});

app.get("/api/hourly-data", (req, res) => {
  res.json(hourlyData);
});

app.post("/api/command", (req, res) => {
  const { type, value } = req.body;
  commandQueue.push({ type, value });
  console.log(`\n🌐 [WEB] Command sent: ${type} = ${value}`);
  addEvent(
    "info",
    `Command: ${type} = ${value ? "ON" : "OFF"}`,
    "User initiated",
  );

  if (type === "USER_MODE") {
    const modes = { 1: "HOME", 2: "SAVING", 3: "PERFORMANCE" };
    userMode = modes[value] || "HOME";
    addEvent("info", `Mode changed to ${userMode}`, "System behavior updated");
    addAlert("info", `System mode changed to ${userMode}`, "low");

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
  res.json(hourlyData);
});

app.delete("/api/clear-events", (req, res) => {
  eventHistory = [];
  alerts = [];
  res.json({ success: true });
});

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
  socket.emit("alerts-list", alerts);
  socket.emit("daily-stats", dailyStats);
  socket.emit("system-status", systemStatus);
  socket.emit("last-seen", {
    lastSeen: esp32Data.lastSeen,
    online: esp32Data.esp32Online,
  });
  socket.emit("user-mode", { mode: userMode });
  socket.emit("hourly-data", hourlyData);
});

// ========== START SERVER ==========
const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║     SMART ENERGY CONTROLLER v3.0 - FULLY UPDATED       ║");
  console.log("╠════════════════════════════════════════════════════════╣");
  console.log(`║  🌐 Web Interface: http://localhost:${PORT}              ║`);
  console.log(`║  📡 API Status:    http://localhost:${PORT}/api/status   ║`);
  console.log("║  ✨ Features:                                           ║");
  console.log("║     - Real-time System Status with Logo                 ║");
  console.log("║     - Live Charts & Analytics                           ║");
  console.log("║     - Cost Calculator (Units & Savings)                 ║");
  console.log("║     - Event History & Alerts                           ║");
  console.log("║     - ESP32 Online/Offline Detection                    ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");
});
