// ╔═══════════════════════════════════════════════════════════════════════╗
// ║     SMART ENERGY CONTROLLER - Complete Web Control System            ║
// ║     Version: 2.0 - Full Auto/Manual with LDR & WAPDA Logic          ║
// ╚═══════════════════════════════════════════════════════════════════════╝

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <ZMPT101B.h>
#include <U8g2lib.h>
#include <RTClib.h>

// ═════════════════════════════════════════════════════════════════════════
//  NETWORK CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════
const char* WIFI_SSID = "Transworld";
const char* WIFI_PASSWORD = "Biya9191";
const char* SERVER_URL = "https://smart-energy-controller-knb7.onrender.com";

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
#define DAY_START_HOUR     8
#define DAY_END_HOUR      18

// ═════════════════════════════════════════════════════════════════════════
//  SENSOR CALIBRATION
// ═════════════════════════════════════════════════════════════════════════
#define VOLTAGE_SENSITIVITY   440.0f
#define VOLTAGE_THRESHOLD     150.0f
#define ADC_ZERO_OFFSET       2075
#define CURRENT_CALIBRATION   0.35f
#define CURRENT_SAMPLES       1500
#define CURRENT_NOISE_FLOOR   0.10f

// ── LDR Settings: INVERTED (low value = sunny, high value = dark) ──
#define LDR_SUN_THRESHOLD_DEFAULT    2500   // Below this = SUNNY
#define LDR_DARK_THRESHOLD_DEFAULT   1200   // Above this = DARK/CLOUDY
#define LDR_SAMPLES                    20
#define LDR_SAMPLE_DELAY_MS             2

// ═════════════════════════════════════════════════════════════════════════
//  DEBOUNCE & TIMING
// ═════════════════════════════════════════════════════════════════════════
#define WAPDA_DEBOUNCE_COUNT    4
#define LDR_DEBOUNCE_DELAY     5000

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
bool lastLdrDecision = false;
unsigned long lastLdrToggleTime = 0;
int ldrSunThreshold = LDR_SUN_THRESHOLD_DEFAULT;
int ldrDarkThreshold = LDR_DARK_THRESHOLD_DEFAULT;
bool ldrControlEnabled = true;

int currentHour = 0;
bool isDayTime = true;

// ═════════════════════════════════════════════════════════════════════════
//  HARDWARE OBJECTS
// ═════════════════════════════════════════════════════════════════════════
ZMPT101B voltageSensor(VOLTAGE_PIN, 50.0f);
U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R0);
RTC_DS3231 rtc;

// ═════════════════════════════════════════════════════════════════════════
//  CORE LOGIC FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════

void updateTime() {
  DateTime now = rtc.now();
  currentHour = now.hour();
  isDayTime = (currentHour >= DAY_START_HOUR && currentHour < DAY_END_HOUR);
}

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

