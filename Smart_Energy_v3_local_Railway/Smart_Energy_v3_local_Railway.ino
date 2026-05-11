// ╔═══════════════════════════════════════════════════════════════════════╗
// ║     SMART ENERGY CONTROLLER - Dual Server Version                     ║
// ║     Sends data to both Local Server AND Railway                       ║
// ║     RTC Time Fixed - Set from compilation time                        ║
// ╚═══════════════════════════════════════════════════════════════════════╝

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ZMPT101B.h>
#include <U8g2lib.h>
#include <RTClib.h>

// ═════════════════════════════════════════════════════════════════════════
//  NETWORK CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════
const char* WIFI_SSID = "Transworld";
const char* WIFI_PASSWORD = "Biya9191";

// LOCAL SERVER (Your Computer)
const char* LOCAL_SERVER_URL = "http://192.168.1.18:3000";  // CHANGE THIS TO YOUR PC's IP

// RAILWAY SERVER (Cloud)
const char* RAILWAY_SERVER_URL = "https://smartenergycontroller-production.up.railway.app";

// ═════════════════════════════════════════════════════════════════════════
//  PIN DEFINITIONS
// ═════════════════════════════════════════════════════════════════════════
#define WAPDA_RELAY_PIN    23
#define HEAVY_LOAD_PIN     19
#define VOLTAGE_PIN        34
#define CURRENT_PIN        35
#define LDR_PIN            36

#define RELAY_ON   LOW
#define RELAY_OFF  HIGH

// ═════════════════════════════════════════════════════════════════════════
//  TIME SCHEDULE (24-hour format)
// ═════════════════════════════════════════════════════════════════════════
#define DAY_START_HOUR     8    // 8 AM
#define DAY_END_HOUR      18    // 6 PM

// ═════════════════════════════════════════════════════════════════════════
//  SENSOR CALIBRATION
// ═════════════════════════════════════════════════════════════════════════
#define VOLTAGE_SENSITIVITY   440.0f
#define VOLTAGE_THRESHOLD     150.0f
#define ADC_ZERO_OFFSET       2075
#define CURRENT_CALIBRATION   0.35f
#define CURRENT_SAMPLES       1500
#define CURRENT_NOISE_FLOOR   0.10f
#define LOW_VOLTAGE_PROTECT   170.0f

// ═════════════════════════════════════════════════════════════════════════
//  WAPDA DEBOUNCE
// ═════════════════════════════════════════════════════════════════════════
#define WAPDA_ON_COUNT    4
#define WAPDA_OFF_COUNT   3

// ═════════════════════════════════════════════════════════════════════════
//  LDR SETTINGS (HIGH ADC = BRIGHT, LOW ADC = DARK)
// ═════════════════════════════════════════════════════════════════════════
#define LDR_BRIGHT_THRESHOLD_DEF   1800   // Above this = sunny/bright
#define LDR_DARK_THRESHOLD_DEF     1200   // Below this = dark/cloudy
#define LDR_SAMPLES                 20
#define LDR_SAMPLE_DELAY_MS          2
#define LDR_DEBOUNCE_DELAY         5000

// ═════════════════════════════════════════════════════════════════════════
//  SYSTEM STATE VARIABLES
// ═════════════════════════════════════════════════════════════════════════
bool wapdaRelayState = false;
bool heavyLoadState = false;
bool wapdaAutoMode = true;
bool heavyLoadAutoMode = true;
bool wapdaAvailable = false;
int wapdaOnCounter = 0;
int wapdaOffCounter = 0;

float acVoltage = 0.0f;
float acCurrent = 0.0f;
float acPower = 0.0f;
int ldrValue = 0;

bool isSunny = false;
unsigned long lastLdrToggleTime = 0;
int ldrBrightThreshold = LDR_BRIGHT_THRESHOLD_DEF;
int ldrDarkThreshold = LDR_DARK_THRESHOLD_DEF;
bool ldrControlEnabled = true;

int currentHour = 0;
bool isDayTime = true;

// Timing variables
unsigned long lastStatusSend = 0;
unsigned long lastDataSend = 0;
unsigned long lastCommandCheck = 0;

// ═════════════════════════════════════════════════════════════════════════
//  HARDWARE OBJECTS
// ═════════════════════════════════════════════════════════════════════════
ZMPT101B voltageSensor(VOLTAGE_PIN, 50.0f);
U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R0);
RTC_DS3231 rtc;

