// ========== SOCKET CONNECTION ==========
const socket = io();

// ========== CHART INSTANCES ==========
let powerChart = null;
let voltageChart = null;
let solarChart = null;

// ========== DOM ELEMENTS ==========
let currentPage = "dashboard";
let currentAnimationState = null;

// ========== INITIALIZATION ==========
document.addEventListener("DOMContentLoaded", () => {
  initializeNavigation();
  initializeSocket();
  initializeCharts();
  initializeSettings();
  initializeControls();
  loadInitialData();
  startTimeUpdate();
  requestNotificationPermission();
});

// ========== NAVIGATION ==========
function initializeNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      switchPage(page);

      document
        .querySelectorAll(".nav-item")
        .forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
    });
  });
}

function switchPage(page) {
  currentPage = page;

  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById(`page-${page}`).classList.add("active");

  const titles = {
    dashboard: { title: "Dashboard", subtitle: "Real-time energy monitoring" },
    controls: { title: "Controls", subtitle: "Manual & automatic control" },
    analytics: {
      title: "Analytics",
      subtitle: "Performance insights & trends",
    },
    history: { title: "History", subtitle: "System event log" },
    alerts: { title: "Alerts", subtitle: "System notifications & warnings" },
    settings: { title: "Settings", subtitle: "Configure system parameters" },
  };

  document.getElementById("pageTitle").textContent = titles[page].title;
  document.getElementById("pageSubtitle").textContent = titles[page].subtitle;

  if (page === "analytics" && powerChart) {
    loadHourlyData();
  }
  if (page === "alerts") {
    loadAlerts();
  }
  if (page === "history") {
    loadEvents();
  }
}

// ========== SOCKET EVENT HANDLERS ==========
function initializeSocket() {
  socket.on("connect", () => {
    console.log("✅ Connected to server");
    updateConnectionStatus(true);
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected from server");
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
  });

  socket.on("new-alert", (alert) => {
    addAlertToList(alert);
    updateAlertBadge();
    showNotification(alert.message, alert.type, getAlertTitle(alert.priority));
  });

  socket.on("events-list", (events) => {
    if (currentPage === "history") updateEventsList(events);
  });

  socket.on("alerts-list", (alerts) => {
    if (currentPage === "alerts") updateAlertsList(alerts);
    updateAlertBadgeCount(alerts);
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
    updateCharts(data);
  });
}

// ========== CONNECTION STATUS ==========
function updateConnectionStatus(connected) {
  const espStatusDot = document.getElementById("espStatusDot");
  const espStatusText = document.getElementById("espStatusText");

  if (connected) {
    if (espStatusDot) espStatusDot.className = "status-dot online";
    if (espStatusText) espStatusText.textContent = "ESP32 Online";
  } else {
    if (espStatusDot) espStatusDot.className = "status-dot offline";
    if (espStatusText) espStatusText.textContent = "ESP32 Offline";
  }
}

// ========== UPDATE DASHBOARD ==========
function updateDashboard(data) {
  updateWeatherAnimation(data);
  // Quick metrics
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

  // Status grid
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
    let updateText = data.lastUpdate;
    if (typeof data.lastUpdate === "number") {
      updateText = new Date(data.lastUpdate).toLocaleTimeString("en-US", {
        hour12: true,
      });
    }
    document.getElementById("dashUpdate").textContent = updateText;
  }
}

