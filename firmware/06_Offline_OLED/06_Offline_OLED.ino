#include <Arduino.h>
#include <WiFi.h>
#include "esp_bt.h"
#include <Wire.h>
#include <Preferences.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "esp_sleep.h"

/* Offline OLED változat – a jól működő v9 alap lényegében változatlanul hagyva. */

/* ================= PINOK ================= */
#define SDA_PIN     19
#define SCL_PIN     22
#define TOUCH_PIN   27
#define SOIL_PIN    34
#define BATTERY_PIN 35

/* ================= OLED ================= */
#define SCREEN_WIDTH   128
#define SCREEN_HEIGHT   32
#define OLED_ADDR      0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

/* ================= PREFERENCES ================= */
Preferences prefs;

/* ================= TALAJ KALIBRÁCIÓ ================= */
const int dryValue = 2910;
const int wetValue = 1465;

/* ================= AKKU ================= */
#define ADC_MAX       4095.0
#define ADC_REF       3.3
#define R_UPPER       220000.0
#define R_LOWER       100000.0
#define BAT_MIN       3.2
#define BAT_MAX       4.2
#define BAT_CALIB     1.12
#define BAT_OFFSET_V  0.20

/* ================= KATEGÓRIÁK ================= */
struct PlantCategory {
  const char* name;
  int min;
  int max;
};

PlantCategory categories[] = {
  { "Szarazkedvelo",      10, 40 },
  { "Mersekelten szaraz", 20, 45 },
  { "Kiegyensulyozott",   30, 60 },
  { "Nedvessegkedvelo",   50, 80 },
  { "Vizigenyes",         70, 100 }
};

const int CATEGORY_COUNT = sizeof(categories) / sizeof(categories[0]);
int category = 0;

/* ================= IDŐZÍTÉS ================= */
#define SCREEN_TIMEOUT_MS    12000UL
#define SOIL_REFRESH_MS       4000UL
#define BATT_REFRESH_MS      30000UL
#define TOUCH_WINDOW_MS       1200UL

/* ================= SEGÉD ================= */
bool initOLED() {
  return display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
}

int readSoilRaw() {
  long sum = 0;

  for (int i = 0; i < 6; i++) {
    sum += analogRead(SOIL_PIN);
    delay(2);
  }

  int raw = sum / 6;
  int percent = constrain(map(raw, dryValue, wetValue, 0, 100), 0, 100);

  Serial.print("SOIL RAW: ");
  Serial.println(raw);
  Serial.print("SOIL %: ");
  Serial.println(percent);

  return percent;
}

int mapSoilToCategoryPercent(int soil, int minVal, int maxVal) {
  if (soil <= minVal) return 0;
  if (soil >= maxVal) return 100;
  return constrain(map(soil, minVal, maxVal, 0, 100), 0, 100);
}

int readBatteryPercent() {
  long sum = 0;

  for (int i = 0; i < 8; i++) {
    sum += analogRead(BATTERY_PIN);
    delay(2);
  }

  float adc = sum / 8.0;
  float v = (adc / ADC_MAX) * ADC_REF * ((R_UPPER + R_LOWER) / R_LOWER);
  v *= BAT_CALIB;
  v += BAT_OFFSET_V;
  v = constrain(v, BAT_MIN, BAT_MAX);

  int percent = round((v - BAT_MIN) * 100.0 / (BAT_MAX - BAT_MIN));
  percent = constrain(percent, 0, 100);

  Serial.print("BATTERY V: ");
  Serial.println(v, 3);
  Serial.print("BATTERY %: ");
  Serial.println(percent);

  return percent;
}

void drawCenteredText(const char* text, int y, int size) {
  int16_t x1, y1;
  uint16_t w, h;

  display.setTextSize(size);
  display.getTextBounds(text, 0, y, &x1, &y1, &w, &h);

  int x = (SCREEN_WIDTH - w) / 2;
  if (x < 0) x = 0;

  display.setCursor(x, y);
  display.print(text);
}

void drawTopNameFitted(const char* text) {
  display.setTextSize(1);

  String s = text;
  if (s.length() > 20) {
    s = s.substring(0, 20);
  }

  display.setCursor(0, 0);
  display.print(s);
}

void showWakeAnimation() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  drawCenteredText("Novenyfigyelo", 0, 1);

  for (int i = 0; i <= 100; i += 25) {
    display.fillRect(0, 12, 128, 20, SSD1306_BLACK);
    display.drawRoundRect(12, 15, 104, 10, 3, SSD1306_WHITE);

    int barW = map(i, 0, 100, 0, 100);
    display.fillRoundRect(14, 17, barW, 6, 2, SSD1306_WHITE);

    char percentText[8];
    snprintf(percentText, sizeof(percentText), "%d%%", i);
    drawCenteredText(percentText, 25, 1);

    display.display();
    delay(25);
  }

  delay(60);
}