void checkWAPDA() {
  float v = voltageSensor.getRmsVoltage();
  if (v < 0.0f || v > 500.0f) v = 0.0f;
  acVoltage = v;

  if (v > VOLTAGE_THRESHOLD) {
    wapdaOffCounter = 0;
    if (wapdaOnCounter < WAPDA_DEBOUNCE_COUNT) wapdaOnCounter++;
    if (wapdaOnCounter >= WAPDA_DEBOUNCE_COUNT) {
      if (!wapdaAvailable) {
        wapdaAvailable = true;
        Serial.println("[WAPDA] Power Available!");
        sendStatusUpdate();
      }
    }
  } else {
    wapdaOnCounter = 0;
    if (wapdaOffCounter < WAPDA_DEBOUNCE_COUNT) wapdaOffCounter++;
    if (wapdaOffCounter >= WAPDA_DEBOUNCE_COUNT) {
      if (wapdaAvailable) {
        wapdaAvailable = false;
        Serial.println("[WAPDA] Power OUTAGE!");
        sendStatusUpdate();
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  LDR: AVERAGED READ + INVERTED LOGIC
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
    lastLdrDecision = false;
    return;
  }

  if (ldrControlEnabled) {
    bool newSunnyState = isSunny;

// ── NORMAL LOGIC: high ADC = bright light, low ADC = dark ──
if (!isSunny && ldrValue > ldrSunThreshold) {
  newSunnyState = true;   // High value = sunlight
} else if (isSunny && ldrValue < ldrDarkThreshold) {
  newSunnyState = false;  // Low value = darkness
}
    // Dead band between 1000–3000 = no state change (stable)

    if (newSunnyState != isSunny) {
      unsigned long now = millis();
      if (now - lastLdrToggleTime > LDR_DEBOUNCE_DELAY) {
        isSunny = newSunnyState;
        lastLdrToggleTime = now;
        Serial.printf("[LDR] Sunlight: %s (Avg Value: %d)\n",
                      isSunny ? "SUNNY" : "CLOUDY", ldrValue);
        sendStatusUpdate();
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  RELAY CONTROL LOGIC
// ═════════════════════════════════════════════════════════════════════════

void setWAPDARelay(bool on) {
  if (wapdaRelayState == on) return;
  wapdaRelayState = on;
  digitalWrite(WAPDA_RELAY_PIN, on ? RELAY_ON : RELAY_OFF);
  Serial.printf("[WAPDA Relay] → %s (Mode: %s)\n", on ? "ON" : "OFF", wapdaAutoMode ? "AUTO" : "MANUAL");
  sendStatusUpdate();
}

void setHeavyLoadRelay(bool on) {
  if (heavyLoadState == on) return;
  heavyLoadState = on;
  digitalWrite(HEAVY_LOAD_PIN, on ? RELAY_ON : RELAY_OFF);
  Serial.printf("[Heavy Load] → %s (Mode: %s)\n", on ? "ON" : "OFF", heavyLoadAutoMode ? "AUTO" : "MANUAL");
  sendStatusUpdate();
}

void updateWAPDALogic() {
  if (!wapdaAutoMode) return;

  updateTime();

  bool shouldWAPDAOn = !isDayTime;

  if (shouldWAPDAOn != wapdaRelayState) {
    setWAPDARelay(shouldWAPDAOn);
    Serial.printf("[Auto] WAPDA %s because it's %s\n",
      shouldWAPDAOn ? "ON" : "OFF",
      isDayTime ? "DAY TIME (8AM-6PM)" : "NIGHT TIME (6PM-8AM)");
  }
}

void updateHeavyLoadLogic() {
  if (!heavyLoadAutoMode) return;

  updateTime();

  bool shouldHeavyLoadOn = isDayTime ? true : wapdaAvailable;

  if (shouldHeavyLoadOn != heavyLoadState) {
    setHeavyLoadRelay(shouldHeavyLoadOn);
    if (!isDayTime && !wapdaAvailable) {
      Serial.println("[Auto] Heavy Load OFF - WAPDA unavailable at night!");
    } else if (isDayTime) {
      Serial.println("[Auto] Heavy Load ON - Daytime mode (solar/battery)");
    } else {
      Serial.println("[Auto] Heavy Load ON - Nighttime with WAPDA");
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  WEB COMMUNICATION
// ═════════════════════════════════════════════════════════════════════════

void sendStatusUpdate() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/esp32/status";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

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
  doc["ldrSunThreshold"] = ldrSunThreshold;
  doc["ldrDarkThreshold"] = ldrDarkThreshold;

  String jsonString;
  serializeJson(doc, jsonString);

  int httpCode = http.POST(jsonString);

  Serial.print("[STATUS] HTTP Code: ");
  Serial.println(httpCode);

  http.end();
}

void checkForCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/esp32/commands";

  http.begin(client, url);
  http.setTimeout(10000);

  int response = http.GET();

  if (response == 200) {
    String payload = http.getString();

    StaticJsonDocument<1024> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error && doc.containsKey("commands")) {
      JsonArray commands = doc["commands"];

      for (JsonObject cmd : commands) {
        String type = cmd["type"];
        int value = cmd["value"];

        Serial.printf("[CMD] %s = %d\n", type.c_str(), value);

        if (type == "WAPDA_RELAY") {
          if (!wapdaAutoMode) setWAPDARelay(value == 1);
        }
        else if (type == "HEAVY_LOAD") {
          if (!heavyLoadAutoMode) setHeavyLoadRelay(value == 1);
        }
        else if (type == "WAPDA_MODE") {
          wapdaAutoMode = (value == 1);
        }
        else if (type == "HEAVY_LOAD_MODE") {
          heavyLoadAutoMode = (value == 1);
        }
        else if (type == "LDR_ENABLED") {
          ldrControlEnabled = (value == 1);
        }
        else if (type == "LDR_SUN_THRESH") {
          ldrSunThreshold = value;
        }
        else if (type == "LDR_DARK_THRESH") {
          ldrDarkThreshold = value;
        }
      }
    }
  }

  http.end();
}

void sendSensorData() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/esp32/data";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

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

  int httpCode = http.POST(jsonString);

  Serial.print("[DATA] HTTP Code: ");
  Serial.println(httpCode);

  http.end();
}

// ═════════════════════════════════════════════════════════════════════════
//  OLED DISPLAY
// ═════════════════════════════════════════════════════════════════════════
void updateOLED() {
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(0, 10, "Smart Energy Ctrl");

  char buf[32];
  DateTime now = rtc.now();
  sprintf(buf, "%02d:%02d %s",
    (now.hour() % 12 == 0) ? 12 : now.hour() % 12,
    now.minute(),
    now.hour() >= 12 ? "PM" : "AM");
  oled.drawStr(0, 21, buf);

  sprintf(buf, "W:%s", wapdaAvailable ? "ON" : "OFF");
  oled.drawStr(100, 21, buf);

  oled.drawHLine(0, 24, 128);

  sprintf(buf, "V:%.0fV  I:%.2fA", acVoltage, acCurrent);
  oled.drawStr(0, 36, buf);

  sprintf(buf, "P:%.1fW", acPower);
  oled.drawStr(0, 47, buf);

  sprintf(buf, "W:%s[%s] L:%s[%s]",
    wapdaRelayState ? "ON" : "OF",
    wapdaAutoMode ? "A" : "M",
    heavyLoadState ? "ON" : "OF",
    heavyLoadAutoMode ? "A" : "M");
  oled.drawStr(0, 58, buf);

  if (isDayTime) {
    sprintf(buf, "LDR:%4d %s", ldrValue, isSunny ? "SUN" : "CLD");
  } else {
    sprintf(buf, "LDR:%4d NIGHT", ldrValue);
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

  Serial.println("\n╔════════════════════════════════════════════════╗");
  Serial.println("║     SMART ENERGY CONTROLLER v2.0              ║");
  Serial.println("║     Full Auto/Manual Web Control              ║");
  Serial.println("╚════════════════════════════════════════════════╝");

  pinMode(WAPDA_RELAY_PIN, OUTPUT);
  pinMode(HEAVY_LOAD_PIN, OUTPUT);
  pinMode(LDR_PIN, INPUT);

  digitalWrite(WAPDA_RELAY_PIN, RELAY_OFF);
  digitalWrite(HEAVY_LOAD_PIN, RELAY_OFF);

  voltageSensor.setSensitivity(VOLTAGE_SENSITIVITY);

  oled.begin();
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x10_tf);
  oled.drawStr(0, 20, "Initializing...");
  oled.sendBuffer();

  if (!rtc.begin()) {
    Serial.println("[ERROR] RTC not found!");
  } else {
    Serial.println("[OK] RTC initialized");
  }

  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected!");
    Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[ERROR] WiFi failed!");
  }

  checkWAPDA();
  acCurrent = readCurrentRMS();
  acPower = acVoltage * acCurrent;

  updateWAPDALogic();
  updateHeavyLoadLogic();

  Serial.println("\n[READY] System running!");
  Serial.println("════════════════════════════════════════════════");
  Serial.println("DAY TIME (8AM-6PM):  WAPDA = OFF, Load = ON");
  Serial.println("NIGHT TIME (6PM-8AM): WAPDA = ON, Load = ON (if WAPDA available)");
  Serial.println("LDR: LOW value = SUNNY | HIGH value = DARK");
  Serial.println("════════════════════════════════════════════════\n");
}

// ═════════════════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═════════════════════════════════════════════════════════════════════════
void loop() {
  static unsigned long lastVoltageCheck = 0;
  static unsigned long lastCurrentCheck = 0;
  static unsigned long lastLDRCheck = 0;
  static unsigned long lastDataSend = 0;
  static unsigned long lastCommandCheck = 0;
  static unsigned long lastOLEDUpdate = 0;
  static unsigned long lastWAPDALogic = 0;
  static unsigned long lastHeavyLoadLogic = 0;

  unsigned long now = millis();

  if (now - lastVoltageCheck >= 500) {
    checkWAPDA();
    lastVoltageCheck = now;
  }

  if (now - lastCurrentCheck >= 3000) {
    acCurrent = readCurrentRMS();
    acPower = acVoltage * acCurrent;
    lastCurrentCheck = now;
  }

  if (now - lastLDRCheck >= 5000) {
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

  if (now - lastDataSend >= 5000) {
    sendSensorData();
    lastDataSend = now;
  }

  if (now - lastCommandCheck >= 3000) {
    checkForCommands();
    lastCommandCheck = now;
  }

  if (now - lastOLEDUpdate >= 1000) {
    updateOLED();
    lastOLEDUpdate = now;
  }

  delay(50);
}