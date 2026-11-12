#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <esp_system.h>
#include "GoogleTrustRoots.h"

namespace noveny {

static const uint32_t QUEUE_MAGIC = 0x4E565132UL; // NVQ2
static const uint8_t QUEUE_CAPACITY = 64;         // 8 nap 3 órás mintákkal
static const uint8_t FLAG_BATTERY = 0x01;
static const uint8_t FLAG_AIR = 0x02;
static const uint8_t FLAG_AIR_STABLE = 0x04;
static const uint8_t FLAG_AIR_WARMUP = 0x08;
static const uint8_t FLAG_AIR_BAD = 0x10;

struct MeasurementRecord {
  uint32_t magic;
  uint32_t sequence;
  uint64_t measuredAtMs;
  int16_t soil;
  int16_t battery;
  uint8_t flags;
  uint8_t aqi;
  uint16_t tvoc;
  uint16_t eco2;
};

inline String jsonEscape(const String &value) {
  String out;
  out.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); i++) {
    char c = value[i];
    switch (c) {
      case '\\': out += "\\\\"; break;
      case '"': out += "\\\""; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if ((uint8_t)c < 0x20) {
          char buf[7];
          snprintf(buf, sizeof(buf), "\\u%04x", (unsigned int)(uint8_t)c);
          out += buf;
        } else {
          out += c;
        }
    }
  }
  return out;
}

inline String urlEncode(const String &value) {
  const char *hex = "0123456789ABCDEF";
  String out;
  out.reserve(value.length() * 2);
  for (size_t i = 0; i < value.length(); i++) {
    uint8_t c = (uint8_t)value[i];
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') {
      out += (char)c;
    } else {
      out += '%';
      out += hex[(c >> 4) & 0x0F];
      out += hex[c & 0x0F];
    }
  }
  return out;
}

inline String extractJsonString(const String &json, const String &key) {
  String marker = "\"" + key + "\"";
  int p = json.indexOf(marker);
  if (p < 0) return "";
  p = json.indexOf(':', p + marker.length());
  if (p < 0) return "";
  p++;
  while (p < (int)json.length() && isspace((unsigned char)json[p])) p++;
  if (p >= (int)json.length() || json[p] != '"') return "";
  p++;

  String out;
  out.reserve(256);
  bool esc = false;
  for (; p < (int)json.length(); p++) {
    char c = json[p];
    if (esc) {
      switch (c) {
        case '"': out += '"'; break;
        case '\\': out += '\\'; break;
        case '/': out += '/'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        default: out += c; break;
      }
      esc = false;
    } else if (c == '\\') {
      esc = true;
    } else if (c == '"') {
      return out;
    } else {
      out += c;
    }
  }
  return "";
}

inline uint32_t extractJsonUInt(const String &json, const String &key, uint32_t fallback) {
  String marker = "\"" + key + "\"";
  int p = json.indexOf(marker);
  if (p < 0) return fallback;
  p = json.indexOf(':', p + marker.length());
  if (p < 0) return fallback;
  p++;
  while (p < (int)json.length() && (isspace((unsigned char)json[p]) || json[p] == '"')) p++;
  uint64_t result = 0;
  bool found = false;
  while (p < (int)json.length() && isdigit((unsigned char)json[p])) {
    found = true;
    result = result * 10ULL + (uint8_t)(json[p] - '0');
    if (result > 0xFFFFFFFFULL) return 0xFFFFFFFFUL;
    p++;
  }
  return found ? (uint32_t)result : fallback;
}

inline bool elapsedMs(uint32_t now, uint32_t since, uint32_t interval) {
  return (uint32_t)(now - since) >= interval;
}

inline uint64_t epochMsNow() {
  time_t now = time(nullptr);
  if (now < 1700000000) return 0;
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return (uint64_t)tv.tv_sec * 1000ULL + (uint64_t)(tv.tv_usec / 1000);
}