void showIntroCards(int soil, int batt) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  drawCenteredText("Kategoria", 2, 1);
  drawCenteredText(categories[category].name, 16, 1);
  display.display();
  delay(300);

  display.clearDisplay();
  drawCenteredText("Akksi", 2, 1);

  char battText[8];
  snprintf(battText, sizeof(battText), "%d%%", batt);
  drawCenteredText(battText, 16, 2);
  display.display();
  delay(300);

  display.clearDisplay();
  drawCenteredText("Talaj", 2, 1);

  char soilText[8];
  snprintf(soilText, sizeof(soilText), "%d%%", soil);
  drawCenteredText(soilText, 14, 2);
  display.display();
  delay(400);
}

void drawMainScreen(int soil, int batt) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  drawTopNameFitted(categories[category].name);

  display.setTextSize(1);
  display.setCursor(0, 11);
  display.print("Akksi:");
  display.print(batt);
  display.print("%");

  display.setCursor(0, 22);
  display.print("Talaj:");

  display.setTextSize(2);
  char soilText[8];
  snprintf(soilText, sizeof(soilText), "%d%%", soil);
  display.setCursor(74, 16);
  display.print(soilText);

  display.display();
}

void showCategoryChanged() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  drawCenteredText("Kategoria", 4, 1);
  drawCenteredText("valtva", 14, 1);
  drawCenteredText(categories[category].name, 24, 1);

  display.display();
  delay(400);
}

void goToDeepSleep() {
  display.clearDisplay();
  display.display();
  delay(20);

  display.ssd1306_command(SSD1306_DISPLAYOFF);
  delay(20);

  WiFi.mode(WIFI_OFF);
  btStop();

  esp_sleep_enable_ext0_wakeup(GPIO_NUM_27, 1);
  esp_deep_sleep_start();
}

/* ================= SETUP ================= */
void setup() {
  Serial.begin(115200);
  delay(200);

  setCpuFrequencyMhz(40);

  WiFi.mode(WIFI_OFF);
  btStop();

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);

  pinMode(TOUCH_PIN, INPUT_PULLDOWN);
  pinMode(SOIL_PIN, INPUT);
  pinMode(BATTERY_PIN, INPUT);

  Wire.begin(SDA_PIN, SCL_PIN);

  if (!initOLED()) {
    while (true) {
      delay(1000);
    }
  }

  prefs.begin("plant", false);
  category = prefs.getInt("cat", 0);

  if (category < 0 || category >= CATEGORY_COUNT) {
    category = 0;
    prefs.putInt("cat", category);
  }

  showWakeAnimation();
}

/* ================= LOOP ================= */
void loop() {
  unsigned long screenStart = millis();
  unsigned long lastSoilRead = millis();
  unsigned long lastBattRead = millis();
  unsigned long firstTapTime = 0;

  int tapCount = 0;
  bool lastTouch = false;

  int realSoil = readSoilRaw();
  int batt = readBatteryPercent();
  int displaySoil = mapSoilToCategoryPercent(realSoil, categories[category].min, categories[category].max);

  int lastShownSoil = -1;
  int lastShownBatt = -1;

  showIntroCards(displaySoil, batt);
  drawMainScreen(displaySoil, batt);

  lastShownSoil = displaySoil;
  lastShownBatt = batt;

  while (millis() - screenStart < SCREEN_TIMEOUT_MS) {
    unsigned long now = millis();

    if (now - lastSoilRead >= SOIL_REFRESH_MS) {
      realSoil = readSoilRaw();
      displaySoil = mapSoilToCategoryPercent(realSoil, categories[category].min, categories[category].max);
      lastSoilRead = now;

      if (displaySoil != lastShownSoil) {
        drawMainScreen(displaySoil, batt);
        lastShownSoil = displaySoil;
      }
    }

    if (now - lastBattRead >= BATT_REFRESH_MS) {
      batt = readBatteryPercent();
      lastBattRead = now;

      if (batt != lastShownBatt) {
        drawMainScreen(displaySoil, batt);
        lastShownBatt = batt;
      }
    }

    bool touchNow = digitalRead(TOUCH_PIN);

    if (touchNow && !lastTouch) {
      if (tapCount == 0) firstTapTime = now;
      tapCount++;
      screenStart = now;
      delay(30);
    }

    lastTouch = touchNow;

    if (tapCount > 0 && now - firstTapTime > TOUCH_WINDOW_MS) {
      tapCount = 0;
    }

    if (tapCount >= 3) {
      tapCount = 0;
      category = (category + 1) % CATEGORY_COUNT;
      prefs.putInt("cat", category);

      displaySoil = mapSoilToCategoryPercent(realSoil, categories[category].min, categories[category].max);
      showCategoryChanged();
      drawMainScreen(displaySoil, batt);

      lastShownSoil = displaySoil;
      lastShownBatt = batt;
      screenStart = millis();
      delay(120);
    }

    delay(35);
  }

  goToDeepSleep();
}
