# Render Deployment Guide

## Step 1: Deploy on Render

1. Go to [render.com](https://render.com) and sign up/login with GitHub
2. Click **New** → **Web Service**
3. Connect to your GitHub repository: `https://github.com/Anas1315/Smart_Energy_Controller.git`
4. Fill in the details:
   - **Name**: `smart-energy-controller`
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free (or paid for better performance)

5. Click **Deploy** and wait for it to build

## Step 2: Get Your Render URL

After deployment, you'll get a URL like:
```
https://smart-energy-controller-xxxx.onrender.com
```

## Step 3: Update ESP32 Code

In your ESP32 code (`ESP32_Web_Dashboard_V7.ino`), update the server URL:

```cpp
// OLD (localhost - only works when connected to same WiFi)
String serverUrl = "http://192.168.x.x:3000";

// NEW (Render - works from anywhere)
String serverUrl = "https://smart-energy-controller-xxxx.onrender.com";
```

### Important: Update the URL in your ESP32 code:
- Replace `smart-energy-controller-xxxx` with your actual Render URL
- The HTTPS connection should work automatically with Render

## Step 4: Configure CORS for ESP32

The API already has CORS enabled, so your ESP32 can connect from anywhere.

## Step 5: Update Frontend for Socket.IO

The frontend automatically connects to the same server it's hosted on, so no changes needed!

## API Endpoints

### For ESP32:
- **POST** `/api/esp32/data` - Send sensor data
- **GET** `/api/esp32/commands` - Fetch pending commands
- **POST** `/api/esp32/status` - Update relay/system status

### For Web Dashboard:
- **GET** `/api/status` - Get current system status
- **GET** `/api/historical?hours=24` - Get historical data
- **GET** `/api/logs` - Get relay activity logs
- **GET** `/api/summary` - Get 24-hour summary
- **POST** `/api/control/relay` - Control relays
- **POST** `/api/control/ldr` - Control LDR settings

## Troubleshooting

### ESP32 Can't Connect
- Check if HTTPS is working: test the URL in browser
- Verify SSL certificate is valid
- Check logs in Render Dashboard

### Dashboard Shows "Connecting..."
- Wait 60+ seconds on first load (Render free tier is slow)
- Check browser console for errors
- Verify Socket.IO connection

### Data Not Updating
- Confirm ESP32 is sending data via `/api/esp32/data`
- Check Render logs for errors
- Verify database is being created

### Database Issues
- Render provides temporary storage; data resets on redeploy
- For persistent data, upgrade to paid plan or use external database

## Monitoring

Check logs in real-time:
```bash
# In Render dashboard, click your service → Logs
```

## Performance Tips

1. **Free Plan Limitations**:
   - Spins down after 15 min inactivity
   - Limited RAM/CPU
   - Shared resources

2. **Upgrade for Production**:
   - Use paid tier for always-on service
   - Better performance for real-time data

## Local Testing Before Render

Test locally first:
```bash
npm install
npm start
# Visit http://localhost:3000
```

Then update ESP32 to use your local IP:
```cpp
String serverUrl = "http://192.168.x.x:3000";
```