inline bool syncClock(uint32_t timeoutMs = 6000UL) {
  if (epochMsNow() != 0) return true;
  configTime(0, 0, "time.google.com", "pool.ntp.org", "time.cloudflare.com");
  uint32_t start = millis();
  while (!elapsedMs(millis(), start, timeoutMs)) {
    if (epochMsNow() != 0) {
      Serial.println("IDO SZINKRON OK");
      return true;
    }
    delay(200);
    yield();
  }
  Serial.println("IDO SZINKRON NINCS - HTTPS KAPCSOLAT KESOBB UJRAPROBALVA");
  return false;
}

class MeasurementQueue {
 public:
  MeasurementQueue() : started_(false), head_(0), count_(0), sequence_(0), dropped_(0) {}

  bool begin(const char *nameSpace) {
    if (started_) return true;
    if (!prefs_.begin(nameSpace, false)) return false;
    started_ = true;
    head_ = prefs_.getUChar("head", 0);
    count_ = prefs_.getUChar("count", 0);
    sequence_ = prefs_.getUInt("seq", 0);
    dropped_ = prefs_.getUInt("drop", 0);
    if (head_ >= QUEUE_CAPACITY || count_ > QUEUE_CAPACITY) {
      clear();
    }
    return true;
  }

  uint8_t count() const { return count_; }
  uint32_t dropped() const { return dropped_; }
  bool empty() const { return count_ == 0; }

  uint32_t nextSequence() {
    sequence_++;
    prefs_.putUInt("seq", sequence_);
    return sequence_;
  }

  bool push(MeasurementRecord rec) {
    if (!started_) return false;
    rec.magic = QUEUE_MAGIC;
    if (rec.sequence == 0) rec.sequence = nextSequence();

    uint8_t tail;
    if (count_ < QUEUE_CAPACITY) {
      tail = (uint8_t)((head_ + count_) % QUEUE_CAPACITY);
      count_++;
    } else {
      tail = head_;
      head_ = (uint8_t)((head_ + 1) % QUEUE_CAPACITY);
      dropped_++;
      prefs_.putUInt("drop", dropped_);
    }

    if (!writeSlot(tail, rec)) return false;
    persistHeader();
    return true;
  }

  bool peek(MeasurementRecord &rec) {
    if (!started_ || count_ == 0) return false;
    if (!readSlot(head_, rec) || rec.magic != QUEUE_MAGIC) {
      Serial.println("QUEUE HIBAS REKORD -> eldobva");
      pop();
      return false;
    }
    return true;
  }

  bool replaceHead(const MeasurementRecord &rec) {
    if (!started_ || count_ == 0) return false;
    return writeSlot(head_, rec);
  }

  bool pop() {
    if (!started_ || count_ == 0) return false;
    removeSlot(head_);
    head_ = (uint8_t)((head_ + 1) % QUEUE_CAPACITY);
    count_--;
    persistHeader();
    return true;
  }

  void clear() {
    if (!started_) return;
    for (uint8_t i = 0; i < QUEUE_CAPACITY; i++) removeSlot(i);
    head_ = 0;
    count_ = 0;
    persistHeader();
  }

 private:
  Preferences prefs_;
  bool started_;
  uint8_t head_;
  uint8_t count_;
  uint32_t sequence_;
  uint32_t dropped_;

  void keyFor(uint8_t index, char *out, size_t len) const {
    snprintf(out, len, "q%02u", (unsigned int)index);
  }

  bool writeSlot(uint8_t index, const MeasurementRecord &rec) {
    char key[6];
    keyFor(index, key, sizeof(key));
    return prefs_.putBytes(key, &rec, sizeof(rec)) == sizeof(rec);
  }

  bool readSlot(uint8_t index, MeasurementRecord &rec) {
    char key[6];
    keyFor(index, key, sizeof(key));
    if (prefs_.getBytesLength(key) != sizeof(rec)) return false;
    return prefs_.getBytes(key, &rec, sizeof(rec)) == sizeof(rec);
  }

  void removeSlot(uint8_t index) {
    char key[6];
    keyFor(index, key, sizeof(key));
    prefs_.remove(key);
  }

  void persistHeader() {
    prefs_.putUChar("head", head_);
    prefs_.putUChar("count", count_);
  }
};

class WiFiService {
 public:
  WiFiService(const char *apName, uint16_t apTimeoutSec = 120)
      : apName_(apName), apTimeoutSec_(apTimeoutSec), started_(false) {}

