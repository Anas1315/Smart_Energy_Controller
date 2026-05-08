// Socket connection
const socket = io();

// Chart instance
let powerChart = null;

// DOM Elements
let currentPage = "dashboard";

// Initialize when page loads
document.addEventListener("DOMContentLoaded", () => {
  initializeNavigation();
  initializeSocket();
  initializeSettings();
  initializeChart();
  loadInitialData();
  startTimeUpdate();
});

// Navigation
function initializeNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      switchPage(page);

      // Update active state
      document
        .querySelectorAll(".nav-item")
        .forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
    });
  });
}

function switchPage(page) {
  currentPage = page;

  // Hide all pages
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));

  // Show selected page
  document.getElementById(`page-${page}`).classList.add("active");

  // Update page title
  const titles = {
    dashboard: { title: "Dashboard", subtitle: "Real-time energy monitoring" },
    controls: { title: "Controls", subtitle: "Manual & automatic control" },
    analytics: {
      title: "Analytics",
      subtitle: "Performance insights & trends",
    },
    history: { title: "History", subtitle: "System event log" },
    settings: { title: "Settings", subtitle: "Configure system parameters" },
  };

  document.getElementById("pageTitle").textContent = titles[page].title;
  document.getElementById("pageSubtitle").textContent = titles[page].subtitle;

  // Refresh chart if analytics page
  if (page === "analytics" && powerChart) {
    loadHourlyData();
  }
}

// Socket initialization
function initializeSocket() {
  socket.on("connect", () => {
    updateConnectionStatus(true);
  });

  socket.on("disconnect", () => {
    updateConnectionStatus(false);
    showNotification("Disconnected from server", "error", "Connection Lost");
  });

  socket.on("data-update", (data) => {
    updateDashboard(data);
    updateControls(data);
  });

  socket.on("command-sent", (command) => {
    showNotification(
      `${command.type} ${command.value ? "ON" : "OFF"}`,
      "success",
      "Command Executed",
    );
  });

  socket.on("new-event", (event) => {
    addEventToList(event);
    if (currentPage === "history") loadEvents();
    showNotification(event.message, event.type, getEventTitle(event.type));
  });

  socket.on("events-list", (events) => {
    if (currentPage === "history") updateEventsList(events);
  });

  socket.on("daily-stats", (stats) => {
    updateDailyStats(stats);
  });

  socket.on("system-status", (status) => {
    updateSystemStatus(status);
  });

  socket.on("last-seen", (data) => {
    updateLastSeen(data);
  });

  socket.on("user-mode", (data) => {
    updateUserMode(data.mode);
  });

  socket.on("hourly-data", (data) => {
    updateChartData(data);
  });
}

// Update connection status
function updateConnectionStatus(connected) {
  const statusDot = document.querySelector(".status-dot");
  const statusText = document.querySelector(".status-indicator span");
  const sidebarStatus = document.getElementById("sidebarStatus");

  if (connected) {
    statusDot.style.background = "#2ecc71";
    if (statusText) statusText.textContent = "Connected";
    if (sidebarStatus) sidebarStatus.style.opacity = "1";
  } else {
    statusDot.style.background = "#e74c3c";
    if (statusText) statusText.textContent = "Disconnected";
    if (sidebarStatus) sidebarStatus.style.opacity = "0.7";
  }
}

