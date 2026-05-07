// Socket.IO connection with Render compatibility
const socket = io({
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

// Chart instance
let energyChart = null;

// DOM Elements
const elements = {
  voltage: document.getElementById("voltage"),
  current: document.getElementById("current"),
  power: document.getElementById("power"),
  ldrValue: document.getElementById("ldrValue"),
  wapdaStatus: document.getElementById("wapdaStatus"),
  timeStatus: document.getElementById("timeStatus"),
  lightStatus: document.getElementById("lightStatus"),
  systemTime: document.getElementById("systemTime"),
  wapdaRelayStatus: document.getElementById("wapdaRelayStatus"),
  heavyRelayStatus: document.getElementById("heavyRelayStatus"),
  wapdaModeToggle: document.getElementById("wapdaModeToggle"),
  heavyModeToggle: document.getElementById("heavyModeToggle"),
  wapdaOnBtn: document.getElementById("wapdaOnBtn"),
  wapdaOffBtn: document.getElementById("wapdaOffBtn"),
  heavyOnBtn: document.getElementById("heavyOnBtn"),
  heavyOffBtn: document.getElementById("heavyOffBtn"),
  ldrEnableToggle: document.getElementById("ldrEnableToggle"),
  sunThreshold: document.getElementById("sunThreshold"),
  darkThreshold: document.getElementById("darkThreshold"),
  sunThresholdValue: document.getElementById("sunThresholdValue"),
  darkThresholdValue: document.getElementById("darkThresholdValue"),
  operationMode: document.getElementById("operationMode"),
  efficiency: document.getElementById("efficiency"),
  dailyEnergy: document.getElementById("dailyEnergy"),
  timestamp: document.getElementById("timestamp"),
};

// Connection status
let isConnected = true;
let reconnectAttempts = 0;
let lastHeartbeat = Date.now();

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initializeEventListeners();
  initializeChart();
  fetchInitialData();
  startTimeUpdate();
  startHeartbeat();
});

// Socket event handlers
socket.on("connect", () => {
  console.log("Connected to server at:", new Date().toISOString());
  updateConnectionStatus(true);
  reconnectAttempts = 0;
  showNotification("Connected to server", "success");
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected from server:", reason);
  updateConnectionStatus(false);
  showNotification("Disconnected from server", "error");

  if (reason === "io server disconnect") {
    // Reconnect manually
    socket.connect();
  }
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
  updateConnectionStatus(false);
});

socket.on("data_update", (data) => {
  console.log("Data update received at:", new Date().toISOString());
  updateDashboard(data);
  lastHeartbeat = Date.now();
});

socket.on("sensor_update", (data) => {
  console.log("Sensor update:", data);
  updateMetrics(data);
});

socket.on("command_sent", (command) => {
  console.log("Command confirmed:", command);
  showNotification(
    `Command sent: ${command.type} = ${command.value}`,
    "success",
  );
});

// Heartbeat to check connection
function startHeartbeat() {
  setInterval(() => {
    if (Date.now() - lastHeartbeat > 30000) {
      console.log("No heartbeat received, reconnecting...");
      socket.connect();
    }
  }, 15000);
}

// Initialize event listeners
function initializeEventListeners() {
  // WAPDA mode toggle
  elements.wapdaModeToggle.addEventListener("change", (e) => {
    const value = e.target.checked ? 1 : 0;
    sendCommand("WAPDA_MODE", value);
    updateButtonStates("wapda", !e.target.checked);
  });

  // Heavy load mode toggle
  elements.heavyModeToggle.addEventListener("change", (e) => {
    const value = e.target.checked ? 1 : 0;
    sendCommand("HEAVY_LOAD_MODE", value);
    updateButtonStates("heavy", !e.target.checked);
  });

  // WAPDA relay buttons
  elements.wapdaOnBtn.addEventListener("click", () => {
    sendCommand("WAPDA_RELAY", 1);
  });
  elements.wapdaOffBtn.addEventListener("click", () => {
    sendCommand("WAPDA_RELAY", 0);
  });

  // Heavy load relay buttons
  elements.heavyOnBtn.addEventListener("click", () => {
    sendCommand("HEAVY_LOAD", 1);
  });
  elements.heavyOffBtn.addEventListener("click", () => {
    sendCommand("HEAVY_LOAD", 0);
  });

  // LDR enable toggle
  elements.ldrEnableToggle.addEventListener("change", (e) => {
    sendCommand("LDR_ENABLED", e.target.checked ? 1 : 0);
  });

  // LDR thresholds with debounce
  let sunThresholdTimeout, darkThresholdTimeout;

  elements.sunThreshold.addEventListener("input", (e) => {
    const value = parseInt(e.target.value);
    elements.sunThresholdValue.textContent = value;
    clearTimeout(sunThresholdTimeout);
    sunThresholdTimeout = setTimeout(() => {
      sendCommand("LDR_SUN_THRESH", value);
    }, 500);
  });

  elements.darkThreshold.addEventListener("input", (e) => {
    const value = parseInt(e.target.value);
    elements.darkThresholdValue.textContent = value;
    clearTimeout(darkThresholdTimeout);
    darkThresholdTimeout = setTimeout(() => {
      sendCommand("LDR_DARK_THRESH", value);
    }, 500);
  });
}