  void begin() {
    if (started_) return;
    prefs_.begin("noveny_wifi", false);
    started_ = true;
    WiFi.persistent(false);
    WiFi.setAutoReconnect(false);
  }

  bool hasSaved() {
    begin();
    return prefs_.getString("ssid", "").length() > 0;
  }

  void save(const String &ssid, const String &pass) {
    begin();
    if (ssid.length() == 0) return;
    prefs_.putString("ssid", ssid);
    prefs_.putString("pass", pass);
    Serial.print("WIFI MENTVE: ");
    Serial.println(ssid);
  }

  void off() {
    WiFi.disconnect(false, false);
    delay(50);
    WiFi.mode(WIFI_OFF);
    delay(80);
  }

  bool connect(uint32_t timeoutMs = 30000UL) {
    begin();
    if (WiFi.status() == WL_CONNECTED) return true;

    String ssid = prefs_.getString("ssid", "");
    String pass = prefs_.getString("pass", "");
    if (ssid.length() > 0 && connectCredentials(ssid, pass, timeoutMs)) return true;

    Serial.println("WIFI NVS FALLBACK");
    prepareStation();
    WiFi.begin();
    if (waitConnected(timeoutMs / 2)) {
      save(WiFi.SSID(), WiFi.psk());
      return true;
    }

    Serial.println("WIFI NEM ELERHETO");
    off();
    return false;
  }

  bool openPortal() {
    begin();
    Serial.print("AP MOD 2 PERC: ");
    Serial.println(apName_);

    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);
    delay(150);

    WiFiManager wm;
    wm.setConfigPortalTimeout(apTimeoutSec_);
    wm.setConnectTimeout(25);
    wm.setBreakAfterConfig(true);
    bool ok = wm.startConfigPortal(apName_);

    if (ok && WiFi.status() == WL_CONNECTED) {
      String ssid = wm.getWiFiSSID();
      String pass = wm.getWiFiPass();
      if (ssid.length() == 0) ssid = WiFi.SSID();
      if (pass.length() == 0) pass = WiFi.psk();
      save(ssid, pass);
      Serial.print("AP UTAN WIFI OK: ");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println("AP LEJART / NEM TORTENT BEALLITAS");
    }

    WiFi.persistent(false);
    WiFi.setAutoReconnect(false);
    if (WiFi.status() == WL_CONNECTED) return true;
    return connect();
  }

  bool reconnectHard(uint32_t timeoutMs = 30000UL) {
    off();
    delay(200);
    return connect(timeoutMs);
  }

  bool waitInternetReady(const char *host, uint32_t timeoutMs = 15000UL) {
    if (WiFi.status() != WL_CONNECTED) return false;

    // DHCP után az IP már megvan, de a DNS útvonal néha még nem használható.
    // Deep-sleep ébredés után ezért külön megvárjuk a névfeloldást.
    uint32_t start = millis();
    uint8_t attempt = 0;
    while (!elapsedMs(millis(), start, timeoutMs)) {
      attempt++;
      IPAddress resolved;
      int ok = WiFi.hostByName(host, resolved);
      if (ok == 1 && (resolved[0] || resolved[1] || resolved[2] || resolved[3])) {
        Serial.print("DNS OK ");
        Serial.print(host);
        Serial.print(" -> ");
        Serial.println(resolved);
        delay(700);
        return true;
      }

      Serial.print("DNS VARAKOZAS attempt=");
      Serial.println(attempt);
      delay(attempt < 3 ? 700 : 1400);
      yield();
    }

    Serial.print("DNS FAIL: ");
    Serial.println(host);
    return false;
  }

 private:
  const char *apName_;
  uint16_t apTimeoutSec_;
  Preferences prefs_;
  bool started_;

  void prepareStation() {
    WiFi.disconnect(false, false);
    delay(100);
    WiFi.mode(WIFI_OFF);
    delay(120);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.setAutoReconnect(false);
    WiFi.persistent(false);
    delay(120);
  }

  bool connectCredentials(const String &ssid, const String &pass, uint32_t timeoutMs) {
    Serial.print("WIFI CSATLAKOZAS: ");
    Serial.println(ssid);
    prepareStation();
    if (pass.length() > 0) WiFi.begin(ssid.c_str(), pass.c_str());
    else WiFi.begin(ssid.c_str());
    return waitConnected(timeoutMs);
  }

  bool waitConnected(uint32_t timeoutMs) {
    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && !elapsedMs(millis(), start, timeoutMs)) {
      delay(200);
      yield();
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("WIFI OK: ");
      Serial.println(WiFi.localIP());
      return true;
    }
    return false;
  }
};