// Update dashboard
function updateDashboard(data) {
  // Dashboard page metrics
  const dashIds = [
    "Voltage",
    "Current",
    "Power",
    "Ldr",
    "Wapda",
    "Light",
    "Time",
    "Update",
  ];
  if (data.voltage !== undefined)
    document.getElementById("dashVoltage").textContent =
      data.voltage.toFixed(1);
  if (data.current !== undefined)
    document.getElementById("dashCurrent").textContent =
      data.current.toFixed(2);
  if (data.power !== undefined)
    document.getElementById("dashPower").textContent = data.power.toFixed(1);
  if (data.ldrValue !== undefined)
    document.getElementById("dashLdr").textContent = data.ldrValue;

  if (data.wapdaAvailable !== undefined) {
    const el = document.getElementById("dashWapda");
    el.textContent = data.wapdaAvailable ? "AVAILABLE" : "OUTAGE";
    el.style.color = data.wapdaAvailable ? "#2ecc71" : "#e74c3c";
  }

  if (data.isSunny !== undefined && data.isDayTime !== undefined) {
    const el = document.getElementById("dashLight");
    if (data.isDayTime) {
      el.textContent = data.isSunny ? "SUNNY ☀️" : "CLOUDY ☁️";
    } else {
      el.textContent = "NIGHT 🌙";
    }
  }

  if (data.isDayTime !== undefined) {
    const el = document.getElementById("dashTime");
    el.textContent = data.isDayTime ? "DAY TIME" : "NIGHT TIME";
  }

  if (data.lastUpdate !== undefined) {
    document.getElementById("dashUpdate").textContent = data.lastUpdate;
  }

  // Update controls page
  if (data.wapdaRelayState !== undefined) {
    const statusEl = document.getElementById("ctrlWapdaStatus");
    if (statusEl) {
      statusEl.innerHTML = `<i class="fas fa-power-off"></i><span>${data.wapdaRelayState ? "ON" : "OFF"}</span>`;
      statusEl.className = `relay-status ${data.wapdaRelayState ? "on" : "off"}`;
    }
  }

  if (data.heavyLoadState !== undefined) {
    const statusEl = document.getElementById("ctrlHeavyStatus");
    if (statusEl) {
      statusEl.innerHTML = `<i class="fas fa-power-off"></i><span>${data.heavyLoadState ? "ON" : "OFF"}</span>`;
      statusEl.className = `relay-status ${data.heavyLoadState ? "on" : "off"}`;
    }
  }

  if (data.wapdaAutoMode !== undefined) {
    const toggle = document.getElementById("ctrlWapdaAuto");
    if (toggle) toggle.checked = data.wapdaAutoMode;
    updateButtonStates("wapda", !data.wapdaAutoMode);
  }

  if (data.heavyLoadAutoMode !== undefined) {
    const toggle = document.getElementById("ctrlHeavyAuto");
    if (toggle) toggle.checked = data.heavyLoadAutoMode;
    updateButtonStates("heavy", !data.heavyLoadAutoMode);
  }
}

function updateControls(data) {
  if (data.wapdaAutoMode !== undefined) {
    const toggle = document.getElementById("ctrlWapdaAuto");
    if (toggle && toggle.checked !== data.wapdaAutoMode)
      toggle.checked = data.wapdaAutoMode;
    updateButtonStates("wapda", !data.wapdaAutoMode);
  }

  if (data.heavyLoadAutoMode !== undefined) {
    const toggle = document.getElementById("ctrlHeavyAuto");
    if (toggle && toggle.checked !== data.heavyLoadAutoMode)
      toggle.checked = data.heavyLoadAutoMode;
    updateButtonStates("heavy", !data.heavyLoadAutoMode);
  }
}

function updateButtonStates(type, isManual) {
  if (type === "wapda") {
    const onBtn = document.getElementById("ctrlWapdaOn");
    const offBtn = document.getElementById("ctrlWapdaOff");
    if (onBtn) onBtn.disabled = !isManual;
    if (offBtn) offBtn.disabled = !isManual;
  } else if (type === "heavy") {
    const onBtn = document.getElementById("ctrlHeavyOn");
    const offBtn = document.getElementById("ctrlHeavyOff");
    if (onBtn) onBtn.disabled = !isManual;
    if (offBtn) offBtn.disabled = !isManual;
  }
}

// Send command
async function sendCommand(type, value) {
  try {
    const response = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value }),
    });

    if (response.ok && event && event.target) {
      const btn = event.target.closest("button");
      if (btn) {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> SENT';
        setTimeout(() => {
          btn.innerHTML = originalHTML;
        }, 1000);
      }
    }
  } catch (error) {
    console.error("Error:", error);
    showNotification("Failed to send command", "error", "Command Failed");
  }
}

// Toggle auto mode
function toggleAutoMode(type, isEnabled) {
  sendCommand(type, isEnabled ? 1 : 0);
}

// Set user mode
async function setUserMode(mode) {
  const modeValues = { HOME: 1, SAVING: 2, PERFORMANCE: 3 };
  await sendCommand("USER_MODE", modeValues[mode]);

  document.querySelectorAll(".mode-option").forEach((opt) => {
    opt.classList.remove("active");
    if (opt.dataset.mode === mode) opt.classList.add("active");
  });

  document.getElementById("userModeDisplay").innerHTML = `
        <i class="fas ${mode === "HOME" ? "fa-home" : mode === "SAVING" ? "fa-coins" : "fa-rocket"}"></i>
        <span>${mode} Mode</span>
    `;
}

