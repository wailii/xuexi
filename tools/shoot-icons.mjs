// 截图标对比页：node tools/shoot-icons.mjs [方案字母…]   截图存到 design/shots/icon-*.png
//   node tools/shoot-icons.mjs --export A   把方案 A 的前景、背景导出成 432px PNG（design/icon/A-fg.png、A-bg.png）
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "design", "shots"); mkdirSync(OUT, { recursive: true });
const PAGE = pathToFileURL(join(ROOT, "design", "图标对比.html")).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 300);
const proc = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "shi-"))}`, "--no-first-run", "--hide-scrollbars", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
let pages;
for (let i = 0; i < 50; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (pages.find((p) => p.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (ex) => { const r = await send("Runtime.evaluate", { expression: ex, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
await send("Runtime.enable"); await send("Page.enable");
const args = process.argv.slice(2);

if (args[0] === "--export") {
  const k = args[1];
  await send("Emulation.setDeviceMetricsOverride", { width: 432, height: 432, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: PAGE }); await sleep(2500);
  const L = await ev(`window.layers(${JSON.stringify(k)})`);
  for (const part of ["bg", "fg"]) {
    await ev(`document.body.innerHTML = ${JSON.stringify(L[part])}; document.body.style.cssText = "margin:0;background:transparent"; document.querySelector('svg').style.display = "block"; 1`);
    await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await sleep(300);
    const { result } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 432, height: 432, scale: 1 } });
    writeFileSync(join(ROOT, "design", "icon", `${k}-${part}.png`), Buffer.from(result.data, "base64")); console.log("✓", k, part);
  }
} else {
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 1400, deviceScaleFactor: 2, mobile: false });
  await send("Page.navigate", { url: PAGE }); await sleep(3000);
  for (const k of args.length ? args : ["A"]) {
    await ev(`[...document.querySelectorAll('.opt')].find(b => b.textContent.trim().startsWith(${JSON.stringify(k)})).click(); 1`); await sleep(500);
    const h = await ev("document.documentElement.scrollHeight");
    const { result } = await send("Page.captureScreenshot", { format: "jpeg", quality: 82, clip: { x: 0, y: 0, width: 1000, height: h, scale: 1 }, captureBeyondViewport: true });
    writeFileSync(join(OUT, `icon-${k}.jpg`), Buffer.from(result.data, "base64")); console.log("✓", k);
  }
}
if (errs.length) console.log("页面报错：", errs);
ws.close(); proc.kill();