class FirebaseRest {
 public:
  FirebaseRest(WiFiService &wifi, const char *apiKey, const char *dbUrl,
               const char *email, const char *password)
      : wifi_(wifi), apiKey_(apiKey), dbUrl_(dbUrl), email_(email), password_(password),
        tokenBornMs_(0), expiresSec_(0) {
    idToken_.reserve(2048);
    refreshToken_.reserve(512);
  }

  void invalidate() {
    idToken_ = "";
    tokenBornMs_ = 0;
    expiresSec_ = 0;
  }

  bool ensureAuth(bool force = false) {
    if (!*apiKey_ || !*email_ || !*password_) return false;
    if (WiFi.status() != WL_CONNECTED && !wifi_.connect()) return false;

    if (!force && idToken_.length() > 100 && expiresSec_ > 0) {
      uint32_t safeLifetimeMs = (expiresSec_ > 300 ? (expiresSec_ - 300) : expiresSec_) * 1000UL;
      if (!elapsedMs(millis(), tokenBornMs_, safeLifetimeMs)) return true;
    }

    if (!force && refreshToken_.length() > 20 && refreshAuth()) return true;
    return signIn();
  }

  bool patch(const String &path, const String &payload, uint8_t attempts = 3) {
    return request("PATCH", path, payload, nullptr, attempts, true);
  }

  bool get(const String &path, String &response, uint8_t attempts = 2) {
    return request("GET", path, "", &response, attempts, false);
  }

  String resolveDevicePath(const char *deviceId) {
    if (!devicePath_.isEmpty()) return devicePath_;
    String response;
    if (!get(String("/v2/registry/") + deviceId + "/ownerUid", response, 1)) return "";
    response.trim();
    if (response == "null") {
      Serial.println("VIRAGTARTO PAROSITASRA VAR");
      return "";
    }
    if (response.length() < 3 || response.length() > 130 ||
        !response.startsWith("\"") || !response.endsWith("\"")) return "";
    String uid = response.substring(1, response.length() - 1);
    for (size_t i = 0; i < uid.length(); i++) {
      char c = uid[i];
      if (!isalnum(static_cast<unsigned char>(c)) && c != '_' && c != '-') return "";
    }
    devicePath_ = String("/v2/users/") + uid + "/devices/" + deviceId;
    return devicePath_;
  }

  String ledStreamUrl(const char *deviceId) {
    String path = resolveDevicePath(deviceId);
    if (path.isEmpty() || !ensureAuth()) return "";
    return authenticatedUrl(path + "/ledLevel");
  }

 private:
  WiFiService &wifi_;
  const char *apiKey_;
  const char *dbUrl_;
  const char *email_;
  const char *password_;
  String devicePath_;
  String idToken_;
  String refreshToken_;
  uint32_t tokenBornMs_;
  uint32_t expiresSec_;

  bool signIn() {
    if (WiFi.status() != WL_CONNECTED && !wifi_.connect()) return false;
    String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + apiKey_;
    String payload = String("{\"email\":\"") + jsonEscape(email_) +
                     "\",\"password\":\"" + jsonEscape(password_) +
                     "\",\"returnSecureToken\":true}";
    String body;
    int code = rawHttp("POST", url, payload, "application/json", body, 20000UL);
    if (code != 200) {
      Serial.print("FIREBASE LOGIN FAIL HTTP=");
      Serial.println(code);
      invalidate();
      return false;
    }

    idToken_ = extractJsonString(body, "idToken");
    refreshToken_ = extractJsonString(body, "refreshToken");
    expiresSec_ = extractJsonUInt(body, "expiresIn", 3600);
    tokenBornMs_ = millis();
    bool ok = idToken_.length() > 100;
    Serial.println(ok ? "FIREBASE AUTH OK" : "FIREBASE AUTH VALASZ HIBAS");
    return ok;
  }

