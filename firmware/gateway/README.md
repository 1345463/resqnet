# ResQNet LoRa 网关固件（ESP32 + SX1262）

把 LoRa 网络接到管理端：**LoRa ↔ WebSocket ↔ 浏览器**，同时开放 **BLE NUS** 给手机现场端。

```
手机(BLE) ──┐
           ├─ ESP32 网关 ── WebSocket:81 ── 管理端（浏览器）
LoRa 节点 ──┘        └─ LoRa 433MHz 多跳
```

## 1. 硬件

| 项 | 说明 |
|---|---|
| 主控 | Heltec WiFi LoRa 32 V3（ESP32-S3 + SX1262 + OLED） |
| 天线 | 433 MHz 匹配天线，**不要加功放** |
| 供电 | USB-C 5V（现场建议充电宝） |
| 可选 | 外置 SX1262 模块按下面引脚接线 |

板载引脚（已写死在 `src/main.cpp`）：

| 信号 | GPIO |
|---|---|
| NSS | 8 |
| SCK | 9 |
| MOSI | 10 |
| MISO | 11 |
| RST | 12 |
| BUSY | 13 |
| DIO1 | 14 |
| Vext | 36（拉低供电） |

## 2. 配置

编辑 `src/config.h`：

- `WIFI_SSID` / `WIFI_PASS`：现场路由器；连不上会自动开热点 `ResQNet-GW / resqnet123`（IP 192.168.4.1）
- `LORA_FREQ`：默认 433.175 MHz；`LORA_POWER` 默认 8 dBm
- `GW_NODE_ID` / `GW_NAME`：网关在管理端里的身份
- `GW_LAT/GW_LON`：网关坐标（可选）

## 3. 编译烧录

```bash
# 安装 PlatformIO 后
cd firmware/gateway
pio run -t upload
pio device monitor     # 115200
```

启动日志应包含：

```
[WiFi] STA IP: 192.168.x.x
[LoRa] ready 433.175 MHz SF9 BW125
[BLE] advertising as ResQNet-GW
[WS] listening on port 81
```

## 4. 连接管理端

1. 电脑和网关在同一网络（或连网关热点）。
2. 启动管理端（**本地 http 方式**）：
   ```bash
   cd console && npm run dev
   ```
3. 管理端 → 设置 → 网关地址填：
   ```
   ws://<网关IP>:81/
   ```
4. 顶部显示"网关在线"即接通。

> **重要**：公网 HTTPS 版管理端（qoder.zone）无法连接 `ws://局域网IP`，浏览器会按混合内容拦截。现场请用本地管理端；公网版用于展示与远程查看台账。

## 5. 协议

### 5.1 LoRa 帧（紧凑 JSON，≤200 B）

```json
{"v":1,"k":"t","f":"u1","to":"*","q":12,"ttl":4,
 "n":"队员-01","c":"BG8XXX","r":"phone",
 "x":30.66,"y":104.06,"b":80,"m":"两人受困","ts":1732580000000}
```

| 键 | 含义 |
|---|---|
| `k` | `t` 文字 / `p` 位置 / `s` 求救 |
| `f` | 发送节点 ID |
| `to` | `*` 广播 或 目标节点 ID |
| `q` | 序号（与 `f` 组成去重键） |
| `ttl` | 剩余跳数，网关转发时减 1 |
| `n/c/r` | 名称 / 呼号 / 角色 |
| `x/y/b` | 纬度 / 经度 / 电量百分比 |
| `m` | 文本内容 |

网关去重后：
- 目标是自己或广播 → 上送管理端 + BLE 通知
- 还有 TTL → 150–600 ms 随机退避后重播（多跳扩展）

### 5.2 管理端 WebSocket（网关是服务端）

上行：

```json
{"type":"hello","gateway":"LoRa网关","nodeId":"gw1"}
{"type":"position","nodeId":"u1","name":"队员-01","callsign":"BG8XXX","role":"phone","lat":30.66,"lon":104.06,"battery":0.8,"rssi":-96}
{"type":"text","nodeId":"u1","name":"队员-01","text":"两人受困"}
{"type":"sos","nodeId":"u1","name":"队员-01","lat":30.66,"lon":104.06,"note":"需要担架","level":3}
```

下行：

```json
{"type":"command","id":"out123","to":"u1","text":"救援车已出发","channel":"cmd"}
```

网关回执：

```json
{"type":"ack","messageId":"out123","ok":true}
```

### 5.3 BLE NUS（手机现场端）

- Service：`6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- 手机写入 RX：`6E400002-...`；网关通知 TX：`6E400003-...`
- 手机写入内容（JSON）：
  ```json
  {"k":"t","n":"队员-07","m":"已到达东岸"}
  {"k":"p","n":"队员-07","x":30.66,"y":104.06,"b":72}
  {"k":"s","n":"队员-07","x":30.66,"y":104.06,"m":"腿部受伤"}
  ```
- 网关会把 LoRa 收到的帧再通知给 BLE。

用 **nRF Connect** 可以直接测试：连接 `ResQNet-GW`，找到 NUS 服务，向 RX 写上述 JSON，看 TX 通知与串口日志。

## 6. 合规

- 433.05–434.79 MHz 微功率限值 **10 mW (e.r.p)**；默认 8 dBm 且请使用合规天线，**不要加功放**。
- 若使用 430–440 MHz 业余频段与更大功率，需要**业余电台执照**；B 类 30 MHz 以上 ≤25 W。
- 应急场景按《无线电管理条例》第三十七条临时设台时，及时向属地无管机构报告，并在管理端"应急模式"登记。
- 470–510 MHz 限定为民用计量等用途且不得组网，不要用该频段跑 mesh。

## 7. 已知限制（v0.1）

- 单信道、无加密、无分片：文本请控制在 ~120 字节内
- 未做节点离线检测（管理端只按最后上报时间显示）
- WebSocket 无鉴权（`token` 字段预留，尚未校验）
- SF9/BW125 下单帧约 1 s 空口，密集场景需要降低位置上报频率
- BLE 需协商 MTU（固件已设 247）；手机端首次写入前先 requestMtu
- 固件未在本机编译验证（当前环境无 PlatformIO 与开发板），首次烧录请按日志逐项排查

## 8. 现场测试清单

1. 串口看到 LoRa 初始化成功与 WS 监听
2. 管理端显示"网关在线"
3. 手机 nRF Connect 写入 `{"k":"p","x":30.66,"y":104.06,"b":80}` → 管理端出现节点
4. 手机写入文字 → 管理端收到
5. 管理端发指令 → 串口打印 TX，另一台 LoRa 节点收到
6. 两台 LoRa 设备间隔 500 m/1 km 各测一轮，记录 RSSI 与丢包