// Socket connection
const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

socket.on('connect', () => {
    console.log('Socket.IO connected:', socket.id);
});

socket.on('connect_error', (err) => {
    console.error('Socket.IO connect_error:', err.message || err);
    showToast('Socket connection failed', true);
});

socket.on('disconnect', (reason) => {
    console.warn('Socket.IO disconnected:', reason);
    showToast('Socket disconnected', true);
});

// Chart instances
let powerChart, voltageCurrentChart, wapdaChart;

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const toast = document.getElementById('toast');

// Helper: Show toast notification
function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = 'show' + (isError ? ' error' : '');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.className = '', 3000);
}

// Helper: Get LDR info based on raw value
function getLDRInfo(ldrRaw) {
    if (ldrRaw < 200) return { icon: '☀️', condition: 'Very Bright', barColor: '#f39c12' };
    if (ldrRaw < 800) return { icon: '🌤️', condition: 'Bright', barColor: '#e67e22' };
    if (ldrRaw < 2000) return { icon: '⛅', condition: 'Partly Cloudy', barColor: '#95a5a6' };
    if (ldrRaw < 3200) return { icon: '☁️', condition: 'Cloudy/Dark', barColor: '#7f8c8d' };
    return { icon: '🌙', condition: 'Very Dark', barColor: '#3498db' };
}

// Update entire UI with status data
function updateUIWithStatus(data) {
    // Power readings
    document.getElementById('voltage').textContent = (data.voltage || 0).toFixed(1);
    document.getElementById('current').textContent = (data.current || 0).toFixed(2);
    document.getElementById('power').textContent = (data.power || 0).toFixed(1);
    
    // LDR
    let ldrRaw = data.ldrValue !== undefined ? data.ldrValue : 1500;
    const ldrInfo = getLDRInfo(ldrRaw);
    const ldrPct = Math.min(100, Math.round((ldrRaw / 4095) * 100));
    
    document.getElementById('ldrDisplay').textContent = ldrRaw;
    document.getElementById('ldrValue').textContent = ldrRaw;
    document.getElementById('ldrValueCtrl').textContent = ldrRaw;
    document.getElementById('ldrCondCtrl').textContent = ldrInfo.condition;
    document.getElementById('ldrStatIcon').textContent = ldrInfo.icon;
    document.getElementById('ldrIcon').textContent = ldrInfo.icon;
    document.getElementById('sunlightStatus').textContent = ldrInfo.condition;
    document.getElementById('ldrCondition').textContent = ldrInfo.condition;
    document.getElementById('ldrBar').style.width = ldrPct + '%';
    document.getElementById('ldrBar').style.background = ldrInfo.barColor;
    document.getElementById('ldrBarPct').textContent = ldrPct + '% dark';
    
    // Time / day period
    const hour = data.currentHour !== undefined ? data.currentHour : new Date().getHours();
    const now = new Date();
    const minute = now.getMinutes();
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const dispHour = hour % 12 || 12;
    document.getElementById('currentTime').textContent = `${dispHour}:${String(minute).padStart(2, '0')} ${ampm}`;
    
    const badge = document.getElementById('periodBadge');
    if (data.isDayTime === true) {
        badge.textContent = '🌞 DAY (8AM–6PM)';
        badge.className = 'period-badge day';
    } else {
        badge.textContent = '🌙 NIGHT (6PM–8AM)';
        badge.className = 'period-badge night';
    }
    
    // Relay states
    const heavyOn = data.heavyLoadState === true;
    const wapdaOn = data.wapdaRelayState === true;
    
    function setBadge(elementId, isOn) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = isOn ? 'ON' : 'OFF';
            el.className = 'relay-status-badge ' + (isOn ? 'status-on' : 'status-off');
        }
    }
    
    setBadge('heavyLoadStatusBadge', heavyOn);
    setBadge('wapdaStatusBadge', wapdaOn);
    setBadge('ctrlHeavyLoadStatus', heavyOn);
    setBadge('ctrlWapdaStatus', wapdaOn);
    
    document.getElementById('heavyLoadState').textContent = heavyOn ? 'ON' : 'OFF';
    
    // Grid availability
    const gridAvail = data.wapdaAvailable === true;
    document.getElementById('wapdaAvailable').textContent = gridAvail ? 'AVAILABLE ✅' : 'NOT AVAILABLE ❌';
    
    // Modes
    const heavyAuto = data.heavyLoadAutoMode === true;
    const wapdaAuto = data.wapdaAutoMode === true;
    
    document.getElementById('heavyLoadMode').textContent = heavyAuto ? 'Auto' : 'Manual';
    document.getElementById('wapdaMode').textContent = wapdaAuto ? 'Auto' : 'Manual';
    document.getElementById('ctrlHeavyLoadMode').textContent = heavyAuto ? 'Auto' : 'Manual';
    document.getElementById('ctrlWapdaMode').textContent = wapdaAuto ? 'Auto' : 'Manual';
    
    // LDR settings
    const ldrEnabled = data.ldrControlEnabled === true;
    document.getElementById('ldrEnabledStatus').textContent = ldrEnabled ? 'Enabled ✅' : 'Disabled ❌';
    
    if (data.ldrSunThreshold !== undefined) {
        document.getElementById('sunThreshold').value = data.ldrSunThreshold;
        document.getElementById('sunThresholdVal').textContent = data.ldrSunThreshold;
        document.getElementById('sunBandNote').textContent = data.ldrSunThreshold;
    }
    if (data.ldrDarkThreshold !== undefined) {
        document.getElementById('darkThreshold').value = data.ldrDarkThreshold;
        document.getElementById('darkThresholdVal').textContent = data.ldrDarkThreshold;
        document.getElementById('darkBandNote').textContent = data.ldrDarkThreshold;
    }
    
    // Trends
    document.getElementById('voltageTrend').textContent = (data.voltage || 0) > 200 ? '↑ Stable Grid' : '↓ Low Voltage';
    document.getElementById('currentTrend').textContent = (data.current || 0) > 5 ? '↑ High Load' : '↓ Low Load';
    document.getElementById('powerTrend').textContent = (data.power || 0) > 500 ? '↑ High Consumption' : '↓ Low Consumption';
}

