# USB LoRa 桥固件（ESP32 + SX1262）

把 LoRa 空中帧转成**串口 JSON 行**，电脑端（Electron/Chrome Web Serial）直接读取，不需要 WiFi、WebSocket 或 BLE。

```
LoRa 节点 ⇄ 433MHz ⇄ ESP32 ⇄ USB 串口 ⇄ 电脑端管理台
```

## 1. 硬件

- Heltec WiFi LoRa 32 V3（ESP32-S3 + SX1262）
- 433 MHz 天线（不要加功放）
- USB-C 数据线

引脚与网关固件一致：NSS 8、SCK 9、MOSI 10、MISO 11、RST 12、BUSY 13、DIO1 14。

## 2. 配置

`src/config.h`：

- `LORA_FREQ` 433.175 MHz、SF9、BW125、8 dBm
- `NODE_ID` / `NODE_NAME`：桥在管理端里的身份

## 3. 烧录

```bash
cd firmware/usb-bridge
pio run -t upload
pio device monitor
```

正常输出：

```
# [LoRa] ready 433.175 MHz SF9
{"type":"hello","gateway":"USB桥","nodeId":"usb1"}
```

> 未在实机编译验证（当前环境无 PlatformIO/开发板）。

## 4. 串口协议（每行一个 JSON）

电脑端 → 桥：

```json
{"type":"command","id":"out1","to":"u1","text":"救援车已出发"}
```

桥 → 电脑端：

```json
{"type":"hello","gateway":"USB桥","nodeId":"usb1"}
{"type":"position","nodeId":"u1","name":"队员-01","lat":30.66,"lon":104.06,"battery":0.8}
{"type":"text","nodeId":"u1","name":"队员-01","text":"两人受困"}
{"type":"sos","nodeId":"u1","name":"队员-01","lat":30.66,"lon":104.06,"note":"需要担架","level":3}
{"type":"ack","messageId":"out1","ok":true}
```

波特率 115200。

## 5. 空中帧

与管理端 LoRa 网关一致（紧凑 JSON，≤200 B）：

```json
{"v":1,"k":"t","f":"u1","to":"*","q":12,"ttl":4,
 "n":"队员-01","x":30.66,"y":104.06,"b":80,"m":"两人受困","ts":1732580000000}
```

桥会做去重与 TTL 转发，可当普通中继使用。

## 6. 与网关固件怎么选

| 场景 | 用哪个 |
|---|---|
| 电脑直接插模块，指挥所单机 | **usb-bridge** + 电脑端 |
| 需要手机 BLE 接入 / 局域网多台电脑 | `gateway`（WiFi + WebSocket + BLE） |
| 没有硬件先演示 | `tools/gw-sim` |

## 7. 合规

433.05–434.79 MHz 微功率限值 10 mW（e.r.p），默认 8 dBm，不得加功放、改天线。470–510 MHz 不得组网。使用 430–440 MHz 更大功率需业余电台执照。