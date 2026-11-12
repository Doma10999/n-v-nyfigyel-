#include <Arduino.h>
#include "esp_sleep.h"
#include "NovenyCore.h"
#include "DeviceSecrets.h"

using namespace noveny;

/* ================= HARDVER ================= */
#define SOIL_PIN    34
#define BATTERY_PIN 35

static const char *AP_NAME = "Novenyfigyelo";
static const char *FIRMWARE_VERSION = "Novenyfigyelo-v2-03";

/* ================= IDŐZÍTÉS ================= */
static const uint32_t MEASUREMENT_SEC = 3UL * 60UL * 60UL;
static const uint32_t RETRY_1_SEC = 30UL * 60UL;
static const uint32_t RETRY_2_SEC = 60UL * 60UL;
static const uint32_t RTC_MAGIC = 0xA1A10002UL;

/* ================= AKKU MÉRÉS =================
   A GPIO35-re kötött osztó: 220k felül, 100k alul.
   A korábbi +0,20 V fix korrekció lemerült akkunál kb. 20%-kal
   túlbecsülhette a töltöttséget. Ez a verzió az ESP32 kalibrált
   analogReadMilliVolts() mérését és nemlineáris LiPo-görbét használ.
*/
static const float BATTERY_DIVIDER_RATIO = 3.20f;
static const float BATTERY_CALIBRATION = 1.000f;

RTC_DATA_ATTR uint32_t rtcMagic = 0;
RTC_DATA_ATTR uint32_t secondsToNextMeasurement = 0;
RTC_DATA_ATTR uint8_t uploadRetryStep = 0;

WiFiService wifi(AP_NAME, 120);
FirebaseRest firebase(wifi, API_KEY, DB_URL, AUTH_EMAIL, AUTH_PASSWORD);
MeasurementQueue queue;

struct BatteryPoint {
  uint16_t millivolts;
  uint8_t percent;
};

static const BatteryPoint BATTERY_CURVE[] = {
  {3200,   0},
  {3300,   2},
  {3400,   6},
  {3500,  12},
  {3600,  22},
  {3700,  42},
  {3800,  62},
  {3900,  76},
  {4000,  87},
  {4100,  96},
  {4180, 100}
};

int batteryPercentFromMv(uint32_t mv) {
  const size_t count = sizeof(BATTERY_CURVE) / sizeof(BATTERY_CURVE[0]);
  if (mv <= BATTERY_CURVE[0].millivolts) return 0;
  if (mv >= BATTERY_CURVE[count - 1].millivolts) return 100;

  for (size_t i = 1; i < count; i++) {
    if (mv <= BATTERY_CURVE[i].millivolts) {
      const BatteryPoint &a = BATTERY_CURVE[i - 1];
      const BatteryPoint &b = BATTERY_CURVE[i];
      long pct = map((long)mv, (long)a.millivolts, (long)b.millivolts,
                     (long)a.percent, (long)b.percent);
      return constrain((int)pct, 0, 100);
    }
  }
  return 0;
}

int readSoil() {
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(SOIL_PIN);
    delay(5);
  }

  int raw = (int)(sum / 10);
  int soil = constrain(map(raw, 2910, 1465, 0, 100), 0, 100);

  Serial.print("SOIL RAW: ");
  Serial.println(raw);
  Serial.print("SOIL %: ");
  Serial.println(soil);
  return soil;
}

int readBattery() {
  // Ébredés után az ADC és az osztó kapjon rövid stabilizálási időt.
  delay(180);

  // Az első néhány olvasást eldobjuk.
  for (int i = 0; i < 6; i++) {
    (void)analogReadMilliVolts(BATTERY_PIN);
    delay(3);
  }

  uint32_t sumPinMv = 0;
  const uint8_t samples = 32;
  for (uint8_t i = 0; i < samples; i++) {
    sumPinMv += analogReadMilliVolts(BATTERY_PIN);
    delay(3);
  }

  float pinMv = sumPinMv / (float)samples;
  uint32_t batteryMv = (uint32_t)lroundf(pinMv * BATTERY_DIVIDER_RATIO * BATTERY_CALIBRATION);

  // Hibás/floating ADC esetén ne mutasson kitalált közepes töltöttséget.
  if (batteryMv < 2500 || batteryMv > 4500) {
    Serial.print("BATTERY MERES ERVENYTELEN mV: ");
    Serial.println(batteryMv);
    return 0;
  }

  int percent = batteryPercentFromMv(batteryMv);

  Serial.print("BATTERY PIN mV: ");
  Serial.println((uint32_t)lroundf(pinMv));
  Serial.print("BATTERY V: ");
  Serial.println(batteryMv / 1000.0f, 3);
  Serial.print("BATTERY %: ");
  Serial.println(percent);
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
    Serial.print("MERES HELYBEN MENTVE seq=");
    Serial.println(rec.sequence);
  } else {
    Serial.println("HELYI MERES MENTESE SIKERTELEN");
  }
}

