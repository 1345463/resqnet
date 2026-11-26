# ResQNet 电脑端（Electron）

管理台的桌面壳：本地加载 `console/dist`，并放行 **Web Serial**，可以直接插 USB LoRa 模块当网关，不依赖局域网 WebSocket。

## 运行

```bash
# 1) 构建管理端（首次或改了 console 代码后）
cd ../console
npm install
npm run build

# 2) 安装并启动桌面端
cd ../desktop
npm install        # 国内建议：ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm start
```

启动后会打开 1440×900 的窗口，内部用随机端口加载管理端页面。

## 免安装 exe

```bash
cd console && npm run build     # 先构建界面
cd ../desktop && npm install
npm run package                 # 生成 release/ResQNet/ResQNet.exe
```

产物：

- `release/ResQNet/ResQNet.exe`（双击即用，免安装）
- `release/ResQNet-win64.zip`（整包分发）

首次运行若出现 SmartScreen 提示，点"更多信息 → 仍要运行"（未签名）。

## 用 USB 串口接 LoRa

1. 给 ESP32 烧 `firmware/usb-bridge`（见该目录 README）
2. USB 插入电脑（识别为 CP210x / CH340 / ESP32 USB）
3. 桌面端 → 设置 → 数据源选 **USB 串口**
4. 点 **连接串口**，在弹窗里选对应设备（115200）
5. 状态变"链路在线"，节点上报会出现在台账

## 与浏览器版区别

| 能力 | 浏览器（Edge/Chrome） | 电脑端（Electron） |
|---|---|---|
| 加载管理台 | 需要访问站点 | 本地加载，可离线 |
| WebSocket 网关 | ✅（本地 http 页面） | ✅ |
| USB 串口 | ✅（需手动授权） | ✅（自动放行串口权限） |
| 串口选择 | 浏览器弹窗 | 系统对话框，多串口可选 |
| 打包分发 | 无 | 可后续用 electron-builder 出 exe |

## 目录

```
desktop/
├─ main.cjs       # 静态服务 + 窗口 + 串口权限
├─ package.json
└─ README.md
```

## 已知限制

- 未做代码签名与安装包，当前是开发模式启动
- 串口只支持文本 JSON 行协议（`firmware/usb-bridge`）
- 窗口内仍是管理台的 localStorage 存储

## 出安装包（可选）

```bash
npm i -D electron-builder
npx electron-builder --win portable
```

首次会下载 NSIS 等工具，网络不稳时可改用 `--dir` 只出免安装目录。