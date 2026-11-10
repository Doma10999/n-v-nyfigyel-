#pragma once

#include <atomic>
#include <new>
#include "NovenyCore.h"

namespace noveny {

// HTTPClient decodes HTTP chunks; this sink assembles the Firebase SSE lines.
class LedEventSink : public Stream {
 public:
  explicit LedEventSink(std::atomic<int> &level) : level_(level) {}
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}

  size_t write(uint8_t byte) override {
    if (closed_) return 0;
    if (byte == '\r') return 1;
    if (byte == '\n') {
      if (!overflow_) {
        line_[length_] = '\0';
        readLine();
      }
      length_ = 0;
      overflow_ = false;
    } else if (length_ < sizeof(line_) - 1) {
      line_[length_++] = static_cast<char>(byte);
    } else {
      overflow_ = true;
    }
    return 1;
  }

  size_t write(const uint8_t *bytes, size_t count) override {
    size_t read = 0;
    while (read < count && write(bytes[read])) ++read;
    return read;
  }

 private:
  std::atomic<int> &level_;
  char line_[192]{};
  size_t length_ = 0;
  bool overflow_ = false;
  bool putEvent_ = false;
  bool closed_ = false;

  void readLine() {
    if (strncmp(line_, "event: ", 7) == 0) {
      const char *event = line_ + 7;
      putEvent_ = strcmp(event, "put") == 0;
      closed_ = strcmp(event, "cancel") == 0 || strcmp(event, "auth_revoked") == 0;
      return;
    }
    if (!putEvent_ || strncmp(line_, "data: ", 6) != 0) return;
    String data(line_ + 6);
    if (extractJsonString(data, "path") != "/") return;
    int marker = data.indexOf("\"data\":");
    if (marker < 0) return;
    const char *start = data.c_str() + marker + 7;
    char *end = nullptr;
    long level = strtol(start, &end, 10);
    if (end != start && level >= 0 && level <= 100) level_.store(static_cast<int>(level));
  }
};

class LedEventStream {
 public:
  void begin() {
    requests_ = xQueueCreate(1, sizeof(String *));
    if (!requests_) return;
    if (xTaskCreate(run, "noveny-led", 12288, this, 1, nullptr) != pdPASS) {
      vQueueDelete(requests_);
      requests_ = nullptr;
    }
  }

  int takeLevel() { return pendingLevel_.exchange(-1); }

  void service(FirebaseRest &firebase, const char *deviceId, uint32_t now) {
    if (!requests_ || running_.load() || WiFi.status() != WL_CONNECTED) return;
    if (lastAttemptMs_ && !elapsedMs(now, lastAttemptMs_, 15000UL)) return;
    lastAttemptMs_ = now;
    String url = firebase.ledStreamUrl(deviceId);
    if (url.isEmpty()) return;
    String *request = new (std::nothrow) String(std::move(url));
    if (!request) return;
    running_.store(true);
    if (xQueueSend(requests_, &request, 0) != pdPASS) {
      delete request;
      running_.store(false);
    }
  }

 private:
  QueueHandle_t requests_ = nullptr;
  std::atomic<int> pendingLevel_{-1};
  std::atomic<bool> running_{false};
  uint32_t lastAttemptMs_ = 0;

  static void run(void *context) {
    auto &stream = *static_cast<LedEventStream *>(context);
    for (;;) {
      String *url = nullptr;
      if (xQueueReceive(stream.requests_, &url, portMAX_DELAY) != pdPASS) continue;
      stream.listen(*url);
      delete url;
      stream.running_.store(false);
    }
  }

  void listen(const String &url) {
    WiFiClientSecure client;
    client.setCACert(GOOGLE_TRUST_ROOTS);
    HTTPClient http;
    http.setConnectTimeout(10000);
    // HTTPClient takes a uint16_t timeout in milliseconds.
    http.setTimeout(60000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    if (!http.begin(client, url)) return;
    http.addHeader("Accept", "text/event-stream");
    if (http.GET() == HTTP_CODE_OK) {
      LedEventSink sink(pendingLevel_);
      http.writeToStream(&sink);
    }
    http.end();
  }
};

}  // namespace noveny
