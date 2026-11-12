#include <Arduino.h>
#include "esp_sleep.h"
#include "NovenyCore.h"
#include "DeviceSecrets.h"

using namespace noveny;

#define SOIL_PIN 34

static const char *AP_NAME = "Novenyfigyelo";
static const char *FIRMWARE_VERSION = "Novenyfigyelo-v2-01";

static const uint32_t MEASUREMENT_SEC = 3UL * 60UL * 60UL;
static const uint32_t RETRY_SEC = 30UL * 60UL;
static const uint32_t RTC_MAGIC = 0xA1A10002UL;

RTC_DATA_ATTR uint32_t rtcMagic = 0;
RTC_DATA_ATTR uint32_t secondsToNextMeasurement = 0;

WiFiService wifi(AP_NAME, 120);
FirebaseRest firebase(wifi, API_KEY, DB_URL, AUTH_EMAIL, AUTH_PASSWORD);
MeasurementQueue queue;

int readSoil() {
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(SOIL_PIN);
    delay(5);
  }
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
  } else {
    Serial.println("HELYI MERES MENTESE SIKERTELEN");
  }
}

void sleepFor(uint32_t seconds) {
  if (seconds == 0) seconds = 1;
  Serial.print("DEEP SLEEP MASODPERC: "); Serial.println(seconds);
  wifi.off();
  esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);
  delay(100);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(700);
  Serial.println();
  Serial.println(FIRMWARE_VERSION);

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  pinMode(SOIL_PIN, INPUT);
  queue.begin("nv2_01");
  wifi.begin();

  bool timerWake = esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER;
  if (rtcMagic != RTC_MAGIC) {
    rtcMagic = RTC_MAGIC;
    secondsToNextMeasurement = 0;
    timerWake = false;
  }

  if (!timerWake) {
    secondsToNextMeasurement = 0;
    Serial.println("KEZI RESET / ARAMALAHELYEZES -> 2 PERC AP");
    wifi.openPortal();
  } else {
    Serial.println("TIMER WAKE -> AP KIHAGYVA");
  }

  if (secondsToNextMeasurement == 0) {
    enqueueMeasurement();
    secondsToNextMeasurement = MEASUREMENT_SEC;
  }

  bool allUploaded = false;
  if (!queue.empty() && wifi.connect()) {
    allUploaded = flushQueue(queue, firebase, DEVICE_ID, FIRMWARE_VERSION,
                             MEASUREMENT_SEC * 1000UL, 64);
  }

  uint32_t sleepSec;
  if (allUploaded || queue.empty()) {
    sleepSec = secondsToNextMeasurement;
  } else {
    sleepSec = secondsToNextMeasurement < RETRY_SEC ? secondsToNextMeasurement : RETRY_SEC;
  }

  if (sleepSec == 0) sleepSec = 1;
  if (secondsToNextMeasurement >= sleepSec) secondsToNextMeasurement -= sleepSec;
  else secondsToNextMeasurement = 0;

  Serial.print("QUEUE DB: "); Serial.println(queue.count());
  sleepFor(sleepSec);
}

void loop() {}
