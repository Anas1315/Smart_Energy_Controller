# ⚡ Smart Energy Controller - Quick Checklist

## 🎯 Get System Running in 10 Minutes

### ✅ Preparation
- [ ] ESP32 board ready and connected via USB
- [ ] Arduino IDE installed with ESP32 board
- [ ] WiFi network available
- [ ] Node.js installed on your computer (for local testing)

### ✅ Step 1: Test Locally (Optional but Recommended)
```bash
npm install
npm start
```
- [ ] Server starts without errors
- [ ] Can access http://localhost:3000
- [ ] Dashboard loads with "Connecting..." dot

### ✅ Step 2: Configure ESP32 Code
1. Open `esp32_code/ESP32_Web_Dashboard_V7.ino` in Arduino IDE
2. Update these lines:
```cpp
Line 17: const char* WIFI_SSID = "YOUR_WIFI_NAME";
Line 18: const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
Line 19: const char* SERVER_URL = "https://smart-energy-controller-knb7.onrender.com";
```
- [ ] WiFi credentials updated
- [ ] Server URL correct
- [ ] Sensor pins match your hardware

### ✅ Step 3: Upload to ESP32
1. Connect ESP32 via USB
2. Select Board: `ESP32 Dev Module`
3. Select Port: Your COM port
4. Click Upload
- [ ] Compilation successful
- [ ] Upload complete

### ✅ Step 4: Verify ESP32 Connection
1. Open Serial Monitor (Ctrl+Shift+M)
2. Set baud rate to **115200**
3. Watch for messages:
   - [ ] `[WiFi] Connecting...`  
   - [ ] `[WiFi] Connected! IP: 192.168.x.x`
   - [ ] `[STATUS] HTTP Code: 200`
   - [ ] `[DATA] HTTP Code: 200` (repeating)

### ✅ Step 5: Check Web Dashboard
**For Local Testing:**
```
http://localhost:3000
```

**For Render (Production):**
```
https://smart-energy-controller-knb7.onrender.com
```

- [ ] Page loads
- [ ] Green connection dot ✅ appears (within 30 seconds)
- [ ] Voltage/Current/Power values appear and update

### ✅ Step 6: Test Relay Control (Optional)
1. Go to "Control Panel" tab
2. Click relay toggle button
3. Check ESP32 serial output for relay activation

- [ ] Relay toggles in dashboard
- [ ] Serial shows relay state change
- [ ] Physical relay switches (if connected)

---

## 📍 Dashboard Indicators

| Indicator | Status | Action |
|-----------|--------|--------|
| 🔴 Red dot | Not connected | Wait 30 sec or check server |
| 🟡 Yellow dot | Connecting | Wait a few seconds |
| 🟢 Green dot | Connected ✅ | Data should appear soon |

---

## 🐛 If Something Goes Wrong

### ESP32 Can't Connect
1. Check WiFi SSID and password
2. Verify ESP32 has internet access
3. Check Serial Monitor for errors
4. Ensure SERVER_URL is correct

### Dashboard Won't Load
1. Check `npm start` output for errors
2. Try clearing browser cache
3. Wait 1-2 minutes if on Render free tier

### No Data Appearing
1. Check ESP32 serial shows `HTTP Code: 200`
2. Verify sensors are connected to correct pins
3. Check browser console (F12) for JavaScript errors
4. Wait 30+ seconds for first data to appear

### Still Not Working?
1. Stop server: Ctrl+C
2. Delete database: `rm database.sqlite`
3. Restart: `npm start`
4. Reupload ESP32 code

---

## 📝 Configuration Notes

### Local Network (WiFi):
- Server runs on: `http://192.168.1.x:3000`
- Works only when on same WiFi
- Fast, no internet delay

### Render (Cloud):
- Server URL: `https://smart-energy-controller-knb7.onrender.com`
- Works from anywhere
- Free tier spins down after 15 min inactivity
- HTTPS enabled automatically

---

## 🎉 Success Criteria

You're done when you see:
1. ✅ Green connection dot on dashboard
2. ✅ Voltage/Current/Power readings updating every 5 seconds
3. ✅ Relay controls respond to clicks
4. ✅ Activity logs show actions

---

## 📚 Need More Help?

- **Setup Details**: See `SETUP_GUIDE.md`
- **Render Deployment**: See `RENDER_DEPLOYMENT.md`
- **Troubleshooting**: See `SETUP_GUIDE.md` - Troubleshooting section
- **API Reference**: See `SETUP_GUIDE.md` - API Reference section

---

**Current Status**: ✅ All files ready | ✅ Render configured | ✅ ESP32 code prepared

**Next Action**: Update ESP32 WiFi credentials and upload!
