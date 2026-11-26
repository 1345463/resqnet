const { app, BrowserWindow, session, dialog, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const UI_ROOT = app.isPackaged
  ? path.join(__dirname, 'ui')
  : path.join(__dirname, '..', 'console', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function startUI() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(UI_ROOT, 'index.html'))) {
      reject(new Error(`未找到管理端构建产物：${UI_ROOT}\n请先运行 npm run build:ui`));
      return;
    }
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const safe = path.normalize(urlPath).replace(/^([/\\])+/, '');
      let file = path.join(UI_ROOT, safe);
      if (!file.startsWith(UI_ROOT)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(UI_ROOT, 'index.html');
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('read error');
          return;
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });
}

function setupSerialPermission() {
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'serial');
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'serial');
  });
  ses.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    if (!portList || portList.length === 0) {
      callback('');
      return;
    }
    if (portList.length === 1) {
      callback(portList[0].portId);
      return;
    }
    const labels = portList.map((p, i) => `${i + 1}. ${p.displayName || p.portName || p.portId}`);
    dialog
      .showMessageBox({
        type: 'question',
        title: '选择 LoRa 串口',
        message: '检测到多个串口，请选择 LoRa 模块',
        detail: labels.join('\n'),
        buttons: labels.concat('取消'),
        cancelId: labels.length,
      })
      .then(({ response }) => {
        callback(response < portList.length ? portList[response].portId : '');
      });
  });
  ses.on('serial-port-added', (_event, port) => {
    console.log('[serial] added', port.portName || port.portId);
  });
}

async function createWindow() {
  const port = await startUI();
  console.log(`[ui] http://127.0.0.1:${port}/`);
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#060c15',
    autoHideMenuBar: true,
    title: '应急通 ResQNet · 管理端',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  await win.loadURL(`http://127.0.0.1:${port}/?desktop=1${process.env.RESQNET_SHOT ? '&demo=1' : ''}`);
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[ui] load failed', code, desc);
  });

  if (process.env.RESQNET_SHOT) {
    setTimeout(async () => {
      try {
        const image = await win.webContents.capturePage();
        fs.writeFileSync(process.env.RESQNET_SHOT, image.toPNG());
        console.log('[shot] saved');
      } catch (error) {
        console.error('[shot] failed', error);
      }
      app.quit();
    }, 3500);
  }
}

app.whenReady().then(async () => {
  setupSerialPermission();
  try {
    await createWindow();
  } catch (error) {
    dialog.showErrorBox('ResQNet 启动失败', String(error.message || error));
    app.quit();
    return;
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});