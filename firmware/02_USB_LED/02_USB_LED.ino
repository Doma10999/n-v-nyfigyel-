#include <Arduino.h>
#include <driver/ledc.h>
#include <esp_system.h>
#include "NovenyCore.h"
#include "DeviceSecrets.h"
#include "NovenyLedStream.h"

using namespace noveny;

#define SOIL_PIN 34
#define LED_PIN 23
#define LED_PWM_CHANNEL LEDC_CHANNEL_0
#define LED_PWM_TIMER LEDC_TIMER_0

static const char *AP_NAME = "Novenyfigyelo";
static const char *FIRMWARE_VERSION = "Novenyfigyelo-v2-02";

static const uint32_t SENSOR_INTERVAL_MS = 3UL * 60UL * 60UL * 1000UL;
static const uint32_t SENSOR_RETRY_MS = 10UL * 60UL * 1000UL;
static const uint32_t WIFI_CHECK_MS = 30000UL;
static const uint32_t NO_SENSOR_SUCCESS_RESTART_MS = 8UL * 60UL * 60UL * 1000UL;

WiFiService wifi(AP_NAME, 120);
FirebaseRest firebase(wifi, API_KEY, DB_URL, AUTH_EMAIL, AUTH_PASSWORD);
MeasurementQueue queue;
LedEventStream ledStream;

int currentLedLevel = -1;
uint32_t lastSensorScheduleMs = 0;
uint32_t lastUploadAttemptMs = 0;
uint32_t lastWiFiCheckMs = 0;
uint32_t lastSensorSuccessMs = 0;

String resetReasonText() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "poweron";
    case ESP_RST_EXT: return "external_reset";
    case ESP_RST_SW: return "software_restart";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT: return "interrupt_watchdog";
    case ESP_RST_TASK_WDT: return "task_watchdog";
    case ESP_RST_WDT: return "watchdog";
    case ESP_RST_BROWNOUT: return "brownout";
    default: return "other";
  }
}

bool shouldOpenPortal() {
  esp_reset_reason_t reason = esp_reset_reason();
  return reason == ESP_RST_POWERON || reason == ESP_RST_EXT;
}

void applyLed(int percent) {
  percent = constrain(percent, 0, 100);
  if (percent == currentLedLevel) return;
  currentLedLevel = percent;
  uint32_t duty = (uint32_t)map(percent, 0, 100, 0, 255);
  ledc_set_duty(LEDC_LOW_SPEED_MODE, LED_PWM_CHANNEL, duty);
  ledc_update_duty(LEDC_LOW_SPEED_MODE, LED_PWM_CHANNEL);
  Serial.print("LED: "); Serial.print(percent); Serial.println("%");
}

int readSoil() {
  long sum = 0;
  for (int i = 0; i < 10; i++) { sum += analogRead(SOIL_PIN); delay(5); }
  int raw = (int)(sum / 10);
  int soil = constrain(map(raw, 2910, 1465, 0, 100), 0, 100);
  Serial.print("SOIL RAW: "); Serial.println(raw);
  Serial.print("SOIL %: "); Serial.println(soil);
  return soil;
}

void enqueueMeasurement() {
  MeasurementRecord rec{};
  rec.sequence = queue.nextSequence();
  rec.measuredAtMs = epochMsNow();
  rec.soil = readSoil();
  rec.battery = -1;
  rec.flags = 0;
  if (queue.push(rec)) {
    Serial.print("MERES HELYBEN MENTVE seq="); Serial.println(rec.sequence);
  }
}

bool flushPending() {
  if (queue.empty()) return true;
  if (!wifi.connect()) return false;
  bool ok = flushQueue(queue, firebase, DEVICE_ID, FIRMWARE_VERSION,
                       SENSOR_INTERVAL_MS, 64);
  if (ok) {
    lastSensorSuccessMs = millis();
    Serial.println("SENSOR ADATOK FELTOLTVE");
  }
  return ok;
}

void setupPwm() {
  ledc_timer_config_t timer = {};
  timer.speed_mode = LEDC_LOW_SPEED_MODE;
  timer.duty_resolution = LEDC_TIMER_8_BIT;
  timer.timer_num = LED_PWM_TIMER;
  timer.freq_hz = 20000;
  timer.clk_cfg = LEDC_AUTO_CLK;
  ledc_timer_config(&timer);

  ledc_channel_config_t channel = {};
  channel.gpio_num = LED_PIN;
  channel.speed_mode = LEDC_LOW_SPEED_MODE;
  channel.channel = LED_PWM_CHANNEL;
  channel.intr_type = LEDC_INTR_DISABLE;
  channel.timer_sel = LED_PWM_TIMER;
  channel.duty = 0;
  channel.hpoint = 0;
  ledc_channel_config(&channel);
  applyLed(0);
}

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println(FIRMWARE_VERSION);
  Serial.print("RESET: "); Serial.println(resetReasonText());

  // Stabilitasi javitas: nem hivunk btStop()-ot es nem valtunk CPU-frekvenciat boot kozben.
  // ESP32 Arduino Core 3.x alatt a BT-leallitas bizonyos lapokon megszakitas-watchdogot okozhat.
  Serial.println("BOOT STEP 1: alap hardver init");
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  pinMode(SOIL_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  setupPwm();
  Serial.println("BOOT STEP 2: PWM OK");

  if (!queue.begin("nv2_02")) {
    Serial.println("QUEUE INIT FAIL");
  } else {
    Serial.println("BOOT STEP 3: QUEUE OK");
  }
  wifi.begin();
  Serial.println("BOOT STEP 4: WIFI SERVICE OK");
  lastSensorSuccessMs = millis();
  ledStream.begin();

  if (shouldOpenPortal()) {
    Serial.println("KEZI RESET / ARAMALAHELYEZES -> 2 PERC AP");
    wifi.openPortal();
  } else {
    wifi.connect();
  }

  if (WiFi.status() == WL_CONNECTED) syncClock();
  enqueueMeasurement();
  flushPending();

  uint32_t now = millis();
  lastSensorScheduleMs = now;
  lastUploadAttemptMs = now;
  lastWiFiCheckMs = now;
  Serial.println("BOOT END");
}

void loop() {
  uint32_t now = millis();

  if (elapsedMs(now, lastWiFiCheckMs, WIFI_CHECK_MS)) {
    if (WiFi.status() != WL_CONNECTED) wifi.connect();
    lastWiFiCheckMs = now;
  }

  int pendingLevel = ledStream.takeLevel();
  if (pendingLevel >= 0) applyLed(pendingLevel);
  ledStream.service(firebase, DEVICE_ID, now);

  if (elapsedMs(now, lastSensorScheduleMs, SENSOR_INTERVAL_MS)) {
    enqueueMeasurement();
    lastSensorScheduleMs = now;
    lastUploadAttemptMs = 0;
  }

  if (!queue.empty() && (lastUploadAttemptMs == 0 || elapsedMs(now, lastUploadAttemptMs, SENSOR_RETRY_MS))) {
    flushPending();
    lastUploadAttemptMs = millis();
  }

  if (!queue.empty() && elapsedMs(now, lastSensorSuccessMs, NO_SENSOR_SUCCESS_RESTART_MS)) {
    Serial.println("8 ORA NINCS SIKERES SENSOR FELTOLTES -> SZOFTVERES UJRAINDITAS");
    delay(300);
    ESP.restart();
  }

  delay(20);
}
