#include <Arduino.h>
#include <driver/ledc.h>
#include "esp_sleep.h"
#include "esp_timer.h"
#include <esp_system.h>
#include "NovenyCore.h"
#include "DeviceSecrets.h"

using namespace noveny;

#define SOIL_PIN 34
#define BATTERY_PIN 35
#define LED_PIN 23
#define TOUCH_PIN 27
#define LED_PWM_CHANNEL LEDC_CHANNEL_0
#define LED_PWM_TIMER LEDC_TIMER_0

static const char *AP_NAME = "Novenyfigyelo";
static const char *FIRMWARE_VERSION = "Novenyfigyelo-v2-04";

static const uint64_t SENSOR_INTERVAL_US = 3ULL * 60ULL * 60ULL * 1000000ULL;
static const uint64_t RETRY_INTERVAL_US = 30ULL * 60ULL * 1000000ULL;
static const uint32_t AP_HOLD_MS = 12000UL;

WiFiService wifi(AP_NAME, 120);
FirebaseRest firebase(wifi, API_KEY, DB_URL, AUTH_EMAIL, AUTH_PASSWORD);
MeasurementQueue queue;

bool ledOn = false;
int ledLevel = 40;
bool dimDirectionUp = true;
uint64_t nextMeasurementUs = 0;
uint64_t nextRetryUs = 0;

bool lastTouchState = false;
uint32_t pressStartMs = 0;
uint32_t lastTapMs = 0;
uint32_t lastDimStepMs = 0;
uint32_t touchAwakeUntilMs = 0;
uint8_t tapCount = 0;
bool apTriggered = false;

String resetReasonText() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "poweron";
    case ESP_RST_EXT: return "external_reset";
    case ESP_RST_SW: return "software_restart";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_BROWNOUT: return "brownout";
    default: return "other";
  }
}

bool shouldOpenPortal() {
  esp_reset_reason_t reason = esp_reset_reason();
  return reason == ESP_RST_POWERON || reason == ESP_RST_EXT;
}