function updateWeatherAnimation(data) {
  if (data.isDayTime === undefined) return;
  const container = document.getElementById("weatherBg");
  if (!container) return;

  let state = "night";
  let solarIntensity = data.ldrValue || 0;

  if (data.isDayTime) {
    // Sunny: LDR > 1800, Cloudy: LDR between 800-1800, Dark: LDR < 800
    if (solarIntensity > 1800) {
      state = "sunny";
    } else if (solarIntensity > 800 && solarIntensity <= 1800) {
      state = "cloudy";
    } else {
      state = "dark";
    }
  } else {
    state = "night";
  }

  if (currentAnimationState === state) return;
  currentAnimationState = state;

  if (state === "sunny") {
    // Sunny animation with sun rays and solar panels
    container.innerHTML = `
            <div class="sun-anim"></div>
            <div class="solar-panel-container">
                <div class="solar-panel">
                    <div class="solar-panel-grid"></div>
                </div>
            </div>
            <div class="ray-falling"></div>
            <div class="ray-falling"></div>
            <div class="ray-falling"></div>
            <div class="sun-ray" style="transform: rotate(0deg) translateX(100px); width: 150px;"></div>
            <div class="sun-ray" style="transform: rotate(45deg) translateX(100px); width: 150px;"></div>
            <div class="sun-ray" style="transform: rotate(90deg) translateX(100px); width: 150px;"></div>
            <div class="sun-ray" style="transform: rotate(135deg) translateX(100px); width: 150px;"></div>
            <div class="sun-ray" style="transform: rotate(180deg) translateX(100px); width: 150px;"></div>
            <div class="sun-ray" style="transform: rotate(225deg) translateX(100px); width: 150px;"></div>
            <div class="sun-ray" style="transform: rotate(270deg) translateX(100px); width: 150px;"></div>
            <div class="sun-ray" style="transform: rotate(315deg) translateX(100px); width: 150px;"></div>
        `;
    container.className = "weather-animation-container sunny active";
  } else if (state === "cloudy") {
    // Cloudy animation with clouds, weak sun, and wind
    container.innerHTML = `
            <div class="cloud-anim cloud-anim-1"></div>
            <div class="cloud-anim cloud-anim-2"></div>
            <div class="cloud-anim cloud-anim-3"></div>
            <div class="weak-sun"></div>
            <div class="wind-line"></div>
            <div class="wind-line"></div>
            <div class="wind-line"></div>
            <div class="wind-line"></div>
            <div class="solar-panel-container">
                <div class="solar-panel">
                    <div class="solar-panel-grid"></div>
                </div>
            </div>
        `;
    container.className = "weather-animation-container cloudy active";
  } else if (state === "dark") {
    // Dark/Thunderstorm animation with dark clouds, lightning, and rain
    container.innerHTML = `
            <div class="dark-cloud dark-cloud-1"></div>
            <div class="dark-cloud dark-cloud-2"></div>
            <div class="dark-cloud dark-cloud-3"></div>
            <div class="lightning"><i class="fas fa-bolt"></i></div>
            <div class="lightning"><i class="fas fa-bolt"></i></div>
            <div class="rain-drop"></div>
            <div class="rain-drop"></div>
            <div class="rain-drop"></div>
            <div class="rain-drop"></div>
            <div class="rain-drop"></div>
            <div class="rain-drop"></div>
            <div class="solar-panel-container">
                <div class="solar-panel" style="opacity: 0.3;">
                    <div class="solar-panel-grid"></div>
                </div>
            </div>
        `;
    container.className = "weather-animation-container dark active";
  } else if (state === "night") {
    // Night animation with moon, stars, shooting stars, and nebula
    container.innerHTML = `
            <div class="moon-anim">
                <div class="moon-crater moon-crater-1"></div>
                <div class="moon-crater moon-crater-2"></div>
                <div class="moon-crater moon-crater-3"></div>
            </div>
            <div class="stars-container">
                <div class="star star-1"></div>
                <div class="star star-2"></div>
                <div class="star star-3"></div>
                <div class="star star-4"></div>
                <div class="star star-5"></div>
                <div class="star star-6"></div>
                <div class="star star-7"></div>
                <div class="star star-8"></div>
                <div class="star star-9"></div>
                <div class="star star-10"></div>
            </div>
            <div class="shooting-star"></div>
            <div class="nebula"></div>
            <div class="solar-panel-container">
                <div class="solar-panel" style="opacity: 0.2;">
                    <div class="solar-panel-grid"></div>
                </div>
            </div>
        `;
    container.className = "weather-animation-container night active";
  }
}

