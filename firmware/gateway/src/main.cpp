/*
 * ResQNet LoRa 网关
 * ------------------------------------------------------------
 * 角色：
 *   1) LoRa 收发（SX1262，433 MHz 微功率）
 *   2) WebSocket 服务端（管理端浏览器作为客户端连入）
 *   3) BLE NUS 服务端（手机现场端连入）
 *   4) 多跳转发（收到 TTL>0 的帧，随机退避后重播）
 *
 * 上行：LoRa 帧 -> 管理端 JSON（position/text/sos）
 * 下行：管理端 command -> LoRa 帧
 * BLE：手机写入 JSON -> LoRa 帧；LoRa 帧 -> BLE 通知
 *
 * 帧格式（LoRa 上）：紧凑 JSON，≤200 B
 * {"v":1,"k":"t|p|s","f":"节点ID","to":"*","q":序号,"ttl":4,
 *  "n":"名称","c":"呼号","r":"phone","x":纬度,"y":经度,"b":电量%,"m":"内容","ts":毫秒}
 */
#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsServer.h>
#include <NimBLEDevice.h>
#include <RadioLib.h>
#include <ArduinoJson.h>
#include <vector>
#include <deque>
#include "config.h"

// Heltec WiFi LoRa 32 V3 (ESP32-S3 + SX1262)
#define LORA_NSS 8
#define LORA_SCK 9
#define LORA_MOSI 10
#define LORA_MISO 11
#define LORA_RST 12
#define LORA_BUSY 13
#define LORA_DIO1 14
#define VEXT_PIN 36

// BLE NUS（Nordic UART Service）
#define NUS_SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX_UUID "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_TX_UUID "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

SX1262 radio = new Module(LORA_NSS, LORA_DIO1, LORA_RST, LORA_BUSY);
WebSocketsServer ws(WS_PORT);
NimBLECharacteristic* bleTx = nullptr;
volatile bool bleConnected = false;

static uint16_t seqCounter = 1;
static unsigned long lastHello = 0;

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

// ---------------- LoRa ----------------

static bool loraInit() {
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_NSS);
  int state = radio.begin(LORA_FREQ, LORA_BW, LORA_SF, LORA_CR, RADIOLIB_SX126X_SYNC_WORD_PRIVATE,
                          LORA_POWER, LORA_PREAMBLE, LORA_TCXO, false);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.printf("[LoRa] init failed: %d\n", state);
    return false;
  }
  radio.setDio2AsRfSwitch(true);
  radio.startReceive();
  Serial.printf("[LoRa] ready %.3f MHz SF%d BW%.0f\n", LORA_FREQ, LORA_SF, LORA_BW);
  return true;
}

static bool loraSend(const String& payload) {
  if (payload.length() > FRAME_MAX) {
    Serial.printf("[LoRa] frame too long: %u\n", (unsigned)payload.length());
    return false;
  }
  int state = radio.transmit((uint8_t*)payload.c_str(), payload.length());
  radio.startReceive();
  if (state != RADIOLIB_ERR_NONE) {
    Serial.printf("[LoRa] tx failed: %d\n", state);
    return false;
  }
  return true;
}

static void scheduleRebroadcast(const String& frame) {
  if (pending.size() > 32) pending.erase(pending.begin());
  unsigned long delayMs = random(REBROADCAST_MIN_MS, REBROADCAST_MAX_MS);
  pending.push_back({millis() + delayMs, frame});
}

static void processPending() {
  for (int i = (int)pending.size() - 1; i >= 0; --i) {
    if (millis() >= pending[i].due) {
      loraSend(pending[i].data);
      pending.erase(pending.begin() + i);
    }
  }
}

// ---------------- BLE ----------------

static void notifyBle(const String& frame) {
  if (!bleConnected || bleTx == nullptr) return;
  String line = frame;
  line += '\n';
  bleTx->setValue(std::string(line.c_str()));
  bleTx->notify();
}

class BleServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*) override {
    bleConnected = true;
    Serial.println("[BLE] connected");
  }
  void onDisconnect(NimBLEServer*) override {
    bleConnected = false;
    Serial.println("[BLE] disconnected");
    NimBLEDevice::startAdvertising();
  }
};

static void handleBleMessage(const String& raw);

class BleRxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr) override {
    std::string value = chr->getValue();
    handleBleMessage(String(value.c_str()));
  }
};

static void bleInit() {
  NimBLEDevice::init(BLE_DEVICE_NAME);
  NimBLEDevice::setMTU(247);
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new BleServerCallbacks());

  NimBLEService* service = server->createService(NUS_SERVICE_UUID);
  NimBLECharacteristic* rx = service->createCharacteristic(
      NUS_RX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rx->setCallbacks(new BleRxCallbacks());
  bleTx = service->createCharacteristic(NUS_TX_UUID, NIMBLE_PROPERTY::NOTIFY);
  service->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE_UUID);
  adv->setScanResponse(true);
  adv->start();
  Serial.printf("[BLE] advertising as %s\n", BLE_DEVICE_NAME);
}

// ---------------- 下行 / 上行 ----------------

