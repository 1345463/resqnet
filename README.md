# 应急通 ResQNet

去中心化应急救援信息互通平台 —— 在基站瘫痪、断网断电的灾区，用设备间多跳转发传递 **SOS、文字、语音消息与位置**。

> 2026 Qoder 高校创造力大赛 · Hack4Good 技术向善 参赛项目
> 在线演示：https://resqnet-t2bci1hjbry.qoder.zone
> 管理端（真实台账/事件/网关）：https://resqnet-console-t2bci1hjbry.qoder.zone
> 电脑端：`release/ResQNet/ResQNet.exe`（免安装，支持 USB LoRa 串口）
> 当前版本：**v0.1.0**（协议仿真 + 指挥台）

## 这是什么

一句话：给灾区现场一个"没有中心服务器也能互通"的应急通信层。

- 每个终端既是发送者也是中继，消息自动多跳转发
- 自动选择"最可靠"的下一跳（链路质量 + 电量 + 负载 + 高度综合评分，带滞后防抖）
- SOS 最高优先级，反复重发直到指挥车回执
- 文字/语音消息支持分片、去重、TTL、优先级队列
- 离线地图态势：不依赖任何在线底图

## 在线演示能做什么

打开链接后：

1. 左侧选择任意"居民"节点
2. 点 **SOS 求救**，观察红色数据包如何多跳到达指挥车、指挥车如何回执
3. 点某个中继的"断开"，看网络自动绕行、主中继切换
4. 发文字或语音消息，右侧日志显示跳数与端到端时延
5. 切换"城区 / 山地 / 震后"三种场景

链接加 `?auto=1` 会自动从最远节点发起一次求救演示。

> 演示页运行的是**协议仿真**：邻居发现、链路度量、中继选举、广播抑制、分片与去重均为真实计算。
> 真实射频链路（手机 — BLE — LoRa — 手机）见后续硬件验证视频。

## 架构

```
应用层（Web / Android / iOS / Desktop / Embedded）
会话同步层（频道 / 队列 / 回执 / 位置 CRDT / 离线缓存）
安全层（Ed25519 身份 + 群组密钥 + 防重放）
组网层（邻居表 / 链路度量 / 中继选举 / 广播抑制 / 单播路由 / 分片）
传输抽象层（BLE | WiFi | LoRa | 北斗短报文 | WebRTC | 仿真）
物理层（手机 / 外接模块 / 车载 / 无人机 / 卫星终端）
```

核心原则：**协议先行、传输可插拔**。上层只认 `Envelope`，换射频只加一个 adapter。

详见 [可行性论证与总体架构](docs/00-可行性论证与总体架构.md) 与 [协议规范 v0.1](docs/01-协议规范-v0.1.md)。

## 本地运行

```bash
cd app
npm install
npm run dev      # http://localhost:5199
npm run build    # 产物在 app/dist
```

> 本机 npm 若因代理证书或作用域包 404 失败，可先启动本地重写代理：
> `node ../tools/npm-registry-proxy.js`，并把 `app/.npmrc` 指向 `http://127.0.0.1:4873/`。

## 目录

```
app/                  演示版（协议仿真 + 态势台）
console/              管理端（真实台账 / 事件 / 消息 / 网关 / USB 串口）
desktop/              电脑端（Electron 壳 + 免安装 exe 打包）
firmware/gateway/     ESP32 LoRa 网关固件（LoRa ↔ WebSocket ↔ BLE）
firmware/usb-bridge/  ESP32 USB LoRa 桥（LoRa ↔ 串口 JSON）
tools/gw-sim/         网关模拟器（无硬件联调）
tools/                npm 镜像重写代理
docs/                 可行性论证、协议规范、无线电方案、迭代计划
参赛清单.md           比赛提交 checklist
```

## 真实链路

- 固件说明：[firmware/gateway/README.md](firmware/gateway/README.md)（ESP32-S3 + SX1262，433 MHz 小功率）
- 电脑端直连：烧 `firmware/usb-bridge`，用 `release/ResQNet/ResQNet.exe` 走 USB 串口（见 [desktop/README.md](desktop/README.md)）
- 管理端连网关：设置 → `ws://<网关IP>:81/`
- 无硬件联调：`node tools/gw-sim/server.mjs`，管理端连 `ws://127.0.0.1:8081/`
- 公网 HTTPS 版管理端无法连接局域网 `ws://`（浏览器混合内容限制），现场请用本地管理端

## 版本与迭代

采用语义化版本 `v主.次.修`，分支模型：

| 分支 | 用途 |
|---|---|
| `main` | 已发布版本，保持可演示 |
| `develop` | 下一版本集成 |
| `feature/*` | 单功能开发，PR 合入 develop |

- 每个版本必须更新 [CHANGELOG](CHANGELOG.md)，并在 `release/vX.Y.Z` 分支冻结
- 提交信息使用约定式：`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`
- 发布前跑 `npm run build`，并更新在线演示

路线图与验收标准见 [ROADMAP.md](ROADMAP.md)。

## 合规声明

本项目为原型与比赛演示。中国境内无线电发射须遵守《无线电管理条例》与微功率设备目录（工信部 2019 年第 52 号公告）；470–510 MHz 限定为民用计量等用途且不得用于组网，433 MHz 微功率限值 10 mW。产品化前需完成 SRRC 型号核准/合规评估；卫星通道（北斗短报文）需北斗卡与相应资质。详见架构文档第 3 节。

## 文档

- [可行性论证与总体架构](docs/00-可行性论证与总体架构.md)
- [协议规范 v0.1](docs/01-协议规范-v0.1.md)
- [无线电链路方案](docs/03-无线电链路方案.md)
- [使用说明](docs/06-使用说明.md)
- [作品帖初稿](docs/05-作品帖初稿.md)
- [CHANGELOG](CHANGELOG.md)