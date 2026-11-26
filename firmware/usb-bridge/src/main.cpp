/*
 * ResQNet USB LoRa 桥
 * ------------------------------------------------------------
 * 电脑端（Electron/Chrome）通过 USB 串口发 JSON 行 → 本机转换为 LoRa 帧
 * LoRa 收到帧 → 以管理端协议 JSON 行输出到串口
 *
 * 电脑端 → 串口（每行一个 JSON）：
 *   {"type":"command","id":"out1","to":"u1","text":"救援车已出发"}
 * 串口 → 电脑端：
 *   {"type":"hello","gateway":"USB桥","nodeId":"usb1"}
 *   {"type":"position","nodeId":"u1","name":"队员-01","lat":30.66,"lon":104.06,"battery":0.8}
 *   {"type":"text","nodeId":"u1","name":"队员-01","text":"两人受困"}
 *   {"type":"sos","nodeId":"u1","name":"队员-01","lat":30.66,"lon":104.06,"note":"需要担架","level":3}
 *
 * 空中帧格式与管理端 LoRa 网关一致（紧凑 JSON，≤200 B）。
 */
#include <Arduino.h>
#include <RadioLib.h>
#include <ArduinoJson.h>
#include <vector>
#include <deque>
#include "config.h"

#define LORA_NSS 8
#define LORA_SCK 9
#define LORA_MOSI 10
#define LORA_MISO 11
#define LORA_RST 12
#define LORA_BUSY 13
#define LORA_DIO1 14
#define VEXT_PIN 36

SX1262 radio = new Module(LORA_NSS, LORA_DIO1, LORA_RST, LORA_BUSY);

static uint16_t seqCounter = 1;
static String serialBuffer;

struct PendingFrame {
  unsigned long due;
  String data;
};
static std::vector<PendingFrame> pending;
static std::deque<String> seenCache;

static bool seenContains(const String& key) {
  for (const auto& item : seenCache) {
    if (item == key) return true;
  }
  return false;
}

static void seenAdd(const String& key) {
  seenCache.push_back(key);
  while (seenCache.size() > SEEN_CACHE) seenCache.pop_front();
}

static bool loraInit() {
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_NSS);
  int state = radio.begin(LORA_FREQ, LORA_BW, LORA_SF, LORA_CR, RADIOLIB_SX126X_SYNC_WORD_PRIVATE,
                          LORA_POWER, LORA_PREAMBLE, LORA_TCXO, false);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.printf("# [LoRa] init failed: %d\n", state);
    return false;
  }
  radio.setDio2AsRfSwitch(true);
  radio.startReceive();
  Serial.printf("# [LoRa] ready %.3f MHz SF%d\n", LORA_FREQ, LORA_SF);
  return true;
}

static bool loraSend(const String& payload) {
  if (payload.length() > FRAME_MAX) {
    Serial.println("# frame too long");
    return false;
  }
  int state = radio.transmit((uint8_t*)payload.c_str(), payload.length());
  radio.startReceive();
  return state == RADIOLIB_ERR_NONE;
}

static void scheduleRebroadcast(const String& frame) {
  if (pending.size() > 24) pending.erase(pending.begin());
  pending.push_back({millis() + random(REBROADCAST_MIN_MS, REBROADCAST_MAX_MS), frame});
}

static void processPending() {
  for (int i = (int)pending.size() - 1; i >= 0; --i) {
    if (millis() >= pending[i].due) {
      loraSend(pending[i].data);
      pending.erase(pending.begin() + i);
    }
  }
}