static void sendDownlink(const String& to, const String& text, const String& messageId, uint8_t wsNum) {
  JsonDocument frame;
  frame["v"] = 1;
  frame["k"] = "t";
  frame["f"] = GW_NODE_ID;
  frame["to"] = to;
  frame["q"] = seqCounter++;
  frame["ttl"] = MESH_TTL;
  frame["n"] = GW_NAME;
  frame["m"] = text;
  frame["ts"] = (long)millis();

  String out;
  serializeJson(frame, out);
  bool ok = loraSend(out);
  seenAdd(String(GW_NODE_ID) + ":" + String((uint16_t)frame["q"]));

  JsonDocument ack;
  ack["type"] = "ack";
  ack["messageId"] = messageId;
  ack["ok"] = ok;
  String payload;
  serializeJson(ack, payload);
  if (wsNum < 255) ws.sendTXT(wsNum, payload);
  else ws.broadcastTXT(payload);
}

static void emitToConsole(const String& kind, JsonDocument& frame, int rssi) {
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
  ws.broadcastTXT(payload);
  Serial.printf("[WS] -> %s\n", payload.c_str());
}

static void handleLoraFrame(const String& raw, int rssi) {
  JsonDocument frame;
  DeserializationError err = deserializeJson(frame, raw);
  if (err) return;

  String from = frame["f"] | "";
  int seq = frame["q"] | -1;
  if (from.length() == 0 || seq < 0) return;

  String key = from + ":" + String(seq);
  if (seenContains(key)) return;
  seenAdd(key);

  int ttl = frame["ttl"] | 0;
  String to = frame["to"] | "*";
  String kind = frame["k"] | "";

  if (to == "*" || to == GW_NODE_ID) {
    emitToConsole(kind, frame, rssi);
    notifyBle(raw);
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

static void handleBleMessage(const String& raw) {
  JsonDocument msg;
  if (deserializeJson(msg, raw)) return;
  String kind = msg["k"] | "t";

  JsonDocument frame;
  frame["v"] = 1;
  frame["k"] = kind;
  frame["f"] = BLE_NODE_ID;
  frame["to"] = msg["to"] | "*";
  frame["q"] = seqCounter++;
  frame["ttl"] = MESH_TTL;
  frame["n"] = msg["n"] | "手机";
  String callsign = msg["c"] | "";
  if (callsign.length() > 0) frame["c"] = callsign;
  frame["ts"] = (long)millis();

  if (kind == "p") {
    frame["x"] = msg["x"] | 0.0;
    frame["y"] = msg["y"] | 0.0;
    frame["b"] = msg["b"] | 100;
  } else if (kind == "s") {
    frame["x"] = msg["x"] | 0.0;
    frame["y"] = msg["y"] | 0.0;
    frame["m"] = msg["m"] | "手机求救";
  } else {
    frame["m"] = msg["m"] | "";
  }

  String out;
  serializeJson(frame, out);
  bool ok = loraSend(out);
  seenAdd(String(GW_NODE_ID) + ":" + String((uint16_t)frame["q"]));

  JsonDocument ack;
  ack["type"] = "ack";
  ack["q"] = frame["q"];
  ack["ok"] = ok;
  String ackPayload;
  serializeJson(ack, ackPayload);
  notifyBle(ackPayload);
}

// ---------------- WebSocket ----------------

static void sendHello(uint8_t num) {
  JsonDocument hello;
  hello["type"] = "hello";
  hello["gateway"] = GW_NAME;
  hello["nodeId"] = GW_NODE_ID;
  hello["lora"] = String(LORA_FREQ, 3) + "MHz";
  String payload;
  serializeJson(hello, payload);
  ws.sendTXT(num, payload);
}

static void onWsEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      Serial.printf("[WS] client %u connected\n", num);
      sendHello(num);
      break;
    }
    case WStype_DISCONNECTED:
      Serial.printf("[WS] client %u disconnected\n", num);
      break;
    case WStype_TEXT: {
      JsonDocument doc;
      if (deserializeJson(doc, payload, length)) return;
      String msgType = doc["type"] | "";
      if (msgType == "command") {
        String to = doc["to"] | "*";
        String text = doc["text"] | "";
        String id = doc["id"] | "";
        sendDownlink(to, text, id, num);
      }
      break;
    }
    default:
      break;
  }
}

// ---------------- WiFi ----------------

static void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(200);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] STA IP: ");
    Serial.println(WiFi.localIP());
  } else {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASS);
    Serial.print("[WiFi] AP IP: ");
    Serial.println(WiFi.softAPIP());
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nResQNet LoRa gateway");

  pinMode(VEXT_PIN, OUTPUT);
  digitalWrite(VEXT_PIN, LOW);

  connectWifi();

  if (!loraInit()) {
    Serial.println("[LoRa] disabled, gateway will still serve WS/BLE");
  }

  ws.begin();
  ws.onEvent(onWsEvent);

  bleInit();

  if (GW_LAT != 0.0 || GW_LON != 0.0) {
    JsonDocument frame;
    frame["v"] = 1;
    frame["k"] = "p";
    frame["f"] = GW_NODE_ID;
    frame["to"] = "*";
    frame["q"] = seqCounter++;
    frame["ttl"] = 0;
    frame["n"] = GW_NAME;
    frame["r"] = "gateway";
    frame["x"] = GW_LAT;
    frame["y"] = GW_LON;
    frame["b"] = 100;
    frame["ts"] = (long)millis();
    String out;
    serializeJson(frame, out);
    loraSend(out);
  }

  Serial.println("[WS] listening on port 81");
}

void loop() {
  ws.loop();
  loraPoll();
  processPending();

  if (millis() - lastHello > WS_HELLO_INTERVAL_MS) {
    lastHello = millis();
    ws.broadcastTXT("{\"type\":\"hello\",\"gateway\":\"" GW_NAME "\",\"nodeId\":\"" GW_NODE_ID "\"}");
  }

  delay(5);
}