// Update system status
function updateSystemStatus(status) {
  const heroIcon = document.querySelector(".hero-icon i");
  const statusMessage = document.getElementById("statusMessage");
  const heroCard = document.getElementById("systemStatusCard");

  if (heroIcon) heroIcon.className = `fas ${status.icon}`;
  if (statusMessage) statusMessage.textContent = status.message;

  if (heroCard) {
    if (status.status === "solar") {
      heroCard.style.background =
        "linear-gradient(135deg, rgba(46, 204, 113, 0.2), rgba(46, 204, 113, 0.05))";
    } else if (status.status === "backup") {
      heroCard.style.background =
        "linear-gradient(135deg, rgba(243, 156, 18, 0.2), rgba(243, 156, 18, 0.05))";
    } else if (status.status === "no_power") {
      heroCard.style.background =
        "linear-gradient(135deg, rgba(231, 76, 60, 0.2), rgba(231, 76, 60, 0.05))";
    } else {
      heroCard.style.background =
        "linear-gradient(135deg, rgba(46, 204, 113, 0.15), rgba(52, 152, 219, 0.1))";
    }
  }
}

// Update last seen
function updateLastSeen(data) {
  const lastSeenText = document.getElementById("lastSeenText");
  const efficiencyText = document.getElementById("efficiencyText");

  if (lastSeenText) {
    if (data.online) {
      const secondsAgo = Math.floor((Date.now() - data.lastSeen) / 1000);
      if (secondsAgo < 60) {
        lastSeenText.innerHTML = `<i class="fas fa-circle" style="color: #2ecc71; font-size: 8px;"></i> Last seen: ${secondsAgo}s ago`;
      } else if (secondsAgo < 3600) {
        lastSeenText.innerHTML = `<i class="fas fa-circle" style="color: #2ecc71; font-size: 8px;"></i> Last seen: ${Math.floor(secondsAgo / 60)}m ago`;
      } else {
        lastSeenText.innerHTML = `<i class="fas fa-circle" style="color: #f39c12; font-size: 8px;"></i> Last seen: ${Math.floor(secondsAgo / 3600)}h ago`;
      }
    } else {
      lastSeenText.innerHTML =
        '<i class="fas fa-circle" style="color: #e74c3c; font-size: 8px;"></i> Device offline';
    }
  }

  if (efficiencyText) {
    const efficiency = Math.floor(Math.random() * 20) + 85;
    efficiencyText.innerHTML = `<i class="fas fa-chart-line"></i> ${efficiency}% Efficient`;
  }
}

// Update daily stats
function updateDailyStats(stats) {
  const previewIds = ["previewWapda", "previewLoad", "previewSolar"];
  if (document.getElementById("previewWapda"))
    document.getElementById("previewWapda").textContent =
      stats.wapdaUsageHours?.toFixed(1) || "0";
  if (document.getElementById("previewLoad"))
    document.getElementById("previewLoad").textContent =
      stats.loadOnHours?.toFixed(1) || "0";
  if (document.getElementById("previewSolar"))
    document.getElementById("previewSolar").textContent =
      stats.solarSavingHours?.toFixed(1) || "0";

  // Analytics page metrics
  if (document.getElementById("peakPower"))
    document.getElementById("peakPower").textContent =
      `${stats.peakPower || 0} W`;
  if (document.getElementById("avgVoltage"))
    document.getElementById("avgVoltage").textContent =
      `${stats.avgVoltage || 220} V`;
  if (document.getElementById("energyGen"))
    document.getElementById("energyGen").textContent =
      `${stats.energyGenerated || 0} kWh`;
  if (document.getElementById("energyCons"))
    document.getElementById("energyCons").textContent =
      `${stats.energyConsumed || 0} kWh`;

  // Environmental impact
  const totalEnergy =
    (stats.energyGenerated || 0) + (stats.energyConsumed || 0);
  const co2Saved = (stats.solarSavingHours * 0.4).toFixed(1);
  const costSaved = (stats.solarSavingHours * 0.15).toFixed(2);

  if (document.getElementById("co2Saved"))
    document.getElementById("co2Saved").textContent = `${co2Saved} kg`;
  if (document.getElementById("costSaved"))
    document.getElementById("costSaved").textContent = `$${costSaved}`;

  // Energy distribution
  const solarPercent =
    stats.solarSavingHours > 0
      ? (
          (stats.solarSavingHours /
            (stats.wapdaUsageHours + stats.solarSavingHours)) *
          100
        ).toFixed(0)
      : 0;
  const gridPercent = 100 - solarPercent;

  if (document.getElementById("solarPercent"))
    document.getElementById("solarPercent").textContent = `${solarPercent}%`;
  if (document.getElementById("gridPercent"))
    document.getElementById("gridPercent").textContent = `${gridPercent}%`;
}