// Send command to server
async function sendCommand(type, value) {
  try {
    const response = await fetch("/api/command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type, value }),
    });

    if (response.ok) {
      console.log(`Command sent: ${type} = ${value}`);
      showNotification(`${type} set to ${value}`, "success");
    } else {
      throw new Error("Failed to send command");
    }
  } catch (error) {
    console.error("Error sending command:", error);
    showNotification("Failed to send command", "error");
  }
}

// Fetch initial data
async function fetchInitialData() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    updateDashboard(data);
  } catch (error) {
    console.error("Error fetching initial data:", error);
    setTimeout(fetchInitialData, 5000);
  }
}

// Update entire dashboard
function updateDashboard(data) {
  updateMetrics(data);
  updateStatuses(data);
  updateControls(data);
  updateInfo(data);
  updateChartData(data);
}

// Update metrics
function updateMetrics(data) {
  if (data.voltage !== undefined) {
    elements.voltage.textContent = data.voltage.toFixed(1);
    updateGauge("voltage", data.voltage);
  }
  if (data.current !== undefined) {
    elements.current.textContent = data.current.toFixed(2);
  }
  if (data.power !== undefined) {
    elements.power.textContent = data.power.toFixed(1);
  }
  if (data.ldrValue !== undefined) {
    elements.ldrValue.textContent = data.ldrValue;
    updateLDRIndicator(data.ldrValue);
  }
}

// Update gauge visualization
function updateGauge(type, value) {
  const element = document.getElementById(`${type}Gauge`);
  if (element) {
    const percentage = Math.min(100, (value / 250) * 100);
    element.style.width = `${percentage}%`;
  }
}

// Update LDR indicator
function updateLDRIndicator(value) {
  const indicator = document.getElementById("ldrIndicator");
  if (indicator) {
    const intensity = Math.min(100, (value / 4095) * 100);
    indicator.style.opacity = intensity / 100;
  }
}

// Update status indicators
function updateStatuses(data) {
  // WAPDA status
  if (data.wapdaAvailable !== undefined) {
    const statusEl = elements.wapdaStatus;
    statusEl.textContent = data.wapdaAvailable ? "AVAILABLE" : "OUTAGE";
    statusEl.className = `status-badge ${data.wapdaAvailable ? "on" : "off"}`;
  }

  // Time of day
  if (data.isDayTime !== undefined) {
    const statusEl = elements.timeStatus;
    statusEl.textContent = data.isDayTime ? "DAY TIME" : "NIGHT TIME";
    statusEl.className = `status-badge ${data.isDayTime ? "day" : "night"}`;
  }

  // Light condition
  if (data.isSunny !== undefined && data.isDayTime) {
    const statusEl = elements.lightStatus;
    statusEl.textContent = data.isSunny ? "SUNNY/BRIGHT" : "DIM/CLOUDY";
    statusEl.className = `status-badge ${data.isSunny ? "sunny" : "cloudy"}`;
  } else if (!data.isDayTime) {
    elements.lightStatus.textContent = "NIGHT TIME";
    elements.lightStatus.className = "status-badge night";
  }

  // System time
  if (data.currentHour !== undefined) {
    elements.systemTime.textContent = `${data.currentHour}:00`;
  }

  // Relay status
  if (data.wapdaRelayState !== undefined) {
    elements.wapdaRelayStatus.textContent = data.wapdaRelayState ? "ON" : "OFF";
    elements.wapdaRelayStatus.style.color = data.wapdaRelayState
      ? "#27ae60"
      : "#e74c3c";
  }

  if (data.heavyLoadState !== undefined) {
    elements.heavyRelayStatus.textContent = data.heavyLoadState ? "ON" : "OFF";
    elements.heavyRelayStatus.style.color = data.heavyLoadState
      ? "#27ae60"
      : "#e74c3c";
  }
}

// Update control states
function updateControls(data) {
  // WAPDA mode
  if (data.wapdaAutoMode !== undefined) {
    elements.wapdaModeToggle.checked = data.wapdaAutoMode;
    updateButtonStates("wapda", !data.wapdaAutoMode);
  }

  // Heavy load mode
  if (data.heavyLoadAutoMode !== undefined) {
    elements.heavyModeToggle.checked = data.heavyLoadAutoMode;
    updateButtonStates("heavy", !data.heavyLoadAutoMode);
  }

  // LDR settings
  if (data.ldrControlEnabled !== undefined) {
    elements.ldrEnableToggle.checked = data.ldrControlEnabled;
  }

  if (data.ldrSunThreshold !== undefined) {
    elements.sunThreshold.value = data.ldrSunThreshold;
    elements.sunThresholdValue.textContent = data.ldrSunThreshold;
  }

  if (data.ldrDarkThreshold !== undefined) {
    elements.darkThreshold.value = data.ldrDarkThreshold;
    elements.darkThresholdValue.textContent = data.ldrDarkThreshold;
  }
}

