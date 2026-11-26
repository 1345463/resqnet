# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

### Added
- 管理端（`console/`）：高德底图 + GCJ-02 纠偏、节点台账、事件处置、消息下发、WebSocket 网关接入、本地持久化
- 应急模式：登记呼号、报备编号、机构、频段、功率（条例第 37 条）
- LoRa 网关固件（`firmware/gateway/`）：ESP32-S3 + SX1262，LoRa ↔ WebSocket ↔ BLE NUS，多跳转发
- 网关模拟器（`tools/gw-sim/`）：无硬件联调
- 电脑端（`desktop/`）：Electron 壳、本地加载管理台、Web Serial 串口权限、免安装 exe 打包脚本
- 管理端 USB 串口数据源（Web Serial），与 WebSocket 共用同一套事件/消息模型
- USB LoRa 桥固件（`firmware/usb-bridge/`）：LoRa ↔ 串口 JSON
- 演示版：语音分片进度条、主中继切换日志、手机端地图比例修复
- 文档：无线电链路方案、作品帖初稿、路线图、使用说明

### Changed
- 演示版 `?auto=1` 自动演示；管理端 `?demo=1` 加载示例台账

### Fixed
- SOS 重发包重复计数、ACK 跳数不足、导航栏在窄屏重叠

## [0.1.0] - 2026-11-25

### Added
- 协议仿真内核：邻居发现、链路度量（SNR/距离/地形遮挡）、广播去重、TTL、优先级队列
- 主中继选举：SNR、电量、负载、高度综合评分 + 滞后防抖
- SOS：最高优先级多跳扩散、指挥车 ACK 回执、无回执自动重发（最多 3 次）
- 文字消息：多跳广播送达、跳数与时延统计
- 语音消息：按 0.4 s 分片、乱序重组、全部到达后生成可播放条目
- 态势地图：城区 / 山地 / 震后三种场景，节点移动、电量、链路质量、数据包动画
- 指挥台 UI：节点面板、主中继展示、传输日志、指标卡、手机端适配
- `?auto=1` 自动演示：最远节点发起 SOS + 文字
- Qoder Sites 公网部署（公开访问）

### Docs
- 可行性论证与总体架构
- 协议规范 v0.1
- 迭代计划
- 比赛提交 checklist

### Known Limitations
- Web 端为协议仿真，不含真实射频
- 语音为"语音消息"，非实时通话
- iOS 后台 BLE 广播受限；Web 不支持 BLE 外设广播
- 470–510 MHz 组网存在合规限制，硬件演示仅使用认证模块小功率