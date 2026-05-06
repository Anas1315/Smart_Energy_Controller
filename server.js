const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    voltage REAL, current REAL, power REAL,
    wapda_available INTEGER, is_day_time INTEGER, is_sunny INTEGER,
    ldr_value INTEGER, current_hour INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS pending_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT, value INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed INTEGER DEFAULT 0
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS relay_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    relay TEXT, action TEXT, source TEXT, auto_mode INTEGER
  )`);
});

// Current system status (matches ESP32 state)
let currentStatus = {
  wapdaRelayState: false,
  heavyLoadState: false,
  wapdaAutoMode: true,
  heavyLoadAutoMode: true,
  wapdaAvailable: false,
  voltage: 0,
  current: 0,
  power: 0,
  ldrValue: 1500,
  isSunny: false,
  isDayTime: true,
  currentHour: 12,
  ldrControlEnabled: true,
  ldrSunThreshold: 800,   // Below this = SUNNY
  ldrDarkThreshold: 1200  // Above this = DARK
};

// ==================== ESP32 ENDPOINTS ====================

app.post('/api/esp32/data', (req, res) => {
  const data = req.body;
  // Update current status
  Object.assign(currentStatus, data);
  
  // Save to database
  db.run(`INSERT INTO sensor_data 
          (voltage, current, power, wapda_available, is_day_time, is_sunny, ldr_value, current_hour)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.voltage, data.current, data.power, 
     data.wapdaAvailable ? 1 : 0,
     data.isDayTime ? 1 : 0,
     data.isSunny ? 1 : 0,
     data.ldrValue,
     data.currentHour]);
  
  io.emit('status_update', currentStatus);
  res.json({ success: true });
});

app.post('/api/esp32/status', (req, res) => {
  Object.assign(currentStatus, req.body);
  io.emit('status_update', currentStatus);
  res.json({ success: true });
});

app.get('/api/esp32/commands', (req, res) => {
  db.all(`SELECT id, type, value FROM pending_commands 
          WHERE executed = 0 ORDER BY id ASC LIMIT 10`, (err, commands) => {
    if (err) {
      res.json({ commands: [] });
      return;
    }
    if (commands && commands.length > 0) {
      const ids = commands.map(c => c.id).join(',');
      db.run(`UPDATE pending_commands SET executed = 1 WHERE id IN (${ids})`);
    }
    res.json({ commands: commands || [] });
  });
});

// ==================== WEB CLIENT ENDPOINTS ====================

app.get('/api/status', (req, res) => res.json(currentStatus));

app.get('/api/historical', (req, res) => {
  const hours = req.query.hours || 24;
  db.all(`SELECT timestamp, voltage, current, power, wapda_available 
          FROM sensor_data WHERE timestamp >= datetime('now', '-' || ? || ' hours')
          ORDER BY timestamp ASC`, [hours], (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/logs', (req, res) => {
  db.all(`SELECT * FROM relay_logs ORDER BY timestamp DESC LIMIT 50`, (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/summary', (req, res) => {
  db.get(`SELECT 
            AVG(voltage) as avg_voltage, 
            AVG(current) as avg_current,
            AVG(power) as avg_power,
            SUM(power * 0.001) as total_energy
          FROM sensor_data 
          WHERE timestamp >= datetime('now', '-24 hours')`, (err, row) => {
    if (err) {
      res.json({ avg_voltage: 0, avg_current: 0, avg_power: 0, total_energy: 0 });
      return;
    }
    res.json(row || { avg_voltage: 0, avg_current: 0, avg_power: 0, total_energy: 0 });
  });
});

// Get current LDR thresholds
app.get('/api/ldr/thresholds', (req, res) => {
  res.json({
    ldrControlEnabled: currentStatus.ldrControlEnabled,
    ldrSunThreshold: currentStatus.ldrSunThreshold,
    ldrDarkThreshold: currentStatus.ldrDarkThreshold
  });
});

// ==================== CONTROL ENDPOINTS ====================

app.post('/api/control/relay', (req, res) => {
  const { relay, state, auto } = req.body;
  let type = '';
  let value = 0;
  let actionText = '';
  
  if (auto !== undefined) {
    // Mode change
    type = relay === 1 ? 'WAPDA_MODE' : 'HEAVY_LOAD_MODE';
    value = auto ? 1 : 0;
    actionText = `Mode: ${auto ? 'AUTO' : 'MANUAL'}`;
    
    // Update local status immediately for UI feedback
    if (relay === 1) currentStatus.wapdaAutoMode = auto;
    else currentStatus.heavyLoadAutoMode = auto;
  } else {
    // State change (only allowed when not in auto mode)
    type = relay === 1 ? 'WAPDA_RELAY' : 'HEAVY_LOAD';
    value = state ? 1 : 0;
    actionText = `State: ${state ? 'ON' : 'OFF'}`;
    
    // Update local status
    if (relay === 1) currentStatus.wapdaRelayState = state;
    else currentStatus.heavyLoadState = state;
  }
  
  // Save command for ESP32
  db.run(`INSERT INTO pending_commands (type, value) VALUES (?, ?)`, [type, value]);
  
  // Log the action
  const relayName = relay === 1 ? 'WAPDA (Grid)' : 'Heavy Load';
  const autoMode = (auto !== undefined) ? (auto ? 1 : 0) : (relay === 1 ? currentStatus.wapdaAutoMode : currentStatus.heavyLoadAutoMode);
  db.run(`INSERT INTO relay_logs (relay, action, source, auto_mode) VALUES (?, ?, ?, ?)`,
    [relayName, actionText, 'Web', autoMode]);
  
  // Broadcast updated status
  io.emit('status_update', currentStatus);
  
  res.json({ success: true, status: currentStatus });
});

app.post('/api/control/ldr', (req, res) => {
  const { enabled, sunlightThreshold, darkThreshold } = req.body;
  
  if (enabled !== undefined) {
    currentStatus.ldrControlEnabled = enabled;
    db.run(`INSERT INTO pending_commands (type, value) VALUES (?, ?)`, 
      ['LDR_ENABLED', enabled ? 1 : 0]);
    db.run(`INSERT INTO relay_logs (relay, action, source, auto_mode) VALUES (?, ?, ?, ?)`,
      ['LDR Control', enabled ? 'Enabled' : 'Disabled', 'Web', 1]);
  }
  
  if (sunlightThreshold !== undefined && sunlightThreshold > 0) {
    currentStatus.ldrSunThreshold = sunlightThreshold;
    db.run(`INSERT INTO pending_commands (type, value) VALUES (?, ?)`, 
      ['LDR_SUN_THRESH', sunlightThreshold]);
  }
  
  if (darkThreshold !== undefined && darkThreshold > 0) {
    currentStatus.ldrDarkThreshold = darkThreshold;
    db.run(`INSERT INTO pending_commands (type, value) VALUES (?, ?)`, 
      ['LDR_DARK_THRESH', darkThreshold]);
  }
  
  io.emit('status_update', currentStatus);
  res.json({ success: true, thresholds: currentStatus });
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.emit('status_update', currentStatus);
  socket.on('disconnect', () => console.log('Client disconnected'));
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   Smart Energy Dashboard v2.1        ║`);
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  
  const os = require('os');
  console.log('For ESP32 connection, use this IP:');
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  → http://${iface.address}:${PORT}`);
      }
    }
  }
  console.log('\nPress Ctrl+C to stop\n');
});