// Update button states based on mode
function updateButtonStates(type, isManual) {
  if (type === "wapda") {
    elements.wapdaOnBtn.disabled = !isManual;
    elements.wapdaOffBtn.disabled = !isManual;
  } else if (type === "heavy") {
    elements.heavyOnBtn.disabled = !isManual;
    elements.heavyOffBtn.disabled = !isManual;
  }
}

// Update info section
function updateInfo(data) {
  // Operation mode
  if (data.isDayTime !== undefined && data.wapdaAvailable !== undefined) {
    if (data.isDayTime) {
      if (data.isSunny) {
        elements.operationMode.textContent = "Solar Priority";
        elements.operationMode.style.color = "#f39c12";
      } else {
        elements.operationMode.textContent = "Grid Backup";
        elements.operationMode.style.color = "#3498db";
      }
    } else {
      elements.operationMode.textContent = "Grid Only";
      elements.operationMode.style.color = "#95a5a6";
    }
  }

  // Power efficiency (calculated)
  if (
    data.power !== undefined &&
    data.voltage !== undefined &&
    data.current !== undefined
  ) {
    const theoreticalPower = data.voltage * data.current;
    const efficiency =
      theoreticalPower > 0
        ? ((data.power / theoreticalPower) * 100).toFixed(1)
        : 0;
    elements.efficiency.textContent = `${efficiency}%`;

    // Color code efficiency
    if (efficiency > 80) {
      elements.efficiency.style.color = "#27ae60";
    } else if (efficiency > 60) {
      elements.efficiency.style.color = "#f39c12";
    } else {
      elements.efficiency.style.color = "#e74c3c";
    }
  }

  // Daily energy (simulated)
  if (data.power !== undefined) {
    const dailyEnergyKwh = ((data.power * 24) / 1000).toFixed(2);
    elements.dailyEnergy.textContent = `${dailyEnergyKwh} kWh`;
  }
}

// Initialize chart
function initializeChart() {
  const ctx = document.getElementById("energyChart").getContext("2d");
  energyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
      datasets: [
        {
          label: "Power (W)",
          data: Array(24).fill(0),
          borderColor: "#2ecc71",
          backgroundColor: "rgba(46, 204, 113, 0.1)",
          tension: 0.4,
          fill: true,
          borderWidth: 2,
        },
        {
          label: "Voltage (V)",
          data: Array(24).fill(0),
          borderColor: "#3498db",
          backgroundColor: "rgba(52, 152, 219, 0.1)",
          tension: 0.4,
          fill: true,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            usePointStyle: true,
            boxWidth: 10,
          },
        },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: "rgba(0,0,0,0.8)",
          titleColor: "#fff",
          bodyColor: "#fff",
          borderColor: "#2ecc71",
          borderWidth: 1,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(0, 0, 0, 0.05)",
            drawBorder: true,
          },
          title: {
            display: true,
            text: "Value",
          },
        },
        x: {
          grid: {
            display: false,
          },
          title: {
            display: true,
            text: "Hour",
          },
        },
      },
    },
  });
}

// Update chart data
async function updateChartData(currentData) {
  try {
    const response = await fetch("/api/history");
    const history = await response.json();

    if (energyChart && history.length > 0) {
      energyChart.data.datasets[0].data = history.map((h) => h.power || 0);
      energyChart.data.datasets[1].data = history.map((h) => h.voltage || 0);
      energyChart.update("none");
    }
  } catch (error) {
    console.error("Error updating chart:", error);
  }
}

// Update connection status
function updateConnectionStatus(connected) {
  const statusDiv = document.getElementById("connectionStatus");
  if (connected) {
    statusDiv.style.background = "#27ae60";
    statusDiv.querySelector("span:last-child").textContent = "Connected";
    statusDiv.style.animation = "pulse 2s infinite";
    isConnected = true;
  } else {
    statusDiv.style.background = "#e74c3c";
    statusDiv.querySelector("span:last-child").textContent = "Reconnecting...";
    statusDiv.style.animation = "blink 1s infinite";
    isConnected = false;
  }
}

// Start time update
function startTimeUpdate() {
  setInterval(() => {
    const now = new Date();
    elements.timestamp.textContent = now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, 1000);
}

// Show notification
function showNotification(message, type) {
  // Remove existing notification
  const existing = document.querySelector(".notification");
  if (existing) {
    existing.remove();
  }

  // Create notification element
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.textContent = message;
  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === "success" ? "#27ae60" : "#e74c3c"};
        color: white;
        border-radius: 10px;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Add animation styles
const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes pulse {
        0%, 100% {
            opacity: 1;
        }
        50% {
            opacity: 0.8;
        }
    }
    
    @keyframes blink {
        0%, 100% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
    }
    
    .notification {
        font-family: 'Inter', sans-serif;
    }
`;
document.head.appendChild(style);