uint32_t retryDelaySeconds() {
  if (uploadRetryStep == 0) return RETRY_1_SEC;
  if (uploadRetryStep == 1) return RETRY_2_SEC;
  // Két sikertelen külön próbálkozás után nem ébresztjük sűrűn az akkut:
  // a következő rendes 3 órás méréskor újra próbálkozik.
  return secondsToNextMeasurement > 0 ? secondsToNextMeasurement : MEASUREMENT_SEC;
}

void sleepFor(uint32_t seconds) {
  if (seconds == 0) seconds = 1;

  Serial.print("DEEP SLEEP MASODPERC: ");
  Serial.println(seconds);
  Serial.flush();

  wifi.off();

  // Timeres ébredéshez az RTC periféria nem szükséges.
  esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_PERIPH, ESP_PD_OPTION_OFF);
  esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);
  delay(80);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(700);
  Serial.println();
  Serial.println(FIRMWARE_VERSION);

  setCpuFrequencyMhz(80);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);
  pinMode(SOIL_PIN, INPUT);
  pinMode(BATTERY_PIN, INPUT);

  queue.begin("nv2_03");
  wifi.begin();

  bool timerWake = esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER;
  if (rtcMagic != RTC_MAGIC) {
    rtcMagic = RTC_MAGIC;
    secondsToNextMeasurement = 0;
    uploadRetryStep = 0;
    timerWake = false;
  }

  if (!timerWake) {
    secondsToNextMeasurement = 0;
    uploadRetryStep = 0;
    Serial.println("KEZI RESET / ARAMALAHELYEZES -> 2 PERC AP");
    wifi.openPortal();
  } else {
    Serial.println("TIMER WAKE -> AP KIHAGYVA");
  }

  // Új mérést kizárólag a rendes 3 órás időpontban készít.
  // A 30/60 perces retry csak a már helyben elmentett rekordot tölti fel.
  if (secondsToNextMeasurement == 0) {
    enqueueMeasurement();
    secondsToNextMeasurement = MEASUREMENT_SEC;
    uploadRetryStep = 0;
  }

  bool allUploaded = queue.empty();
  if (!queue.empty()) {
    // A deep-sleep utáni DNS/TLS kézfogás alatt 160 MHz-en futunk.
    // Ez csak néhány másodperc aktív idő, de lényegesen csökkenti a HTTP=-1
    // kapcsolatfelépítési hibák esélyét.
    setCpuFrequencyMhz(160);

    if (wifi.connect(35000UL) &&
        wifi.waitInternetReady("identitytoolkit.googleapis.com", 18000UL)) {
      allUploaded = flushQueue(queue, firebase, DEVICE_ID, FIRMWARE_VERSION,
                               MEASUREMENT_SEC * 1000UL, 32);
    } else {
      allUploaded = false;
    }
  }

  uint32_t sleepSec = secondsToNextMeasurement;

  if (allUploaded || queue.empty()) {
    uploadRetryStep = 0;
    Serial.println("MINDEN FUGGO ADAT FELTOLTVE");
  } else {
    uint32_t retrySec = retryDelaySeconds();
    if (retrySec < sleepSec) sleepSec = retrySec;
    if (uploadRetryStep < 2) uploadRetryStep++;
    Serial.print("FELTOLTES NEM SIKERULT -> kovetkezo proba mp: ");
    Serial.println(sleepSec);
  }

  if (sleepSec == 0) sleepSec = 1;
  if (secondsToNextMeasurement >= sleepSec) {
    secondsToNextMeasurement -= sleepSec;
  } else {
    secondsToNextMeasurement = 0;
  }

  Serial.print("QUEUE DB: ");
  Serial.println(queue.count());
  Serial.print("KOVETKEZO MERESIG MP: ");
  Serial.println(secondsToNextMeasurement);

  sleepFor(sleepSec);
}

void loop() {}