// ========== API CALLS ==========
async function controlRelay(relay, action) {
    const state = (action === 'on');
    try {
        const res = await fetch('/api/control/relay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relay, state })
        });
        const result = await res.json();
        if (result.success) {
            showToast(`${relay === 1 ? 'WAPDA' : 'Heavy Load'} → ${state ? 'ON' : 'OFF'} command sent ✅`);
        } else {
            showToast(`Command failed: ${result.message || 'unknown error'}`, true);
        }
    } catch (err) {
        showToast('Network error — could not send command', true);
    }
}

async function setMode(relay, auto) {
    try {
        const res = await fetch('/api/control/relay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relay, auto })
        });
        const result = await res.json();
        if (result.success) {
            showToast(`${relay === 1 ? 'WAPDA' : 'Heavy Load'} → ${auto ? 'AUTO' : 'MANUAL'} mode ✅`);
        } else {
            showToast('Mode change failed', true);
        }
    } catch (err) {
        showToast('Network error — could not set mode', true);
    }
}

async function toggleLDR(enabled) {
    try {
        const res = await fetch('/api/control/ldr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`LDR Control ${enabled ? 'Enabled' : 'Disabled'} ✅`);
        } else {
            showToast('LDR toggle failed', true);
        }
    } catch (err) {
        showToast('Network error — could not toggle LDR', true);
    }
}

function updateSunThreshold(val) {
    document.getElementById('sunThresholdVal').textContent = val;
    document.getElementById('sunBandNote').textContent = val;
}

function updateDarkThreshold(val) {
    document.getElementById('darkThresholdVal').textContent = val;
    document.getElementById('darkBandNote').textContent = val;
}

async function applyLDRSettings() {
    const sunVal = parseInt(document.getElementById('sunThreshold').value);
    const darkVal = parseInt(document.getElementById('darkThreshold').value);
    
    if (sunVal >= darkVal) {
        showToast('⚠️ Sunny threshold must be lower than Dark threshold!', true);
        return;
    }
    
    try {
        const res = await fetch('/api/control/ldr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                sunlightThreshold: sunVal, 
                darkThreshold: darkVal 
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`LDR thresholds applied (Sun: <${sunVal}, Dark: >${darkVal}) ✅`);
        } else {
            showToast('Failed to apply LDR settings', true);
        }
    } catch (err) {
        showToast('Network error — could not apply LDR settings', true);
    }
}

// ========== CHARTS & DATA ==========
async function loadHistory() {
    const hours = document.getElementById('timeRange')?.value || 24;
    try {
        const res = await fetch(`/api/historical?hours=${hours}`);
        const data = await res.json();
        if (!data.length) return;
        
        const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
        const powerData = data.map(d => d.power || 0);
        const voltageData = data.map(d => d.voltage || 0);
        const currentData = data.map(d => d.current || 0);
        const wapdaData = data.map(d => d.wapda_available || 0);
        
        if (powerChart) {
            powerChart.data.labels = labels;
            powerChart.data.datasets[0].data = powerData;
            powerChart.update();
        }
        
        if (voltageCurrentChart) {
            voltageCurrentChart.data.labels = labels;
            voltageCurrentChart.data.datasets[0].data = voltageData;
            voltageCurrentChart.data.datasets[1].data = currentData;
            voltageCurrentChart.update();
        }
        
        if (wapdaChart) {
            wapdaChart.data.labels = labels;
            wapdaChart.data.datasets[0].data = wapdaData;
            wapdaChart.update();
        }
    } catch (e) {
        console.warn('Error loading history:', e);
    }
}

async function loadSummary() {
    try {
        const res = await fetch('/api/summary');
        const data = await res.json();
        document.getElementById('avgVoltage').textContent = (data.avg_voltage || 0).toFixed(1) + ' V';
        document.getElementById('avgCurrent').textContent = (data.avg_current || 0).toFixed(2) + ' A';
        document.getElementById('avgPower').textContent = (data.avg_power || 0).toFixed(1) + ' W';
        document.getElementById('totalEnergy').textContent = (data.total_energy || 0).toFixed(2) + ' kWh';
    } catch (e) {
        console.warn('Error loading summary:', e);
    }
}