  bool refreshAuth() {
    String url = String("https://securetoken.googleapis.com/v1/token?key=") + apiKey_;
    String payload = String("grant_type=refresh_token&refresh_token=") + urlEncode(refreshToken_);
    String body;
    int code = rawHttp("POST", url, payload, "application/x-www-form-urlencoded", body, 20000UL);
    if (code != 200) {
      Serial.print("TOKEN REFRESH FAIL HTTP=");
      Serial.println(code);
      invalidate();
      return false;
    }

    String newId = extractJsonString(body, "id_token");
    String newRefresh = extractJsonString(body, "refresh_token");
    if (newId.length() < 100) {
      invalidate();
      return false;
    }
    idToken_ = newId;
    if (newRefresh.length() > 20) refreshToken_ = newRefresh;
    expiresSec_ = extractJsonUInt(body, "expires_in", 3600);
    tokenBornMs_ = millis();
    Serial.println("TOKEN REFRESH OK");
    return true;
  }

  bool request(const char *method, const String &path, const String &payload,
               String *response, uint8_t attempts, bool silentWrite) {
    for (uint8_t attempt = 1; attempt <= attempts; attempt++) {
      if (WiFi.status() != WL_CONNECTED && !wifi_.connect()) {
        backoff(attempt);
        continue;
      }
      if (!ensureAuth()) {
        backoff(attempt);
        continue;
      }

      String url = authenticatedUrl(path);
      if (silentWrite && strcmp(method, "GET") != 0) url += "&print=silent";

      String body;
      int code = rawHttp(method, url, payload, "application/json", body, 18000UL);
      if (code == 200 || code == 204) {
        if (response) *response = body;
        return true;
      }

      Serial.print("FIREBASE REST FAIL ");
      Serial.print(method);
      Serial.print(" HTTP=");
      Serial.print(code);
      Serial.print(" attempt=");
      Serial.println(attempt);

      if (code == -1001 || code == 403) return false;
      if (code == 401) {
        invalidate();
      } else if (code < 0 || code == 408 || code == 429 || code >= 500) {
        wifi_.reconnectHard();
      } else {
        return false;
      }
      backoff(attempt);
    }
    return false;
  }

  String authenticatedUrl(const String &path) const {
    String url(dbUrl_);
    if (url.endsWith("/")) url.remove(url.length() - 1);
    if (!path.startsWith("/")) url += '/';
    return url + path + ".json?auth=" + urlEncode(idToken_);
  }

  int rawHttp(const char *method, const String &url, const String &payload,
              const char *contentType, String &body, uint32_t timeoutMs) {
    if (!syncClock(12000UL)) return -1001;
    WiFiClientSecure client;
    client.setCACert(GOOGLE_TRUST_ROOTS);
    HTTPClient http;
    http.setReuse(false);
    http.setConnectTimeout(12000);
    http.setTimeout(timeoutMs);
    if (!http.begin(client, url)) return -1000;
    if (contentType && strlen(contentType)) http.addHeader("Content-Type", contentType);
    http.addHeader("Connection", "close");

    int code;
    if (strcmp(method, "GET") == 0) {
      code = http.GET();
    } else {
      code = http.sendRequest(method, (uint8_t *)payload.c_str(), payload.length());
    }
    if (code > 0 && code != 204) body = http.getString();
    http.end();
    return code;
  }

  void backoff(uint8_t attempt) {
    uint32_t waitMs = attempt == 1 ? 800UL : (attempt == 2 ? 2500UL : 7000UL);
    uint32_t start = millis();
    while (!elapsedMs(millis(), start, waitMs)) {
      delay(50);
      yield();
    }
  }
};


inline String uint64String(uint64_t value) {
  char buf[24];
  snprintf(buf, sizeof(buf), "%llu", (unsigned long long)value);
  return String(buf);
}

inline String airStatusFor(uint8_t aqi, uint16_t tvoc, uint16_t eco2) {
  if (aqi >= 5 || eco2 >= 2000 || tvoc >= 1000) return "nagyon_rossz";
  if (aqi >= 4 || eco2 >= 1500 || tvoc >= 660) return "rossz";
  if (aqi >= 3 || eco2 >= 1000 || tvoc >= 220) return "kozepes";
  if (aqi >= 2 || eco2 >= 800 || tvoc >= 65) return "jo";
  return "kivalo";
}