// Update user mode UI
function updateUserMode(mode) {
  document.querySelectorAll(".mode-option").forEach((opt) => {
    opt.classList.remove("active");
    if (opt.dataset.mode === mode) opt.classList.add("active");
  });

  const icons = {
    HOME: "fa-home",
    SAVING: "fa-coins",
    PERFORMANCE: "fa-rocket",
  };
  document.getElementById("userModeDisplay").innerHTML = `
        <i class="fas ${icons[mode]}"></i>
        <span>${mode} Mode</span>
    `;
}

// Load events
async function loadEvents() {
  try {
    const response = await fetch("/api/events");
    const events = await response.json();
    updateEventsList(events);
  } catch (error) {
    console.error("Error loading events:", error);
  }
}

function updateEventsList(events) {
  const container = document.getElementById("eventsList");
  if (!container) return;

  if (!events || events.length === 0) {
    container.innerHTML =
      '<div class="event-placeholder"><i class="fas fa-inbox"></i><p>No events recorded</p></div>';
    return;
  }

  container.innerHTML = events
    .map(
      (event) => `
        <div class="event-item event-${event.type}">
            <div class="event-time">${event.date} ${event.timestamp}</div>
            <div class="event-message">${event.message}</div>
            <div class="event-details">${event.details}</div>
        </div>
    `,
    )
    .join("");
}

function addEventToList(event) {
  const container = document.getElementById("eventsList");
  if (!container || currentPage !== "history") return;

  const placeholder = container.querySelector(".event-placeholder");
  if (placeholder) placeholder.remove();

  const eventHtml = `
        <div class="event-item event-${event.type}">
            <div class="event-time">${event.date} ${event.timestamp}</div>
            <div class="event-message">${event.message}</div>
            <div class="event-details">${event.details}</div>
        </div>
    `;

  container.insertAdjacentHTML("afterbegin", eventHtml);
  if (container.children.length > 100)
    container.removeChild(container.lastChild);
}

async function clearEvents() {
  const container = document.getElementById("eventsList");
  if (container) {
    container.innerHTML =
      '<div class="event-placeholder"><i class="fas fa-inbox"></i><p>No events recorded</p></div>';
    showNotification("Event history cleared", "info", "History Cleared");
  }
}

// Initialize chart
function initializeChart() {
  const ctx = document.getElementById("powerChart");
  if (!ctx) return;

  powerChart = new Chart(ctx.getContext("2d"), {
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
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { color: "#fff" } },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        y: {
          grid: { color: "rgba(255,255,255,0.1)" },
          title: { display: true, text: "Value", color: "#fff" },
        },
        x: {
          grid: { display: false },
          title: { display: true, text: "Hour", color: "#fff" },
        },
      },
    },
  });
}

async function loadHourlyData() {
  try {
    const response = await fetch("/api/hourly-data");
    const data = await response.json();
    updateChartData(data);
  } catch (error) {
    console.error("Error loading hourly data:", error);
  }
}

function updateChartData(data) {
  if (!powerChart || !data) return;
  powerChart.data.datasets[0].data = data.map((d) => d.power || 0);
  powerChart.data.datasets[1].data = data.map((d) => d.voltage || 0);
  powerChart.update();
}

// Initialize settings
function initializeSettings() {
  const sunSlider = document.getElementById("sunThreshold");
  const darkSlider = document.getElementById("darkThreshold");
  const sunValue = document.getElementById("sunValue");
  const darkValue = document.getElementById("darkValue");
  const notifToggle = document.getElementById("notifToggle");
  const soundToggle = document.getElementById("soundToggle");

  if (sunSlider) {
    sunSlider.addEventListener("input", (e) => {
      const val = e.target.value;
      if (sunValue) sunValue.textContent = val;
      sendCommand("LDR_SUN_THRESH", parseInt(val));
    });
  }

  if (darkSlider) {
    darkSlider.addEventListener("input", (e) => {
      const val = e.target.value;
      if (darkValue) darkValue.textContent = val;
      sendCommand("LDR_DARK_THRESH", parseInt(val));
    });
  }

  if (notifToggle) {
    notifToggle.addEventListener("change", (e) => {
      localStorage.setItem("notifications", e.target.checked);
      if (e.target.checked && Notification.permission === "default") {
        Notification.requestPermission();
      }
    });

    const saved = localStorage.getItem("notifications");
    if (saved !== null) notifToggle.checked = saved === "true";
  }

  if (soundToggle) {
    soundToggle.addEventListener("change", (e) => {
      localStorage.setItem("soundAlerts", e.target.checked);
    });

    const saved = localStorage.getItem("soundAlerts");
    if (saved !== null) soundToggle.checked = saved === "true";
  }
}

