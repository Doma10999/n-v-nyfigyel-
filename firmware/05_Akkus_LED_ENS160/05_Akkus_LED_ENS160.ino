#include <Arduino.h>
#include <driver/ledc.h>
#include "esp_sleep.h"
#include "esp_timer.h"
#include <esp_system.h>
#include <Wire.h>
#include "NovenyCore.h"
#include "DeviceSecrets.h"

using namespace noveny;

#define SOIL_PIN 34
#define BATTERY_PIN 35
#define LED_PIN 23
#define TOUCH_PIN 27
#define I2C_SDA_PIN 19
#define I2C_SCL_PIN 22
#define LED_PWM_CHANNEL LEDC_CHANNEL_0
#define LED_PWM_TIMER LEDC_TIMER_0

#define ENS160_ADDR_PRIMARY 0x52
#define ENS160_ADDR_SECONDARY 0x53
#define ENS160_REG_PART_ID 0x00
#define ENS160_REG_OPMODE 0x10
#define ENS160_REG_DATA_STATUS 0x20
#define ENS160_REG_AQI 0x21
#define ENS160_REG_TVOC 0x22
#define ENS160_REG_ECO2 0x24
#define ENS160_OPMODE_IDLE 0x01
#define ENS160_OPMODE_STD 0x02

static const char *AP_NAME = "Novenyfigyelo";
static const char *FIRMWARE_VERSION = "Novenyfigyelo-v2-05";

static const uint64_t SENSOR_INTERVAL_US = 3ULL * 60ULL * 60ULL * 1000000ULL;
static const uint64_t UPLOAD_RETRY_US = 30ULL * 60ULL * 1000000ULL;
static const uint64_t AIR_RETRY_US = 15ULL * 60ULL * 1000000ULL;
static const uint32_t AP_HOLD_MS = 12000UL;
static const uint8_t AIR_SAMPLE_COUNT = 5;
static const uint32_t AIR_SAMPLE_GAP_MS = 1000UL;

WiFiService wifi(AP_NAME, 120);
FirebaseRest firebase(wifi, API_KEY, DB_URL, AUTH_EMAIL, AUTH_PASSWORD);
MeasurementQueue queue;

bool ledOn = false;
int ledLevel = 40;
bool dimDirectionUp = true;
uint64_t nextMeasurementUs = 0;
uint64_t nextUploadRetryUs = 0;
uint64_t nextAirRetryUs = 0;

bool lastTouchState = false;
uint32_t pressStartMs = 0;
uint32_t lastTapMs = 0;
uint32_t lastDimStepMs = 0;
uint32_t touchAwakeUntilMs = 0;
uint8_t tapCount = 0;
bool apTriggered = false;

uint8_t ens160Address = ENS160_ADDR_PRIMARY;
bool ens160Running = false;
uint32_t ens160StartedMs = 0;
uint8_t airAqi = 0;
uint16_t airTvoc = 0;
uint16_t airEco2 = 0;
bool airValid = false;
bool airStable = false;
bool airWarmupAccepted = false;
String airDeviceStatus = "nincs_adat";

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

void beginAirBus() {
  Wire.end();
  delay(30);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeOut(100);
  delay(60);
}

void recoverAirBus() {
  Wire.end();
  pinMode(I2C_SDA_PIN, INPUT_PULLUP);
  pinMode(I2C_SCL_PIN, OUTPUT_OPEN_DRAIN);
  digitalWrite(I2C_SCL_PIN, HIGH);
  for (int i = 0; i < 9; i++) {
    digitalWrite(I2C_SCL_PIN, LOW); delayMicroseconds(8);
    digitalWrite(I2C_SCL_PIN, HIGH); delayMicroseconds(8);
  }
  beginAirBus();
}

