// 生成免安装便携版：release/ResQNet/ResQNet.exe
// 用法：node desktop/package-portable.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const electronDist = path.join(here, 'node_modules', 'electron', 'dist');
const consoleDist = path.join(root, 'console', 'dist');
const outDir = path.join(root, 'release', 'ResQNet');

function mustExist(target, hint) {
  if (!fs.existsSync(target)) {
    console.error(`缺少 ${target}\n${hint}`);
    process.exit(1);
  }
}

mustExist(path.join(electronDist, 'electron.exe'), '请先在 desktop 目录执行 npm install');
mustExist(path.join(consoleDist, 'index.html'), '请先在 console 目录执行 npm run build');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.cpSync(electronDist, outDir, { recursive: true });

// 重命名主程序
const exe = path.join(outDir, 'electron.exe');
if (fs.existsSync(exe)) fs.renameSync(exe, path.join(outDir, 'ResQNet.exe'));

// 应用目录：resources/app（Electron 会优先加载它）
const appDir = path.join(outDir, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });
fs.copyFileSync(path.join(here, 'main.cjs'), path.join(appDir, 'main.cjs'));
fs.writeFileSync(
  path.join(appDir, 'package.json'),
  JSON.stringify({ name: 'resqnet-desktop', version: '0.1.0', main: 'main.cjs' }, null, 2)
);
fs.cpSync(consoleDist, path.join(appDir, 'ui'), { recursive: true });

// 去掉用不到的默认应用，减小体积
const defaultAsar = path.join(outDir, 'resources', 'default_app.asar');
if (fs.existsSync(defaultAsar)) fs.rmSync(defaultAsar);

const size = (dir) => {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? size(p) : fs.statSync(p).size;
  }
  return total;
};

console.log(`已生成：${path.join(outDir, 'ResQNet.exe')}`);
console.log(`目录大小：${(size(outDir) / 1024 / 1024).toFixed(0)} MB`);