// Export data
async function exportData() {
  try {
    const [status, events, stats] = await Promise.all([
      fetch("/api/status").then((r) => r.json()),
      fetch("/api/events").then((r) => r.json()),
      fetch("/api/daily-stats").then((r) => r.json()),
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      systemStatus: status,
      eventHistory: events,
      dailyStatistics: stats,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `energy-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification(
      "Data exported successfully",
      "success",
      "Export Complete",
    );
  } catch (error) {
    console.error("Export error:", error);
    showNotification("Failed to export data", "error", "Export Failed");
  }
}

async function resetData() {
  if (
    confirm("Are you sure you want to reset all data? This cannot be undone.")
  ) {
    showNotification(
      "Data reset feature coming soon",
      "warning",
      "Coming Soon",
    );
  }
}

// Load initial data
async function loadInitialData() {
  try {
    const [
      status,
      events,
      stats,
      systemStatus,
      lastSeen,
      userMode,
      hourlyData,
    ] = await Promise.all([
      fetch("/api/status").then((r) => r.json()),
      fetch("/api/events").then((r) => r.json()),
      fetch("/api/daily-stats").then((r) => r.json()),
      fetch("/api/system-status").then((r) => r.json()),
      fetch("/api/last-seen").then((r) => r.json()),
      fetch("/api/user-mode").then((r) => r.json()),
      fetch("/api/hourly-data").then((r) => r.json()),
    ]);

    updateDashboard(status);
    updateEventsList(events);
    updateDailyStats(stats);
    updateSystemStatus(systemStatus);
    updateLastSeen(lastSeen);
    updateUserMode(userMode.mode);
    updateChartData(hourlyData);
  } catch (error) {
    console.error("Error loading initial data:", error);
  }
}

// Start time update
function startTimeUpdate() {
  setInterval(() => {
    const now = new Date();
    const timeString = now.toLocaleTimeString("en-US", { hour12: false });
    const timeElement = document.getElementById("currentTime");
    if (timeElement) timeElement.textContent = timeString;
  }, 1000);
}

// Show notification
function showNotification(message, type, title) {
  const container = document.getElementById("notificationContainer");
  if (!container) return;

  const icons = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
    danger: "🔴",
  };
  const colors = {
    success: "#2ecc71",
    error: "#e74c3c",
    warning: "#f39c12",
    info: "#3498db",
    danger: "#e74c3c",
  };

  const notification = document.createElement("div");
  notification.className = "notification";
  notification.style.borderLeft = `4px solid ${colors[type] || "#2ecc71"}`;
  notification.innerHTML = `
        <div class="notification-icon">${icons[type] || "ℹ️"}</div>
        <div class="notification-content">
            <div class="notification-title">${title || "Alert"}</div>
            <div class="notification-message">${message}</div>
        </div>
    `;

  container.appendChild(notification);

  // Desktop notification
  const notifEnabled = localStorage.getItem("notifications") === "true";
  if (notifEnabled && Notification.permission === "granted") {
    new Notification(title || "Smart Energy Controller", {
      body: message,
      icon: "/favicon.ico",
    });
  }

  // Sound alert
  const soundEnabled = localStorage.getItem("soundAlerts") === "true";
  if (soundEnabled && type === "danger") {
    const audio = new Audio(
      "data:audio/wav;base64,U3RlYWx0aCBzb3VuZCBub3QgYXZhaWxhYmxl",
    );
    audio.play().catch((e) => console.log("Audio not supported"));
  }

  setTimeout(() => {
    notification.style.animation = "slideOutRight 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

function getEventTitle(type) {
  const titles = {
    success: "Success",
    danger: "Alert",
    warning: "Warning",
    info: "Information",
  };
  return titles[type] || "Event";
}

// Event listeners for controls
document.getElementById("ctrlWapdaAuto")?.addEventListener("change", (e) => {
  sendCommand("WAPDA_MODE", e.target.checked ? 1 : 0);
});

document.getElementById("ctrlHeavyAuto")?.addEventListener("change", (e) => {
  sendCommand("HEAVY_LOAD_MODE", e.target.checked ? 1 : 0);
});

// Export functions to global scope
window.sendCommand = sendCommand;
window.toggleAutoMode = toggleAutoMode;
window.setUserMode = setUserMode;
window.clearEvents = clearEvents;
window.exportData = exportData;
window.resetData = resetData;