// ========== UPDATE CONTROLS ==========
function updateControls(data) {
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

// ========== SEND COMMAND ==========
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

function toggleAutoMode(type, isEnabled) {
  sendCommand(type, isEnabled ? 1 : 0);
}

// ========== USER MODES ==========
async function setUserMode(mode) {
  const modeValues = { HOME: 1, SAVING: 2, PERFORMANCE: 3 };
  await sendCommand("USER_MODE", modeValues[mode]);

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

// ========== UPDATE SYSTEM STATUS ==========
function updateSystemStatus(status) {
  const statusIcon = document.getElementById("statusIcon");
  const statusMessage = document.getElementById("statusMessage");
  const statusBadge = document.getElementById("statusBadge");
  const systemCard = document.getElementById("systemStatusCard");

  if (statusIcon) statusIcon.innerHTML = `<i class="fas ${status.icon}"></i>`;
  if (statusMessage) statusMessage.textContent = status.message;

  if (statusBadge) {
    statusBadge.innerHTML = `<span id="statusText">${status.status.toUpperCase()}</span>`;
  }

  if (systemCard) {
    let gradient = "transparent";
    const weatherBg = document.getElementById("weatherBg");

    if (status.status === "offline") {
      gradient =
        "linear-gradient(135deg, rgba(231, 76, 60, 0.25), rgba(231, 76, 60, 0.1))";
      if (weatherBg) weatherBg.style.display = "none";
    } else if (status.status === "no_power") {
      gradient =
        "linear-gradient(135deg, rgba(231, 76, 60, 0.3), rgba(231, 76, 60, 0.15))";
      if (weatherBg) weatherBg.style.display = "none";
    } else if (status.status === "backup") {
      gradient =
        "linear-gradient(135deg, rgba(243, 156, 18, 0.25), rgba(243, 156, 18, 0.1))";
      if (weatherBg) weatherBg.style.display = "none";
    } else {
      // Normal or solar, show weather animation
      if (weatherBg) weatherBg.style.display = "block";
    }

    systemCard.style.background = gradient;
  }
}

// ========== UPDATE LAST SEEN ==========
function updateLastSeen(data) {
  const espStatusText = document.getElementById("espStatusText");
  const espStatusDot = document.getElementById("espStatusDot");

  if (data.online) {
    if (espStatusDot) espStatusDot.className = "status-dot online";
    if (espStatusText) espStatusText.textContent = "ESP32 Online";
  } else {
    if (espStatusDot) espStatusDot.className = "status-dot offline";
    if (espStatusText) espStatusText.textContent = "ESP32 Offline";
  }
}

// ========== UPDATE DAILY STATS ==========
function updateDailyStats(stats) {
  // Dashboard summary
  if (document.getElementById("summaryWapda"))
    document.getElementById("summaryWapda").textContent =
      stats.wapdaUsageHours?.toFixed(1) || "0";
  if (document.getElementById("summaryLoad"))
    document.getElementById("summaryLoad").textContent =
      stats.loadOnHours?.toFixed(1) || "0";
  if (document.getElementById("summarySolar"))
    document.getElementById("summarySolar").textContent =
      stats.solarSavingHours?.toFixed(1) || "0";
  if (document.getElementById("summaryUnitsSaved"))
    document.getElementById("summaryUnitsSaved").textContent =
      stats.unitsSaved || "0";

  // Cost section
  if (document.getElementById("unitsConsumed"))
    document.getElementById("unitsConsumed").textContent =
      stats.unitsConsumed || "0";
  if (document.getElementById("unitsSaved"))
    document.getElementById("unitsSaved").textContent = stats.unitsSaved || "0";
  if (document.getElementById("costUsed"))
    document.getElementById("costUsed").textContent = stats.costUsed || "0";
  if (document.getElementById("costSaved"))
    document.getElementById("costSaved").textContent = stats.costSaved || "0";

  // Analytics page
  if (document.getElementById("peakPower"))
    document.getElementById("peakPower").textContent =
      `${stats.peakPower || 0} W`;
  if (document.getElementById("avgVoltage"))
    document.getElementById("avgVoltage").textContent =
      `${stats.avgVoltage || 220} V`;
  if (document.getElementById("energyGen"))
    document.getElementById("energyGen").textContent =
      `${(stats.energyGenerated / 1000).toFixed(2) || 0} kWh`;
  if (document.getElementById("energyCons"))
    document.getElementById("energyCons").textContent =
      `${(stats.energyConsumed / 1000).toFixed(2) || 0} kWh`;

  // Environmental impact
  const co2Saved = ((stats.unitsSaved || 0) * 0.4).toFixed(1);
  if (document.getElementById("co2Saved"))
    document.getElementById("co2Saved").textContent = `${co2Saved} kg`;
  if (document.getElementById("costSavedAnalytics"))
    document.getElementById("costSavedAnalytics").textContent =
      `$${stats.costSaved || 0}`;
  if (document.getElementById("unitsSavedAnalytics"))
    document.getElementById("unitsSavedAnalytics").textContent =
      `${stats.unitsSaved || 0} kWh`;

  // Energy distribution
  const total = stats.solarSavingHours + stats.wapdaUsageHours || 1;
  const solarPercent = ((stats.solarSavingHours / total) * 100).toFixed(0);
  const gridPercent = 100 - solarPercent;

  if (document.getElementById("solarPercent"))
    document.getElementById("solarPercent").textContent = `${solarPercent}%`;
  if (document.getElementById("gridPercent"))
    document.getElementById("gridPercent").textContent = `${gridPercent}%`;
  if (document.getElementById("solarBarFill"))
    document.getElementById("solarBarFill").style.width = `${solarPercent}%`;
  if (document.getElementById("gridBarFill"))
    document.getElementById("gridBarFill").style.width = `${gridPercent}%`;
}

// ========== CHARTS ==========
function initializeCharts() {
  const powerCtx = document.getElementById("powerChart")?.getContext("2d");
  const voltageCtx = document.getElementById("voltageChart")?.getContext("2d");
  const solarCtx = document.getElementById("solarChart")?.getContext("2d");

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { labels: { color: "#fff" } },
      tooltip: { mode: "index", intersect: false },
    },
    scales: {
      y: { grid: { color: "rgba(255,255,255,0.1)" }, ticks: { color: "#fff" } },
      x: { grid: { display: false }, ticks: { color: "#fff" } },
    },
  };

  if (powerCtx) {
    powerChart = new Chart(powerCtx, {
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
        ],
      },
      options: commonOptions,
    });
  }

  if (voltageCtx) {
    voltageChart = new Chart(voltageCtx, {
      type: "line",
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: [
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
      options: commonOptions,
    });
  }

  if (solarCtx) {
    solarChart = new Chart(solarCtx, {
      type: "line",
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: [
          {
            label: "Solar Intensity (lux)",
            data: Array(24).fill(0),
            borderColor: "#f39c12",
            backgroundColor: "rgba(243, 156, 18, 0.1)",
            tension: 0.4,
            fill: true,
            borderWidth: 2,
          },
        ],
      },
      options: commonOptions,
    });
  }
}

