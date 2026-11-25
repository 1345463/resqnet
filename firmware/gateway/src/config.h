#pragma once

// ====== 必改：现场 WiFi ======
#define WIFI_SSID "CHANGE_ME"
#define WIFI_PASS "CHANGE_ME"

// WiFi 连接失败 10 秒后自动开热点，管理端连这个热点
#define AP_SSID "ResQNet-GW"
#define AP_PASS "resqnet123"

// ====== 管理端连接地址 ======
// 管理端（浏览器）作为客户端连接本机：ws://<本机IP>:81/
#define WS_PORT 81

// ====== 网关身份 ======
#define GW_NODE_ID "gw1"
#define GW_NAME "LoRa网关"
#define BLE_NODE_ID "gw-phone"

// 网关自身坐标（可选，填 0 不上报）
#define GW_LAT 0.0
#define GW_LON 0.0

// ====== LoRa 参数（国内 433 MHz 微功率，务必小功率） ======
#define LORA_FREQ 433.175
#define LORA_BW 125.0
#define LORA_SF 9
#define LORA_CR 5
#define LORA_POWER 8      // dBm；433 MHz 微功率限值 10 mW(e.r.p)，不要加功放
#define LORA_PREAMBLE 8
#define LORA_TCXO 1.8

// ====== 行为参数 ======
#define FRAME_MAX 200          // 单帧上限，留出 LoRa 余量
#define MESH_TTL 4
#define REBROADCAST_MIN_MS 150
#define REBROADCAST_MAX_MS 600
#define SEEN_CACHE 96
#define WS_HELLO_INTERVAL_MS 15000