inline bool airBadFor(uint8_t aqi, uint16_t tvoc, uint16_t eco2) {
  return aqi >= 4 || eco2 >= 1500 || tvoc >= 660;
}

inline String buildRecordPayload(const MeasurementRecord &rec, const String &firmware,
                                 int wifiRssi, uint32_t dropped, const String &airDeviceStatus) {
  String timestamp = uint64String(rec.measuredAtMs);
  String json;
  json.reserve(750);
  json = "{\"reading\":{\"sensorValue\":" + String(rec.soil);
  if (rec.flags & FLAG_BATTERY) json += ",\"batteryPercent\":" + String(rec.battery);
  json += ",\"firmwareVersion\":\"" + jsonEscape(firmware) + "\"";
  json += ",\"wifiRSSI\":" + String(constrain(wifiRssi, -150, 0));
  json += ",\"measurementSequence\":" + String(rec.sequence);
  json += ",\"queueDropped\":" + String(dropped);
  json += ",\"lastMeasurementAt\":" + timestamp;
  json += ",\"lastSeen\":{\".sv\":\"timestamp\"}}";
  json += ",\"history/s" + String(rec.sequence % 10) + "\":{\"t\":" + timestamp +
          ",\"v\":" + String(rec.soil) + "}";

  if (rec.flags & FLAG_AIR) {
    json += ",\"airQuality\":{\"aqi\":" + String(rec.aqi);
    json += ",\"tvoc\":" + String(rec.tvoc);
    json += ",\"eco2\":" + String(rec.eco2);
    json += ",\"status\":\"" + airStatusFor(rec.aqi, rec.tvoc, rec.eco2) + "\"";
    json += ",\"bad\":" + String(airBadFor(rec.aqi, rec.tvoc, rec.eco2) ? "true" : "false");
    json += ",\"valid\":true";
    json += ",\"stable\":" + String((rec.flags & FLAG_AIR_STABLE) ? "true" : "false");
    json += ",\"warmupAccepted\":" + String((rec.flags & FLAG_AIR_WARMUP) ? "true" : "false");
    String status = airDeviceStatus;
    if (rec.flags & FLAG_AIR_STABLE) status = "standard_ok";
    else if (rec.flags & FLAG_AIR_WARMUP) status = "sensor_bemelegites";
    json += ",\"deviceStatus\":\"" + jsonEscape(status) + "\"";
    json += ",\"lastAirMeasurementAt\":" + timestamp + "}";
  }

  return json + "}";
}

inline bool flushQueue(MeasurementQueue &queue, FirebaseRest &firebase,
                       const char *deviceId, const String &firmware,
                       uint32_t measurementIntervalMs, uint8_t maxRecords = 64,
                       const String &airDeviceStatus = "standard_ok") {
  if (queue.empty()) return true;
  if (!syncClock(12000UL)) return false;
  String devicePath = firebase.resolveDevicePath(deviceId);
  if (devicePath.isEmpty()) return false;

  uint8_t sent = 0;
  while (!queue.empty() && sent < maxRecords) {
    MeasurementRecord rec{};
    if (!queue.peek(rec)) continue;

    if (rec.measuredAtMs == 0) {
      uint64_t now = epochMsNow();
      uint64_t age = (uint64_t)(queue.count() - 1) * (uint64_t)measurementIntervalMs;
      rec.measuredAtMs = now - age;
      queue.replaceHead(rec);
    }

    String payload = buildRecordPayload(rec, firmware, WiFi.RSSI(), queue.dropped(), airDeviceStatus);
    if (!firebase.patch(devicePath, payload, 2)) {
      Serial.println("FELTOLTES MEGSZAKADT - ADAT HELYBEN MEGMARADT");
      return false;
    }

    Serial.print("QUEUE FELTOLTVE seq=");
    Serial.println(rec.sequence);
    queue.pop();
    sent++;
  }
  return queue.empty();
}

} // namespace noveny
