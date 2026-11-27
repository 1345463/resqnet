# ResQNet 现场端 Android App

Capacitor 8 包装 `field/` 的 PWA，并接入原生 BLE 与定位（WebView 不支持 Web Bluetooth）。

## 环境（本机已就绪）

- JDK 21：`C:\Android\jdk21\zulu21.54.201-ca-fx-jdk21.0.13.1-win_x64`
- Android SDK：`C:\Android\sdk`（platform 36、build-tools 36.0.0、platform-tools）
- Capacitor 8 + `@capacitor-community/bluetooth-le` + `@capacitor/geolocation`

## 构建

```bash
cd field
npm run build
npx cap sync android

cd android
export JAVA_HOME='C:\Android\jdk21\zulu21.54.201-ca-fx-jdk21.0.13.1-win_x64'
export ANDROID_HOME='C:\Android\sdk'
./gradlew.bat assembleDebug --no-daemon

# 产物
# android/app/build/outputs/apk/debug/app-debug.apk
```

## 安装

- 手机打开 `https://resqnet-field-t2bci1hjbry.qoder.zone/download/ResQNet-field.apk`
- 或 `adb install -r app-debug.apk`
- 首次安装需允许"未知来源"；APK 为 debug 签名，正式发布应生成 release keystore

## 原生能力

| 能力 | 实现 |
|---|---|
| BLE 网关 | `@capacitor-community/bluetooth-le`，NUS 服务，按行 JSON |
| 定位 | `@capacitor/geolocation` + 权限 |
| 地图 | 高德瓦片（需联网），失败时降级为坐标网格 |
| 离线 | Web 资源打包进 APK，断网可开 |

## 注意

- 网关固件 BLE 通知必须带换行（已在 `firmware/gateway` 修复），否则手机端按行解析收不到
- iOS 版本需另建 Xcode 工程，Web Bluetooth 不可用，只能作为查看端
- Gradle 使用阿里云/腾讯镜像，若换网络可删除 `android/build.gradle` 中的镜像配置