async function loadHourlyData() {
  try {
    const response = await fetch("/api/hourly-data");
    const data = await response.json();
    updateCharts(data);
  } catch (error) {
    console.error("Error loading hourly data:", error);
  }
}

function updateCharts(data) {
  if (!data) return;

  if (powerChart) {
    powerChart.data.datasets[0].data = data.map((d) => d.power || 0);
    powerChart.update();
  }

  if (voltageChart) {
    voltageChart.data.datasets[0].data = data.map((d) => d.voltage || 0);
    voltageChart.update();
  }

  if (solarChart) {
    solarChart.data.datasets[0].data = data.map((d) => d.ldrValue || 0);
    solarChart.update();
  }
}

// ========== EVENTS HISTORY ==========
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
  try {
    await fetch("/api/clear-events", { method: "DELETE" });
    loadEvents();
    showNotification("Event history cleared", "info", "History Cleared");
  } catch (error) {
    console.error("Error clearing events:", error);
  }
}

// ========== ALERTS ==========
async function loadAlerts() {
  try {
    const response = await fetch("/api/alerts");
    const alerts = await response.json();
    updateAlertsList(alerts);
    updateAlertBadgeCount(alerts);
  } catch (error) {
    console.error("Error loading alerts:", error);
  }
}

function updateAlertsList(alerts) {
  const container = document.getElementById("alertsList");
  if (!container) return;

  if (!alerts || alerts.length === 0) {
    container.innerHTML =
      '<div class="alert-placeholder"><i class="fas fa-bell-slash"></i><p>No alerts</p></div>';
    return;
  }

  container.innerHTML = alerts
    .map(
      (alert) => `
        <div class="alert-item alert-${alert.priority}">
            <div class="alert-time">${alert.date} ${alert.timestamp}</div>
            <div class="alert-message">${alert.message}</div>
            <div class="alert-details">Priority: ${alert.priority.toUpperCase()}</div>
        </div>
    `,
    )
    .join("");
}

function addAlertToList(alert) {
  const container = document.getElementById("alertsList");
  if (!container || currentPage !== "alerts") return;

  const placeholder = container.querySelector(".alert-placeholder");
  if (placeholder) placeholder.remove();

  const alertHtml = `
        <div class="alert-item alert-${alert.priority}">
            <div class="alert-time">${alert.date} ${alert.timestamp}</div>
            <div class="alert-message">${alert.message}</div>
            <div class="alert-details">Priority: ${alert.priority.toUpperCase()}</div>
        </div>
    `;

  container.insertAdjacentHTML("afterbegin", alertHtml);
}