async function loadLogs() {
    try {
        const res = await fetch('/api/logs');
        const logs = await res.json();
        const tbody = document.getElementById('logsBody');
        
        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:rgba(255,255,255,0.4)">No logs yet</td></tr>';
            return;
        }
        
        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td>${log.relay || '--'}</td>
                <td>${log.action || '--'}</td>
                <td>${log.source || 'System'}</td>
                <td>${log.auto_mode ? 'Auto' : 'Manual'}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.warn('Error loading logs:', e);
    }
}

// Initialize charts
function initCharts() {
    const gridColor = 'rgba(255, 255, 255, 0.1)';
    
    powerChart = new Chart(document.getElementById('powerChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Power (W)',
                data: [],
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: 'white' } } },
            scales: {
                y: { grid: { color: gridColor }, ticks: { color: 'white' } },
                x: { ticks: { color: 'white' } }
            }
        }
    });
    
    voltageCurrentChart = new Chart(document.getElementById('voltageCurrentChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Voltage (V)',
                    data: [],
                    borderColor: '#3498db',
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Current (A)',
                    data: [],
                    borderColor: '#27ae60',
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: 'white' } } },
            scales: {
                y: {
                    position: 'left',
                    grid: { color: gridColor },
                    ticks: { color: 'white' }
                },
                y1: {
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#27ae60' }
                },
                x: { ticks: { color: 'white' } }
            }
        }
    });
    
    wapdaChart = new Chart(document.getElementById('wapdaChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Grid Available',
                data: [],
                borderColor: '#f39c12',
                backgroundColor: 'rgba(243, 156, 18, 0.1)',
                fill: true,
                stepped: true,
                tension: 0
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: 'white' } } },
            scales: {
                y: {
                    min: 0,
                    max: 1,
                    ticks: {
                        color: 'white',
                        callback: v => v === 1 ? 'Available' : 'Unavailable'
                    }
                },
                x: { ticks: { color: 'white' } }
            }
        }
    });
}

// ========== NAVIGATION ==========
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const page = item.dataset.page;
        
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`${page}-page`).classList.add('active');
        
        // Load data when switching to analytics or logs
        if (page === 'analytics') {
            loadHistory();
            loadSummary();
        }
        if (page === 'logs') {
            loadLogs();
        }
    });
});

// ========== BUTTON EVENT LISTENERS ==========
document.getElementById('btnHL_on').addEventListener('click', () => controlRelay(2, 'on'));
document.getElementById('btnHL_off').addEventListener('click', () => controlRelay(2, 'off'));
document.getElementById('btnHL_auto').addEventListener('click', () => setMode(2, true));
document.getElementById('btnHL_manual').addEventListener('click', () => setMode(2, false));

document.getElementById('btnW_on').addEventListener('click', () => controlRelay(1, 'on'));
document.getElementById('btnW_off').addEventListener('click', () => controlRelay(1, 'off'));
document.getElementById('btnW_auto').addEventListener('click', () => setMode(1, true));
document.getElementById('btnW_manual').addEventListener('click', () => setMode(1, false));

document.getElementById('btnLDR_enable').addEventListener('click', () => toggleLDR(true));
document.getElementById('btnLDR_disable').addEventListener('click', () => toggleLDR(false));
document.getElementById('btnLDR_apply').addEventListener('click', applyLDRSettings);

// Threshold sliders
document.getElementById('sunThreshold').addEventListener('input', (e) => updateSunThreshold(e.target.value));
document.getElementById('darkThreshold').addEventListener('input', (e) => updateDarkThreshold(e.target.value));

// Time range selector
document.getElementById('timeRange').addEventListener('change', loadHistory);

// ========== SOCKET EVENTS ==========
socket.on('connect', () => {
    statusDot.classList.add('connected');
    statusText.textContent = 'ESP32 Connected';
    showToast('Connected to server ✅');
});

socket.on('disconnect', () => {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Disconnected';
    showToast('Disconnected from server ❌', true);
});

socket.on('status_update', (data) => {
    updateUIWithStatus(data);
});

// Initial data fetch
async function fetchInitialStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        updateUIWithStatus(data);
    } catch (e) {
        console.warn('Failed to fetch initial status:', e);
    }
}

// ========== INITIALIZATION ==========
initCharts();
fetchInitialStatus();
loadHistory();
loadSummary();
loadLogs();

// Auto-refresh analytics every 30 seconds
setInterval(() => {
    if (document.getElementById('analytics-page').classList.contains('active')) {
        loadHistory();
        loadSummary();
    }
}, 30000);

// Auto-refresh logs every 15 seconds
setInterval(() => {
    if (document.getElementById('logs-page').classList.contains('active')) {
        loadLogs();
    }
}, 15000);

// Update clock every second
setInterval(() => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const dispHour = h % 12 || 12;
    document.getElementById('currentTime').textContent = `${dispHour}:${String(m).padStart(2, '0')} ${ampm}`;
}, 1000);