static void emitConsole(const String& kind, JsonDocument& frame, int rssi) {
  JsonDocument out;
  String from = frame["f"] | "";
  String name = frame["n"] | from.c_str();
  if (kind == "p") {
    out["type"] = "position";
    out["nodeId"] = from;
    out["name"] = name;
    out["callsign"] = frame["c"] | "";
    out["role"] = frame["r"] | "phone";
    out["lat"] = frame["x"] | 0.0;
    out["lon"] = frame["y"] | 0.0;
    out["battery"] = (frame["b"] | 100) / 100.0;
    out["rssi"] = rssi;
    out["ts"] = frame["ts"] | (long)millis();
  } else if (kind == "t") {
    out["type"] = "text";
    out["nodeId"] = from;
    out["name"] = name;
    out["text"] = frame["m"] | "";
    out["rssi"] = rssi;
    out["ts"] = frame["ts"] | (long)millis();
  } else if (kind == "s") {
    out["type"] = "sos";
    out["nodeId"] = from;
    out["name"] = name;
    out["lat"] = frame["x"] | 0.0;
    out["lon"] = frame["y"] | 0.0;
    out["note"] = frame["m"] | "一键求救";
    out["level"] = 3;
    out["rssi"] = rssi;
    out["ts"] = frame["ts"] | (long)millis();
  } else {
    return;
  }
  String payload;
  serializeJson(out, payload);
  Serial.println(payload);
}

static void handleLoraFrame(const String& raw, int rssi) {
  JsonDocument frame;
  if (deserializeJson(frame, raw)) return;
  String from = frame["f"] | "";
  int seq = frame["q"] | -1;
  if (from.length() == 0 || seq < 0) return;

  String key = from + ":" + String(seq);
  if (seenContains(key)) return;
  seenAdd(key);

  int ttl = frame["ttl"] | 0;
  String to = frame["to"] | "*";
  String kind = frame["k"] | "";

  if (to == "*" || to == NODE_ID) {
    emitConsole(kind, frame, rssi);
  }
  if (ttl > 0) {
    frame["ttl"] = ttl - 1;
    String out;
    serializeJson(frame, out);
    scheduleRebroadcast(out);
  }
}

static void loraPoll() {
  if (!radio.available()) return;
  size_t len = radio.getPacketLength();
  if (len == 0 || len > FRAME_MAX + 8) {
    radio.startReceive();
    return;
  }
  uint8_t buffer[FRAME_MAX + 8];
  int state = radio.readData(buffer, len);
  int rssi = (int)radio.getRSSI();
  radio.startReceive();
  if (state != RADIOLIB_ERR_NONE) return;
  String frame;
  frame.reserve(len);
  for (size_t i = 0; i < len; ++i) frame += (char)buffer[i];
  handleLoraFrame(frame, rssi);
}

static void handleCommand(JsonDocument& cmd) {
  String to = cmd["to"] | "*";
  String text = cmd["text"] | "";
  JsonDocument frame;
  frame["v"] = 1;
  frame["k"] = "t";
  frame["f"] = NODE_ID;
  frame["to"] = to;
  frame["q"] = seqCounter++;
  frame["ttl"] = MESH_TTL;
  frame["n"] = NODE_NAME;
  frame["m"] = text;
  frame["ts"] = (long)millis();
  String out;
  serializeJson(frame, out);
  bool ok = loraSend(out);
  seenAdd(String(NODE_ID) + ":" + String((uint16_t)frame["q"]));

  JsonDocument ack;
  ack["type"] = "ack";
  ack["messageId"] = cmd["id"] | "";
  ack["ok"] = ok;
  String payload;
  serializeJson(ack, payload);
  Serial.println(payload);
}

static void readSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      String line = serialBuffer;
      serialBuffer = "";
      line.trim();
      if (line.length() == 0) continue;
      JsonDocument doc;
      if (deserializeJson(doc, line)) {
        Serial.println("# bad json");
        continue;
      }
      if (String(doc["type"] | "") == "command") handleCommand(doc);
    } else {
      serialBuffer += c;
      if (serialBuffer.length() > 512) serialBuffer = "";
    }
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(300);
  pinMode(VEXT_PIN, OUTPUT);
  digitalWrite(VEXT_PIN, LOW);
  loraInit();
  Serial.println("{\"type\":\"hello\",\"gateway\":\"" NODE_NAME "\",\"nodeId\":\"" NODE_ID "\"}");
}

void loop() {
  loraPoll();
  readSerial();
  processPending();
  delay(5);
}