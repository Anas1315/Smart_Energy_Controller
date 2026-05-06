# Smart Energy Controller - Complete Setup & Troubleshooting

## 🎯 Quick Start (5 minutes)

### Option 1: Use Existing Render Deployment
The Render URL is already in your ESP32 code:
```
https://smart-energy-controller-knb7.onrender.com
```

Just make sure your ESP32 is programmed and connected to WiFi!

### Option 2: Deploy Your Own on Render
1. Visit [render.com](https://render.com)
2. Connect GitHub repo: `https://github.com/Anas1315/Smart_Energy_Controller.git`
3. Deploy as Web Service
4. Update ESP32 code with your new Render URL

---

## 📱 ESP32 Connection Flow

```
ESP32 (WiFi) 
    ↓
[Sends sensor data every 5 sec]
    ↓
Render Server (API)
    ↓
[Stores in SQLite Database]
    ↓
Web Dashboard (Browser)
    ↓
[Real-time updates via Socket.IO]
```

---

## ✅ What's Already Configured

Your project is ready with:
- ✅ **Port**: Dynamic (uses `process.env.PORT` for Render)
- ✅ **HTTPS**: ESP32 code has `client.setInsecure()` for SSL
- ✅ **CORS**: Enabled for ESP32 cross-origin requests
- ✅ **Socket.IO**: Real-time dashboard updates
- ✅ **Database**: SQLite auto-creates tables
- ✅ **Render Config**: Procfile and render.yaml included

---

## 🔧 Making Data Functional - ESP32 Side

### Ensure your ESP32 code has:

1. **Correct WiFi Settings** (Line ~18):
```cpp
const char* WIFI_SSID = "Your_WiFi_SSID";
const char* WIFI_PASSWORD = "Your_WiFi_Password";
```

2. **Correct Server URL** (Line ~19):
```cpp
// For Render deployment
const char* SERVER_URL = "https://smart-energy-controller-knb7.onrender.com";

// OR for local development
// const char* SERVER_URL = "http://192.168.x.x:3000";
```

3. **Sensor Calibration** (Lines ~41-52):
   - Adjust `VOLTAGE_SENSITIVITY` for your specific voltage sensor
   - Adjust `CURRENT_CALIBRATION` for current sensor
   - Set `LDR_SUN_THRESHOLD_DEFAULT` and `LDR_DARK_THRESHOLD_DEFAULT`

### Upload Steps:
1. Connect ESP32 via USB
2. Select Board: **ESP32 Dev Module**
3. Select Port: **COM6** (or your USB port)
4. Compile and Upload
5. Open Serial Monitor (115200 baud)
6. Check for WiFi connection messages

---

## 📊 Testing Data Flow

### Step 1: Check ESP32 Connection
Open Serial Monitor and look for:
```
[WiFi] Connecting to Transworld...
[WiFi] Connected! IP: 192.168.1.xxx
[STATUS] HTTP Code: 200
[DATA] HTTP Code: 200
```

### Step 2: Check Web Dashboard
1. Visit: `https://smart-energy-controller-knb7.onrender.com` (on Render)
2. Or: `http://localhost:3000` (local testing)
3. Look for green connection dot ✅

### Step 3: Verify Data in Dashboard
- Power readings should update every 5 seconds
- Relay status should show current state
- Charts should populate after a few data points

---

## 🐛 Troubleshooting

### Problem 1: ESP32 Can't Connect to Server
**Symptoms**: HTTP Code: 0 or connection refused

**Solutions**:
```cpp
// Check SERVER_URL is correct
Serial.println("Connecting to: " + String(SERVER_URL));

// Add timeout
http.setTimeout(10000);

// Ensure WiFi is connected
if (WiFi.status() != WL_CONNECTED) {
  Serial.println("WiFi not connected!");
  return;
}
```

### Problem 2: Dashboard Shows "Connecting..."
**Symptoms**: Dot is red/yellow, not green

**Solutions**:
1. Check browser console (F12 → Console tab)
2. Render might be starting up (takes 30+ seconds first time)
3. Check server logs on Render dashboard
4. Verify Socket.IO port (default 3000)

### Problem 3: No Sensor Data Appears
**Symptoms**: Dashboard connected but no voltage/current readings

**Solutions**:
1. Check ESP32 serial output for sensor values
2. Verify sensor pins match code:
   - VOLTAGE_PIN: GPIO 34
   - CURRENT_PIN: GPIO 35
   - LDR_PIN: GPIO 36
3. Check sensor connections and calibration
4. Verify `/api/esp32/data` is being called

### Problem 4: Render Service Spins Down
**Symptoms**: Dashboard works for a bit, then "Connecting..."

**Solutions**:
- Free tier Render spins down after 15 min
- Upgrade to paid tier for always-on
- Keep browser open to prevent spin-down
- Implement periodic heartbeat ping

### Problem 5: Relay Not Responding
**Symptoms**: Dashboard shows relay button, but ESP32 relay doesn't toggle

**Solutions**:
1. Check relay pins:
   - WAPDA_RELAY_PIN: GPIO 23
   - HEAVY_LOAD_PIN: GPIO 19
2. Verify relay module power supply
3. Check relay module logic (active HIGH vs LOW)
4. Monitor serial output when clicking relay buttons

---

## 🚀 Local Testing (Before Render)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Server
```bash
npm start
```

### 3. Access Dashboard
```
http://localhost:3000
```

### 4. Update ESP32 for Local Testing
```cpp
// Comment out Render URL
// const char* SERVER_URL = "https://smart-energy-controller-knb7.onrender.com";

// Use local IP (find from `npm start` output or router)
const char* SERVER_URL = "http://192.168.1.XXX:3000";
```

---

## 📊 API Reference

### ESP32 → Server (Required for functioning)

**POST /api/esp32/data**
```json
{
  "voltage": 230.5,
  "current": 2.5,
  "power": 576.25,
  "wapdaAvailable": true,
  "isDayTime": true,
  "isSunny": false,
  "ldrValue": 1500,
  "currentHour": 14
}
```

**GET /api/esp32/commands**
Returns pending commands for ESP32 to execute

**POST /api/esp32/status**
```json
{
  "wapdaRelayState": true,
  "heavyLoadState": false,
  "wapdaAutoMode": true,
  "heavyLoadAutoMode": true
}
```

### Web Dashboard → Server

**GET /api/status** - Current system state
**GET /api/historical?hours=24** - Historical data
**GET /api/summary** - 24-hour summary
**POST /api/control/relay** - Toggle relay
**POST /api/control/ldr** - Control LDR settings

---

## 🔐 Security Notes

- ✅ HTTPS enabled on Render (automatically)
- ⚠️ ESP32 uses `setInsecure()` - fine for private network
- 📝 WiFi credentials hardcoded in ESP32 - consider using EEPROM later
- 🔄 Consider adding authentication for production

---

## 📱 Frontend Issues

### Dashboard not responsive?
1. Clear browser cache (Ctrl+Shift+Delete)
2. Check network tab for CORS errors
3. Verify Socket.IO connection in Console

### Charts not showing?
1. Wait 30+ seconds for data to accumulate
2. Check if data is coming from ESP32
3. Browser console might show chart errors

---

## 📈 Monitoring & Debugging

### Check Logs on Render
1. Go to [render.com](https://render.com)
2. Click your service → Logs tab
3. Watch real-time output

### Monitor ESP32
- Serial Monitor: 115200 baud
- Watch for connection status
- Check HTTP response codes

### Database Check
- `database.sqlite` is created automatically
- Contains: sensor_data, relay_logs, pending_commands tables
- Can download from Render if needed

---

## ✨ Next Steps for Full Functionality

1. **Deploy to Render**: Follow RENDER_DEPLOYMENT.md
2. **Program ESP32**: Upload code with your WiFi details
3. **Connect Sensors**: Ensure all hardware is connected
4. **Test Dashboard**: Verify you see real-time data
5. **Control Relays**: Test manual relay toggles
6. **Monitor Logs**: Check activity logs for automation

---

## 💡 Tips for Success

- Start with local testing first (`npm start`)
- Enable ESP32 serial output for debugging
- Keep browser console open while testing (F12)
- Check Render logs if things break
- Free tier Render is good for testing, upgrade for production

**Status**: ✅ All systems ready for deployment!

Questions? Check error messages in console and Render logs.
