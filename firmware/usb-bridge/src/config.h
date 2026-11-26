#pragma once

// USB 串口桥：ESP32 通过 USB CDC 与电脑端通信，LoRa 负责空中链路

#define NODE_ID "usb1"
#define NODE_NAME "USB桥"

// 433 MHz 微功率，不要加功放
#define LORA_FREQ 433.175
#define LORA_BW 125.0
#define LORA_SF 9
#define LORA_CR 5
#define LORA_POWER 8
#define LORA_PREAMBLE 8
#define LORA_TCXO 1.8

#define FRAME_MAX 200
#define MESH_TTL 4
#define REBROADCAST_MIN_MS 150
#define REBROADCAST_MAX_MS 600
#define SEEN_CACHE 96
#define SERIAL_BAUD 115200