void applyLed() {
  uint32_t duty = ledOn ? (uint32_t)map(ledLevel, 0, 100, 0, 255) : 0;
  ledc_set_duty(LEDC_LOW_SPEED_MODE, LED_PWM_CHANNEL, duty);
  ledc_update_duty(LEDC_LOW_SPEED_MODE, LED_PWM_CHANNEL);
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
  applyLed();
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

int readBattery() {
  long sum = 0;
  for (int i = 0; i < 12; i++) { sum += analogRead(BATTERY_PIN); delay(3); }
  float adc = sum / 12.0f;
  float voltage = ((adc / 4095.0f) * 3.3f * 3.2f) * 1.12f + 0.20f;
  voltage = constrain(voltage, 3.2f, 4.2f);
  int percent = constrain((int)lroundf((voltage - 3.2f) * 100.0f), 0, 100);
  Serial.print("BATTERY V: "); Serial.println(voltage, 3);
  Serial.print("BATTERY %: "); Serial.println(percent);
  return percent;
}

void enqueueMeasurement() {
  MeasurementRecord rec{};
  rec.sequence = queue.nextSequence();
  rec.measuredAtMs = epochMsNow();
  rec.soil = readSoil();
  rec.battery = readBattery();
  rec.flags = FLAG_BATTERY;
  if (queue.push(rec)) {
    Serial.print("MERES HELYBEN MENTVE seq="); Serial.println(rec.sequence);
  }
}

bool flushPending() {
  if (queue.empty()) { nextRetryUs = 0; return true; }
  if (!wifi.connect()) {
    nextRetryUs = esp_timer_get_time() + RETRY_INTERVAL_US;
    return false;
  }
  bool ok = flushQueue(queue, firebase, DEVICE_ID, FIRMWARE_VERSION,
                       (uint32_t)(SENSOR_INTERVAL_US / 1000ULL), 32);
  wifi.off();
  if (ok) {
    nextRetryUs = 0;
    Serial.println("MINDEN FUGGO ADAT FELTOLTVE");
  } else {
    nextRetryUs = esp_timer_get_time() + RETRY_INTERVAL_US;
    Serial.println("FELTOLTES HIBA -> 30 PERC MULVA UJRA");
  }
  return ok;
}

void handleTouch() {
  bool state = digitalRead(TOUCH_PIN);
  uint32_t now = millis();

  if (state && !lastTouchState) {
    pressStartMs = now;
    lastDimStepMs = now;
    apTriggered = false;
    touchAwakeUntilMs = now + AP_HOLD_MS + 1000UL;
  }

  if (state) {
    uint32_t held = now - pressStartMs;
    if (!apTriggered && held >= AP_HOLD_MS) {
      apTriggered = true;
      tapCount = 0;
      Serial.println("ERINTO 12 MP -> AP MOD");
      wifi.openPortal();
      flushPending();
      touchAwakeUntilMs = millis() + 800UL;
    } else if (!apTriggered && ledOn && held > 600UL && elapsedMs(now, lastDimStepMs, 60UL)) {
      ledLevel += dimDirectionUp ? 2 : -2;
      ledLevel = constrain(ledLevel, 0, 100);
      applyLed();
      lastDimStepMs = now;
    }
  }

  if (!state && lastTouchState) {
    uint32_t held = now - pressStartMs;
    if (!apTriggered) {
      if (held < 400UL) {
        if (tapCount == 0 || elapsedMs(now, lastTapMs, 600UL)) tapCount = 0;
        tapCount++;
        if (tapCount == 1) lastTapMs = now;
        if (tapCount >= 2 && !elapsedMs(now, lastTapMs, 600UL)) {
          ledOn = !ledOn;
          applyLed();
          tapCount = 0;
          Serial.println(ledOn ? "LED BE" : "LED KI");
        }
      } else if (held > 600UL) {
        dimDirectionUp = !dimDirectionUp;
      }
    }
    touchAwakeUntilMs = now + 700UL;
  }

  if (tapCount == 1 && elapsedMs(now, lastTapMs, 600UL)) tapCount = 0;
  lastTouchState = state;
}

void efficientLightSleep() {
  if (ledOn || digitalRead(TOUCH_PIN)) return;
  uint32_t nowMs = millis();
  if ((int32_t)(touchAwakeUntilMs - nowMs) > 0) {
    delay(5);
    return;
  }

  uint64_t nowUs = esp_timer_get_time();
  uint64_t targetUs = nextMeasurementUs;
  if (!queue.empty() && nextRetryUs != 0 && nextRetryUs < targetUs) targetUs = nextRetryUs;
  if (targetUs <= nowUs) return;

  uint64_t sleepUs = targetUs - nowUs;
  esp_sleep_enable_ext0_wakeup((gpio_num_t)TOUCH_PIN, 1);
  esp_sleep_enable_timer_wakeup(sleepUs);
  esp_light_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println(FIRMWARE_VERSION);
  Serial.print("RESET: "); Serial.println(resetReasonText());

  setCpuFrequencyMhz(80);
  pinMode(TOUCH_PIN, INPUT_PULLDOWN);
  pinMode(LED_PIN, OUTPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);
  setupPwm();

  queue.begin("nv2_04");
  wifi.begin();

  if (shouldOpenPortal()) {
    Serial.println("KEZI RESET / ARAMALAHELYEZES -> 2 PERC AP");
    wifi.openPortal();
  }

  enqueueMeasurement();
  flushPending();
  uint64_t nowUs = esp_timer_get_time();
  nextMeasurementUs = nowUs + SENSOR_INTERVAL_US;
  if (!queue.empty() && nextRetryUs == 0) nextRetryUs = nowUs + RETRY_INTERVAL_US;
  Serial.println("NEXT MEASUREMENT: 3 ORA");
}

void loop() {
  handleTouch();
  uint64_t nowUs = esp_timer_get_time();

  if (nowUs >= nextMeasurementUs) {
    enqueueMeasurement();
    do { nextMeasurementUs += SENSOR_INTERVAL_US; } while (nextMeasurementUs <= nowUs);
    flushPending();
  } else if (!queue.empty() && nextRetryUs != 0 && nowUs >= nextRetryUs) {
    flushPending();
  }

  efficientLightSleep();
  delay(5);
}