bool probeAddress(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

bool detectEns160() {
  if (probeAddress(ENS160_ADDR_PRIMARY)) { ens160Address = ENS160_ADDR_PRIMARY; return true; }
  if (probeAddress(ENS160_ADDR_SECONDARY)) { ens160Address = ENS160_ADDR_SECONDARY; return true; }
  return false;
}

bool ensWrite8(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(ens160Address);
  Wire.write(reg); Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool ensReadBytes(uint8_t reg, uint8_t *buffer, uint8_t length) {
  Wire.beginTransmission(ens160Address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  uint8_t received = Wire.requestFrom((uint8_t)ens160Address, length);
  if (received != length) { while (Wire.available()) Wire.read(); return false; }
  for (uint8_t i = 0; i < length; i++) buffer[i] = Wire.read();
  return true;
}

bool ensRead8(uint8_t reg, uint8_t &value) {
  uint8_t b[1];
  if (!ensReadBytes(reg, b, 1)) return false;
  value = b[0]; return true;
}

bool ensRead16(uint8_t reg, uint16_t &value) {
  uint8_t b[2];
  if (!ensReadBytes(reg, b, 2)) return false;
  value = (uint16_t)b[0] | ((uint16_t)b[1] << 8);
  return true;
}

uint8_t validityCode(uint8_t status) { return (status >> 2) & 0x03; }
bool sensorError(uint8_t status) { return (status & 0x40) != 0; }
bool sensorRunning(uint8_t status) { return (status & 0x80) != 0; }

String validityText(uint8_t status) {
  switch (validityCode(status)) {
    case 0: return "standard_ok";
    case 1: return "sensor_bemelegites";
    case 2: return "sensor_elso_inditas";
    default: return "sensor_nem_ervenyes";
  }
}

bool startEns160(bool forceRecovery = false) {
  if (forceRecovery) { ens160Running = false; recoverAirBus(); }
  else beginAirBus();

  if (ens160Running && probeAddress(ens160Address)) return true;
  if (!detectEns160()) {
    airDeviceStatus = "sensor_nem_elerheto";
    Wire.end();
    return false;
  }

  uint16_t partId = 0;
  if (ensRead16(ENS160_REG_PART_ID, partId)) {
    Serial.print("ENS160 PART ID: 0x"); Serial.println(partId, HEX);
  }
  if (!ensWrite8(ENS160_REG_OPMODE, ENS160_OPMODE_IDLE)) return false;
  delay(500);
  if (!ensWrite8(ENS160_REG_OPMODE, ENS160_OPMODE_STD)) return false;
  ens160Running = true;
  ens160StartedMs = millis();
  Serial.println("ENS160 STANDARD MODE");
  delay(1000);
  return true;
}

bool realAirSample(uint8_t aqi, uint16_t tvoc, uint16_t eco2) {
  return aqi >= 1 && aqi <= 5 && eco2 > 0 && !(aqi == 0 && tvoc == 0 && eco2 == 0);
}

bool readAirQuality(bool allowRecovery = true) {
  airValid = false;
  airStable = false;
  airWarmupAccepted = false;
  airAqi = 0; airTvoc = 0; airEco2 = 0;
  airDeviceStatus = "nincs_adat";

  if (!startEns160(false)) {
    if (!allowRecovery || !startEns160(true)) return false;
  }

  bool gotSample = false;
  uint8_t bestAqi = 0;
  uint16_t bestTvoc = 0, bestEco2 = 0;
  uint8_t lastStatus = 0xFF;

  for (uint8_t i = 0; i < AIR_SAMPLE_COUNT; i++) {
    uint8_t status = 0, aqi = 0;
    uint16_t tvoc = 0, eco2 = 0;
    bool statusOk = ensRead8(ENS160_REG_DATA_STATUS, status);
    if (statusOk) {
      lastStatus = status;
      Serial.print("ENS160 STATUS: 0x"); Serial.print(status, HEX);
      Serial.print(" "); Serial.println(validityText(status));
    }
    bool valuesOk = ensRead8(ENS160_REG_AQI, aqi) &&
                    ensRead16(ENS160_REG_TVOC, tvoc) &&
                    ensRead16(ENS160_REG_ECO2, eco2);
    if (valuesOk) {
      Serial.print("AIR AQI="); Serial.print(aqi);
      Serial.print(" TVOC="); Serial.print(tvoc);
      Serial.print(" ECO2="); Serial.println(eco2);
    }

    if (valuesOk && realAirSample(aqi, tvoc, eco2) &&
        (!statusOk || (!sensorError(status) && validityCode(status) != 3))) {
      gotSample = true;
      if (aqi > bestAqi) bestAqi = aqi;
      if (tvoc > bestTvoc) bestTvoc = tvoc;
      if (eco2 > bestEco2) bestEco2 = eco2;
      if (statusOk) {
        airDeviceStatus = validityText(status);
        if (validityCode(status) == 0 && sensorRunning(status)) airStable = true;
        if (validityCode(status) == 1 || validityCode(status) == 2) airWarmupAccepted = true;
      }
    }
    delay(AIR_SAMPLE_GAP_MS);
  }
  Wire.end();

  if (!gotSample) {
    if (lastStatus != 0xFF) airDeviceStatus = validityText(lastStatus);
    return false;
  }
  airAqi = bestAqi; airTvoc = bestTvoc; airEco2 = bestEco2; airValid = true;
  Serial.print("AIR FINAL: "); Serial.print(airAqi); Serial.print(" / ");
  Serial.print(airTvoc); Serial.print(" / "); Serial.println(airEco2);
  return true;
}

void enqueueMeasurement() {
  MeasurementRecord rec{};
  rec.sequence = queue.nextSequence();
  rec.measuredAtMs = epochMsNow();
  rec.soil = readSoil();
  rec.battery = readBattery();
  rec.flags = FLAG_BATTERY;

  if (readAirQuality()) {
    rec.flags |= FLAG_AIR;
    if (airStable) rec.flags |= FLAG_AIR_STABLE;
    if (airWarmupAccepted) rec.flags |= FLAG_AIR_WARMUP;
    if (airBadFor(airAqi, airTvoc, airEco2)) rec.flags |= FLAG_AIR_BAD;
    rec.aqi = airAqi; rec.tvoc = airTvoc; rec.eco2 = airEco2;
  } else {
    nextAirRetryUs = esp_timer_get_time() + AIR_RETRY_US;
  }

  if (queue.push(rec)) {
    Serial.print("MERES HELYBEN MENTVE seq="); Serial.println(rec.sequence);
  }
}

bool flushPending() {
  if (queue.empty()) { nextUploadRetryUs = 0; return true; }
  if (!wifi.connect()) {
    nextUploadRetryUs = esp_timer_get_time() + UPLOAD_RETRY_US;
    return false;
  }
  bool ok = flushQueue(queue, firebase, DEVICE_ID, FIRMWARE_VERSION,
                       (uint32_t)(SENSOR_INTERVAL_US / 1000ULL), 32, airDeviceStatus);
  wifi.off();
  if (ok) nextUploadRetryUs = 0;
  else nextUploadRetryUs = esp_timer_get_time() + UPLOAD_RETRY_US;
  return ok;
}

bool uploadAirOnly() {
  if (!readAirQuality()) {
    nextAirRetryUs = esp_timer_get_time() + AIR_RETRY_US;
    return false;
  }
  if (!wifi.connect()) {
    nextAirRetryUs = esp_timer_get_time() + UPLOAD_RETRY_US;
    return false;
  }

  String payload;
  payload.reserve(360);
  payload = "{\"aqi\":" + String(airAqi) + ",\"tvoc\":" + String(airTvoc) +
            ",\"eco2\":" + String(airEco2) + ",\"status\":\"" +
            airStatusFor(airAqi, airTvoc, airEco2) + "\",\"bad\":" +
            String(airBadFor(airAqi, airTvoc, airEco2) ? "true" : "false") +
            ",\"valid\":true,\"stable\":" + String(airStable ? "true" : "false") +
            ",\"warmupAccepted\":" + String(airWarmupAccepted ? "true" : "false") +
            ",\"deviceStatus\":\"" + jsonEscape(airDeviceStatus) +
            "\",\"lastAirMeasurementAt\":{\".sv\":\"timestamp\"}}";

  String devicePath = firebase.resolveDevicePath(DEVICE_ID);
  bool ok = !devicePath.isEmpty() && firebase.patch(devicePath + "/airQuality", payload, 2);
  wifi.off();
  if (ok && airStable) nextAirRetryUs = 0;
  else nextAirRetryUs = esp_timer_get_time() + AIR_RETRY_US;
  return ok;
}

void handleTouch() {
  bool state = digitalRead(TOUCH_PIN);
  uint32_t now = millis();

  if (state && !lastTouchState) {
    pressStartMs = now; lastDimStepMs = now; apTriggered = false;
    touchAwakeUntilMs = now + AP_HOLD_MS + 1000UL;
  }
  if (state) {
    uint32_t held = now - pressStartMs;
    if (!apTriggered && held >= AP_HOLD_MS) {
      apTriggered = true; tapCount = 0;
      wifi.openPortal();
      flushPending();
      touchAwakeUntilMs = millis() + 800UL;
    } else if (!apTriggered && ledOn && held > 600UL && elapsedMs(now, lastDimStepMs, 60UL)) {
      ledLevel += dimDirectionUp ? 2 : -2;
      ledLevel = constrain(ledLevel, 0, 100);
      applyLed(); lastDimStepMs = now;
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
          ledOn = !ledOn; applyLed(); tapCount = 0;
        }
      } else if (held > 600UL) dimDirectionUp = !dimDirectionUp;
    }
    touchAwakeUntilMs = now + 700UL;
  }
  if (tapCount == 1 && elapsedMs(now, lastTapMs, 600UL)) tapCount = 0;
  lastTouchState = state;
}

void efficientLightSleep() {
  if (ledOn || digitalRead(TOUCH_PIN)) return;
  uint32_t nowMs = millis();
  if ((int32_t)(touchAwakeUntilMs - nowMs) > 0) { delay(5); return; }

  uint64_t nowUs = esp_timer_get_time();
  uint64_t targetUs = nextMeasurementUs;
  if (!queue.empty() && nextUploadRetryUs != 0 && nextUploadRetryUs < targetUs) targetUs = nextUploadRetryUs;
  if (nextAirRetryUs != 0 && nextAirRetryUs < targetUs) targetUs = nextAirRetryUs;
  if (targetUs <= nowUs) return;

  esp_sleep_enable_ext0_wakeup((gpio_num_t)TOUCH_PIN, 1);
  esp_sleep_enable_timer_wakeup(targetUs - nowUs);
  esp_light_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println(FIRMWARE_VERSION);

  setCpuFrequencyMhz(80);
  pinMode(TOUCH_PIN, INPUT_PULLDOWN);
  pinMode(LED_PIN, OUTPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);
  setupPwm();
  queue.begin("nv2_05");
  wifi.begin();

  startEns160(false); // AP alatt is melegszik
  if (shouldOpenPortal()) wifi.openPortal();

  enqueueMeasurement();
  flushPending();
  uint64_t nowUs = esp_timer_get_time();
  nextMeasurementUs = nowUs + SENSOR_INTERVAL_US;
  if (!queue.empty() && nextUploadRetryUs == 0) nextUploadRetryUs = nowUs + UPLOAD_RETRY_US;
  if (airValid && !airStable) nextAirRetryUs = nowUs + AIR_RETRY_US;
  Serial.println("NEXT MEASUREMENT: 3 ORA");
}

void loop() {
  handleTouch();
  uint64_t nowUs = esp_timer_get_time();

  if (nowUs >= nextMeasurementUs) {
    enqueueMeasurement();
    do { nextMeasurementUs += SENSOR_INTERVAL_US; } while (nextMeasurementUs <= nowUs);
    flushPending();
  } else if (!queue.empty() && nextUploadRetryUs != 0 && nowUs >= nextUploadRetryUs) {
    flushPending();
  }

  if (nextAirRetryUs != 0 && nowUs >= nextAirRetryUs) uploadAirOnly();

  efficientLightSleep();
  delay(5);
}