function updateAlertBadgeCount(alerts) {
  const badge = document.getElementById("alertBadge");
  if (badge) {
    const unreadCount = alerts.filter((a) => !a.read).length;
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? "block" : "none";
  }
}

function updateAlertBadge() {
  const badge = document.getElementById("alertBadge");
  if (badge) {
    let currentCount = parseInt(badge.textContent) || 0;
    badge.textContent = currentCount + 1;
    badge.style.display = "block";
  }
}

async function clearAlerts() {
  try {
    await fetch("/api/clear-alerts", { method: "DELETE" });
    loadAlerts();
    showNotification("Alerts cleared", "info", "Alerts Cleared");
  } catch (error) {
    console.error("Error clearing alerts:", error);
  }
}

function getAlertTitle(priority) {
  const titles = { high: "⚠️ Alert", medium: "⚠️ Warning", low: "ℹ️ Info" };
  return titles[priority] || "Alert";
}

// ========== SETTINGS ==========
function initializeSettings() {
  const sunSlider = document.getElementById("sunThreshold");
  const darkSlider = document.getElementById("darkThreshold");
  const sunValue = document.getElementById("sunValue");
  const darkValue = document.getElementById("darkValue");
  const notifToggle = document.getElementById("notifToggle");

  if (sunSlider) {
    sunSlider.addEventListener("input", (e) => {
      const val = e.target.value;
      if (sunValue) sunValue.textContent = val;
    });
  }

  if (darkSlider) {
    darkSlider.addEventListener("input", (e) => {
      const val = e.target.value;
      if (darkValue) darkValue.textContent = val;
    });
  }

  if (notifToggle) {
    notifToggle.addEventListener("change", (e) => {
      localStorage.setItem("notifications", e.target.checked);
      if (
        e.target.checked &&
        "Notification" in window &&
        Notification.permission !== "granted"
      ) {
        Notification.requestPermission();
      }
    });
    const saved = localStorage.getItem("notifications");
    if (saved !== null) notifToggle.checked = saved === "true";
  }
}

function saveThresholds() {
  const sunThreshold = document.getElementById("sunThreshold")?.value;
  const darkThreshold = document.getElementById("darkThreshold")?.value;

  if (sunThreshold) sendCommand("LDR_SUN_THRESH", parseInt(sunThreshold));
  if (darkThreshold) sendCommand("LDR_DARK_THRESH", parseInt(darkThreshold));

  showNotification(
    "Thresholds saved successfully",
    "success",
    "Settings Saved",
  );
}

// ========== NOTIFICATIONS ==========
function requestNotificationPermission() {
  if (
    "Notification" in window &&
    localStorage.getItem("notifications") === "true"
  ) {
    Notification.requestPermission();
  }
}

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

  if (
    localStorage.getItem("notifications") === "true" &&
    Notification.permission === "granted"
  ) {
    new Notification(title || "Smart Energy Controller", {
      body: message,
      icon: "/favicon.ico",
    });
  }

  setTimeout(() => {
    notification.style.animation = "slideOutRight 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// ========== DATA MANAGEMENT ==========
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

function resetData() {
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

// ========== LOAD INITIAL DATA ==========
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
    updateCharts(hourlyData);
    updateAlertBadgeCount([]);
  } catch (error) {
    console.error("Error loading initial data:", error);
  }
}

// ========== TIME UPDATE ==========
function startTimeUpdate() {
  setInterval(() => {
    const now = new Date();
    const timeString = now.toLocaleTimeString("en-US", { hour12: false });
    const timeElement = document.getElementById("currentTime");
    if (timeElement) timeElement.textContent = timeString;
  }, 1000);
}

// ========== EVENT LISTENERS FOR CONTROLS ==========
function initializeControls() {
  document.getElementById("ctrlWapdaAuto")?.addEventListener("change", (e) => {
    sendCommand("WAPDA_MODE", e.target.checked ? 1 : 0);
  });

  document.getElementById("ctrlHeavyAuto")?.addEventListener("change", (e) => {
    sendCommand("HEAVY_LOAD_MODE", e.target.checked ? 1 : 0);
  });
}

// ========== EXPORT GLOBAL FUNCTIONS ==========
window.sendCommand = sendCommand;
window.toggleAutoMode = toggleAutoMode;
window.setUserMode = setUserMode;
window.clearEvents = clearEvents;
window.clearAlerts = clearAlerts;
window.saveThresholds = saveThresholds;
window.exportData = exportData;
window.resetData = resetData;