// ═════════════════════════════════════════════════════════════════════════
//  HELPER: GET COMPILATION TIME
// ═════════════════════════════════════════════════════════════════════════
// This gets the time when the code was compiled
// Format: "May 10 2026 19:10:00"
const char* compileDate = __DATE__;
const char* compileTime = __TIME__;

void setRTCFromCompileTime() {
  // Parse compilation date and time
  // __DATE__ format: "MMM DD YYYY" e.g., "May 10 2026"
  // __TIME__ format: "HH:MM:SS" e.g., "19:10:00"
  
  int year, month, day, hour, minute, second;
  
  // Parse month
  char monthStr[4];
  monthStr[0] = compileDate[0];
  monthStr[1] = compileDate[1];
  monthStr[2] = compileDate[2];
  monthStr[3] = '\0';
  
  if (strcmp(monthStr, "Jan") == 0) month = 1;
  else if (strcmp(monthStr, "Feb") == 0) month = 2;
  else if (strcmp(monthStr, "Mar") == 0) month = 3;
  else if (strcmp(monthStr, "Apr") == 0) month = 4;
  else if (strcmp(monthStr, "May") == 0) month = 5;
  else if (strcmp(monthStr, "Jun") == 0) month = 6;
  else if (strcmp(monthStr, "Jul") == 0) month = 7;
  else if (strcmp(monthStr, "Aug") == 0) month = 8;
  else if (strcmp(monthStr, "Sep") == 0) month = 9;
  else if (strcmp(monthStr, "Oct") == 0) month = 10;
  else if (strcmp(monthStr, "Nov") == 0) month = 11;
  else if (strcmp(monthStr, "Dec") == 0) month = 12;
  else month = 1;
  
  // Parse day
  day = (compileDate[4] - '0') * 10 + (compileDate[5] - '0');
  
  // Parse year
  year = (compileDate[7] - '0') * 1000 + (compileDate[8] - '0') * 100 + 
         (compileDate[9] - '0') * 10 + (compileDate[10] - '0');
  
  // Parse time
  hour = (compileTime[0] - '0') * 10 + (compileTime[1] - '0');
  minute = (compileTime[3] - '0') * 10 + (compileTime[4] - '0');
  second = (compileTime[6] - '0') * 10 + (compileTime[7] - '0');
  
  // Adjust for Pakistan Time (UTC+5) if your computer time is UTC
  // hour += 5;
  // if (hour >= 24) { hour -= 24; day += 1; }
  
  // Set RTC
  rtc.adjust(DateTime(year, month, day, hour, minute, second));
  
  Serial.println("[RTC] Time set from compilation time:");
  Serial.printf("  Date: %s\n", compileDate);
  Serial.printf("  Time: %s\n", compileTime);
  Serial.printf("  Set to: %04d-%02d-%02d %02d:%02d:%02d\n", 
                year, month, day, hour, minute, second);
}

// ═════════════════════════════════════════════════════════════════════════
//  UPDATE TIME FROM RTC
// ═════════════════════════════════════════════════════════════════════════
void updateTime() {
  DateTime now = rtc.now();
  currentHour = now.hour();
  isDayTime = (currentHour >= DAY_START_HOUR && currentHour < DAY_END_HOUR);
}

// ═════════════════════════════════════════════════════════════════════════
//  READ CURRENT RMS
// ═════════════════════════════════════════════════════════════════════════
float readCurrentRMS() {
  double sumSq = 0.0;
  int samples = 0;
  for (int i = 0; i < CURRENT_SAMPLES; i++) {
    int raw = analogRead(CURRENT_PIN);
    int centered = raw - ADC_ZERO_OFFSET;
    sumSq += (double)centered * centered;
    samples++;
  }
  float rmsRaw = sqrtf((float)(sumSq / samples));
  float volts = rmsRaw * (3.3f / 4095.0f);
  float amps = volts * CURRENT_CALIBRATION;
  if (amps < CURRENT_NOISE_FLOOR) return 0.0f;
  if (amps > 20.0f && acVoltage < 100.0f) return 0.0f;
  return amps;
}

// ═════════════════════════════════════════════════════════════════════════
//  CHECK WAPDA AVAILABILITY
// ═════════════════════════════════════════════════════════════════════════
void checkWAPDA() {
  float v = voltageSensor.getRmsVoltage();
  if (v < 0.0f || v > 500.0f) v = 0.0f;
  acVoltage = v;

  if (v > VOLTAGE_THRESHOLD) {
    wapdaOffCounter = 0;
    if (wapdaOnCounter < WAPDA_ON_COUNT) wapdaOnCounter++;
    if (wapdaOnCounter >= WAPDA_ON_COUNT) {
      if (!wapdaAvailable) {
        wapdaAvailable = true;
        Serial.println("[WAPDA] Power Available!");
        sendStatusToBothServers();
        if (!isDayTime && heavyLoadAutoMode) updateHeavyLoadLogic();
      }
    }
  } else {
    wapdaOnCounter = 0;
    if (wapdaOffCounter < WAPDA_OFF_COUNT) wapdaOffCounter++;
    if (wapdaOffCounter >= WAPDA_OFF_COUNT) {
      if (wapdaAvailable) {
        wapdaAvailable = false;
        Serial.println("[WAPDA] Power OUTAGE!");
        sendStatusToBothServers();
        if (!isDayTime && heavyLoadAutoMode) updateHeavyLoadLogic();
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  READ LDR AVERAGE
// ═════════════════════════════════════════════════════════════════════════
int readLDRAverage() {
  long sum = 0;
  for (int i = 0; i < LDR_SAMPLES; i++) {
    sum += analogRead(LDR_PIN);
    delay(LDR_SAMPLE_DELAY_MS);
  }
  return constrain((int)(sum / LDR_SAMPLES), 0, 4095);
}

void checkLDR() {
  ldrValue = readLDRAverage();
  updateTime();

  if (!isDayTime) {
    isSunny = false;
    return;
  }

  if (ldrControlEnabled) {
    bool newSunnyState = isSunny;
    if (!isSunny && ldrValue > ldrBrightThreshold) {
      newSunnyState = true;
      Serial.printf("[LDR] SUNNY detected! Value: %d\n", ldrValue);
    } else if (isSunny && ldrValue < ldrDarkThreshold) {
      newSunnyState = false;
      Serial.printf("[LDR] DARK/CLOUDY detected! Value: %d\n", ldrValue);
    }

    if (newSunnyState != isSunny) {
      unsigned long now = millis();
      if (now - lastLdrToggleTime > LDR_DEBOUNCE_DELAY) {
        isSunny = newSunnyState;
        lastLdrToggleTime = now;
        Serial.printf("[LDR] Light condition: %s (LDR Value: %d)\n",
                      isSunny ? "SUNNY/BRIGHT ☀️" : "DIM/CLOUDY ☁️", ldrValue);
        sendStatusToBothServers();
        if (isDayTime && wapdaAutoMode) updateWAPDALogic();
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  RELAY CONTROL
// ═════════════════════════════════════════════════════════════════════════
void setWAPDARelay(bool on) {
  if (wapdaRelayState == on) return;
  wapdaRelayState = on;
  digitalWrite(WAPDA_RELAY_PIN, on ? RELAY_ON : RELAY_OFF);
  Serial.printf("[WAPDA Relay] → %s (Mode: %s)\n", on ? "ON" : "OFF", wapdaAutoMode ? "AUTO" : "MANUAL");
  sendStatusToBothServers();
}

void setHeavyLoadRelay(bool on) {
  if (heavyLoadState == on) return;
  heavyLoadState = on;
  digitalWrite(HEAVY_LOAD_PIN, on ? RELAY_ON : RELAY_OFF);
  Serial.printf("[Heavy Load] → %s (Mode: %s)\n", on ? "ON" : "OFF", heavyLoadAutoMode ? "AUTO" : "MANUAL");
  sendStatusToBothServers();
}

// ═════════════════════════════════════════════════════════════════════════
//  UPDATE WAPDA LOGIC
// ═════════════════════════════════════════════════════════════════════════
void updateWAPDALogic() {
  if (!wapdaAutoMode) return;
  updateTime();
  bool shouldWAPDAOn = false;

  if (isDayTime) {
    if (ldrControlEnabled && !isSunny) {
      shouldWAPDAOn = true;
      Serial.println("[Auto] Day time - DARK/CLOUDY: WAPDA ON");
    } else {
      shouldWAPDAOn = false;
      if (ldrControlEnabled && isSunny)
        Serial.println("[Auto] Day time - SUNNY: WAPDA OFF");
    }
  } else {
    shouldWAPDAOn = true;
    Serial.println("[Auto] Night time - WAPDA ON");
  }

  if (shouldWAPDAOn != wapdaRelayState) setWAPDARelay(shouldWAPDAOn);
}

// ═════════════════════════════════════════════════════════════════════════
//  UPDATE HEAVY LOAD LOGIC
// ═════════════════════════════════════════════════════════════════════════
void updateHeavyLoadLogic() {
  if (!heavyLoadAutoMode) return;
  updateTime();
  bool shouldHeavyLoadOn = false;

  if (isDayTime) {
    shouldHeavyLoadOn = true;
    Serial.println("[Auto] Day time - Heavy Load ON");
  } else {
    shouldHeavyLoadOn = wapdaAvailable;
    Serial.println(wapdaAvailable ? "[Auto] Night time - Heavy Load ON" : "[Auto] Night time - Heavy Load OFF");
  }

  if (shouldHeavyLoadOn != heavyLoadState) setHeavyLoadRelay(shouldHeavyLoadOn);
}

// ═════════════════════════════════════════════════════════════════════════
//  SEND TO SINGLE SERVER (Helper Function)
// ═════════════════════════════════════════════════════════════════════════
void sendToServer(const char* serverUrl, const char* endpoint, const char* jsonData, const char* serverName) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[%s] WiFi not connected\n", serverName);
    return;
  }

  HTTPClient http;
  String url = String(serverUrl) + endpoint;
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  int httpCode = http.POST(jsonData);
  if (httpCode > 0) {
    Serial.printf("[%s] ✅ Sent - HTTP: %d\n", serverName, httpCode);
  } else {
    Serial.printf("[%s] ❌ Failed - Error: %s\n", serverName, http.errorToString(httpCode).c_str());
  }

  http.end();
}

// ═════════════════════════════════════════════════════════════════════════
//  SEND STATUS UPDATE TO BOTH SERVERS
// ═════════════════════════════════════════════════════════════════════════
void sendStatusToBothServers() {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<512> doc;
  doc["wapdaRelayState"] = wapdaRelayState;
  doc["heavyLoadState"] = heavyLoadState;
  doc["wapdaAutoMode"] = wapdaAutoMode;
  doc["heavyLoadAutoMode"] = heavyLoadAutoMode;
  doc["wapdaAvailable"] = wapdaAvailable;
  doc["voltage"] = acVoltage;
  doc["current"] = acCurrent;
  doc["power"] = acPower;
  doc["ldrValue"] = ldrValue;
  doc["isSunny"] = isSunny;
  doc["isDayTime"] = isDayTime;
  doc["currentHour"] = currentHour;
  doc["ldrControlEnabled"] = ldrControlEnabled;
  doc["ldrSunThreshold"] = ldrBrightThreshold;
  doc["ldrDarkThreshold"] = ldrDarkThreshold;

  String jsonString;
  serializeJson(doc, jsonString);

  // Send to Local Server
  sendToServer(LOCAL_SERVER_URL, "/api/esp32/status", jsonString.c_str(), "LOCAL");
  
  // Send to Railway Server
  sendToServer(RAILWAY_SERVER_URL, "/api/esp32/status", jsonString.c_str(), "RAILWAY");
}

// ═════════════════════════════════════════════════════════════════════════
//  SEND SENSOR DATA TO BOTH SERVERS
// ═════════════════════════════════════════════════════════════════════════
void sendSensorDataToBothServers() {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<256> doc;
  doc["voltage"] = acVoltage;
  doc["current"] = acCurrent;
  doc["power"] = acPower;
  doc["ldrValue"] = ldrValue;
  doc["wapdaAvailable"] = wapdaAvailable;
  doc["isDayTime"] = isDayTime;
  doc["isSunny"] = isSunny;

  String jsonString;
  serializeJson(doc, jsonString);

  // Send to Local Server
  sendToServer(LOCAL_SERVER_URL, "/api/esp32/data", jsonString.c_str(), "LOCAL");
  
  // Send to Railway Server
  sendToServer(RAILWAY_SERVER_URL, "/api/esp32/data", jsonString.c_str(), "RAILWAY");
}

// ═════════════════════════════════════════════════════════════════════════
//  CHECK FOR COMMANDS FROM BOTH SERVERS
// ═════════════════════════════════════════════════════════════════════════
void checkCommandsFromServer(const char* serverUrl, const char* serverName) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(serverUrl) + "/api/esp32/commands";
  
  http.begin(url);
  http.setTimeout(5000);

  int response = http.GET();
  if (response == 200) {
    String payload = http.getString();
    StaticJsonDocument<1024> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error && doc.containsKey("commands")) {
      JsonArray commands = doc["commands"];
      bool needWAPDAUpdate = false;
      bool needHeavyUpdate = false;

      for (JsonObject cmd : commands) {
        String type = cmd["type"];
        int value = cmd["value"];

        Serial.printf("[CMD][%s] %s = %d\n", serverName, type.c_str(), value);

        if (type == "WAPDA_RELAY") {
          if (!wapdaAutoMode) setWAPDARelay(value == 1);
        }
        else if (type == "HEAVY_LOAD") {
          if (!heavyLoadAutoMode) setHeavyLoadRelay(value == 1);
        }
        else if (type == "WAPDA_MODE") {
          bool newMode = (value == 1);
          if (newMode != wapdaAutoMode) {
            wapdaAutoMode = newMode;
            needWAPDAUpdate = true;
            Serial.printf("[Mode] WAPDA mode → %s\n", wapdaAutoMode ? "AUTO" : "MANUAL");
            sendStatusToBothServers();
          }
        }
        else if (type == "HEAVY_LOAD_MODE") {
          bool newMode = (value == 1);
          if (newMode != heavyLoadAutoMode) {
            heavyLoadAutoMode = newMode;
            needHeavyUpdate = true;
            Serial.printf("[Mode] Heavy Load mode → %s\n", heavyLoadAutoMode ? "AUTO" : "MANUAL");
            sendStatusToBothServers();
          }
        }
        else if (type == "LDR_ENABLED") {
          ldrControlEnabled = (value == 1);
          needWAPDAUpdate = true;
        }
        else if (type == "LDR_SUN_THRESH") {
          ldrBrightThreshold = value;
        }
        else if (type == "LDR_DARK_THRESH") {
          ldrDarkThreshold = value;
        }
      }

      if (needWAPDAUpdate && wapdaAutoMode) updateWAPDALogic();
      if (needHeavyUpdate && heavyLoadAutoMode) updateHeavyLoadLogic();
    }
  }
  http.end();
}

void checkCommandsFromBothServers() {
  checkCommandsFromServer(LOCAL_SERVER_URL, "LOCAL");
  checkCommandsFromServer(RAILWAY_SERVER_URL, "RAILWAY");
}

// ═════════════════════════════════════════════════════════════════════════
//  UPDATE OLED DISPLAY
// ═════════════════════════════════════════════════════════════════════════
void updateOLED() {
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x10_tf);

  char buf[32];
  DateTime now = rtc.now();
  
  // Display in 12-hour format with AM/PM
  int displayHour = now.hour() % 12;
  if (displayHour == 0) displayHour = 12;
  
  sprintf(buf, "%02d:%02d %s",
    displayHour,
    now.minute(),
    now.hour() >= 12 ? "PM" : "AM");
  oled.drawStr(0, 10, buf);

  sprintf(buf, "W:%s", wapdaAvailable ? "ON" : "OFF");
  oled.drawStr(100, 10, buf);
  oled.drawHLine(0, 13, 128);

  sprintf(buf, "V:%.0fV  I:%.2fA", acVoltage, acCurrent);
  oled.drawStr(0, 27, buf);
  sprintf(buf, "P:%.1fW", acPower);
  oled.drawStr(0, 40, buf);

  sprintf(buf, "W:%s[%s] L:%s[%s]",
    wapdaRelayState ? "ON" : "OF",
    wapdaAutoMode ? "A" : "M",
    heavyLoadState ? "ON" : "OF",
    heavyLoadAutoMode ? "A" : "M");
  oled.drawStr(0, 54, buf);

  if (isDayTime) {
    sprintf(buf, "LDR:%4d %s", ldrValue, isSunny ? "SUN" : "DIM");
  } else {
    sprintf(buf, "LDR:%4d NGT", ldrValue);
  }
  oled.drawStr(0, 68, buf);

  oled.sendBuffer();
}

// ═════════════════════════════════════════════════════════════════════════
//  SETUP
// ═════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n╔════════════════════════════════════════════════════════╗");
  Serial.println("║     SMART ENERGY CONTROLLER v3.0 - DUAL SERVER        ║");
  Serial.println("║     Sending to Local AND Railway                      ║");
  Serial.println("╚════════════════════════════════════════════════════════╝");

  // Initialize pins
  pinMode(WAPDA_RELAY_PIN, OUTPUT);
  pinMode(HEAVY_LOAD_PIN, OUTPUT);
  pinMode(LDR_PIN, INPUT);
  digitalWrite(WAPDA_RELAY_PIN, RELAY_OFF);
  digitalWrite(HEAVY_LOAD_PIN, RELAY_OFF);

  // Voltage sensor
  voltageSensor.setSensitivity(VOLTAGE_SENSITIVITY);
  Serial.println("[OK] Voltage sensor initialized");

  // OLED
  oled.begin();
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x10_tf);
  oled.drawStr(0, 20, "Booting...");
  oled.sendBuffer();
  Serial.println("[OK] OLED ready");

  // RTC - Initialize and set time from compilation time
  if (!rtc.begin()) {
    Serial.println("[ERROR] RTC DS3231 not found!");
    oled.drawStr(0, 30, "RTC: FAIL");
  } else {
    Serial.println("[OK] RTC DS3231 found");
    
    // Check if RTC lost power or needs initial setting
    if (rtc.lostPower()) {
      Serial.println("[RTC] RTC lost power, setting time from compilation time");
      setRTCFromCompileTime();
    } else {
      // Optional: Uncomment to force set time every boot
      // Serial.println("[RTC] Setting time from compilation time");
      // setRTCFromCompileTime();
      
      // Just display current RTC time
      DateTime now = rtc.now();
      Serial.printf("[RTC] Current time: %04d-%02d-%02d %02d:%02d:%02d\n",
                    now.year(), now.month(), now.day(),
                    now.hour(), now.minute(), now.second());
    }
    
    oled.drawStr(0, 30, "RTC: OK");
  }
  oled.sendBuffer();
  delay(1000);

  // WiFi connection
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  oled.clearBuffer();
  oled.drawStr(0, 20, "WiFi Connecting...");
  oled.sendBuffer();

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ [WiFi] Connected!");
    Serial.printf("  SSID: %s\n", WIFI_SSID);
    Serial.printf("  IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("  Local Server: %s\n", LOCAL_SERVER_URL);
    Serial.printf("  Railway Server: %s\n", RAILWAY_SERVER_URL);
    
    oled.clearBuffer();
    oled.drawStr(0, 20, "WiFi OK");
    oled.drawStr(0, 35, WiFi.localIP().toString().c_str());
    oled.sendBuffer();
    delay(1500);
  } else {
    Serial.println("\n❌ [ERROR] WiFi failed!");
  }

  // Initial sensor readings
  checkWAPDA();
  acCurrent = readCurrentRMS();
  acPower = acVoltage * acCurrent;
  checkLDR();
  updateWAPDALogic();
  updateHeavyLoadLogic();

  // Send initial status
  delay(2000);
  sendStatusToBothServers();

  Serial.println("\n✅ [READY] System running!");
  Serial.println("════════════════════════════════════════════════════════\n");
}

// ═════════════════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═════════════════════════════════════════════════════════════════════════
void loop() {
  static unsigned long lastVoltageCheck = 0;
  static unsigned long lastCurrentCheck = 0;
  static unsigned long lastLDRCheck = 0;
  static unsigned long lastOLEDUpdate = 0;
  static unsigned long lastWAPDALogic = 0;
  static unsigned long lastHeavyLoadLogic = 0;

  unsigned long now = millis();

  if (now - lastVoltageCheck >= 200) {
    checkWAPDA();
    lastVoltageCheck = now;
  }

  if (now - lastCurrentCheck >= 2000) {
    acCurrent = readCurrentRMS();
    acPower = acVoltage * acCurrent;
    lastCurrentCheck = now;
  }

  if (now - lastLDRCheck >= 1000) {
    checkLDR();
    lastLDRCheck = now;
  }

  if (now - lastWAPDALogic >= 1000) {
    updateWAPDALogic();
    lastWAPDALogic = now;
  }

  if (now - lastHeavyLoadLogic >= 1000) {
    updateHeavyLoadLogic();
    lastHeavyLoadLogic = now;
  }

  // Send status update every 10 seconds
  if (now - lastStatusSend >= 10000) {
    sendStatusToBothServers();
    lastStatusSend = now;
  }

  // Send sensor data every 5 seconds
  if (now - lastDataSend >= 5000) {
    sendSensorDataToBothServers();
    lastDataSend = now;
  }

  // Check for commands every 3 seconds
  if (now - lastCommandCheck >= 3000) {
    checkCommandsFromBothServers();
    lastCommandCheck = now;
  }

  if (now - lastOLEDUpdate >= 1000) {
    updateOLED();
    lastOLEDUpdate = now;
  }

  delay(20);
}