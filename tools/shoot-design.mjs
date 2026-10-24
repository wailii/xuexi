// 把 design/角色对比.html 四个方案、三个状态各截一张（两台手机并排）
//   node tools/shoot-design.mjs        截图存到 design/shots/
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "design", "shots"); mkdirSync(OUT, { recursive: true });
const PAGE = pathToFileURL(join(ROOT, "design", "角色对比.html")).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 300);
const proc = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "shd-"))}`, "--no-first-run", "--hide-scrollbars", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
let pages;
for (let i = 0; i < 50; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (pages.find((p) => p.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (ex) => { const r = await send("Runtime.evaluate", { expression: ex, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 1150, deviceScaleFactor: 2, mobile: false });
await send("Runtime.enable"); await send("Page.enable");
const errs = [];
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });
const shot = async (name) => {
  const r = await ev(`(() => { const b = document.querySelector('.phones').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
  const { result } = await send("Page.captureScreenshot", { format: "png", clip: { x: r[0] - 14, y: r[1] - 6, width: r[2] + 28, height: r[3] + 20, scale: 1 } });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(result.data, "base64")); console.log("✓", name);
};
for (const o of ["A", "B", "C", "D"]) {
  await send("Page.navigate", { url: PAGE + "?o=" + o });
  await sleep(3200);
  if (!(await ev("!!document.querySelector('.phones')"))) { console.log("没打开：", await ev("location.href + ' ' + document.title")); break; }
  await shot(`${o}-1-开始`);
  await ev("document.getElementById('adv').click()"); await sleep(o === "B" ? 2600 : 2200);
  await ev("document.querySelector('[data-c=right]').click()"); await sleep(1300);
  await shot(`${o}-2-学完一件-答对`);
  await ev("document.querySelector('[data-c=wrong]').click()"); await sleep(1300);
  await shot(`${o}-3-答错`);
  await ev("document.getElementById('adv').click()"); await sleep(o === "C" ? 3200 : 2600);
  await ev("document.querySelector('[data-c=done]').click()"); await sleep(o === "B" ? 1500 : 900);
  await shot(`${o}-4-今天学完-学完一节`);
}
if (errs.length) console.log("页面报错：\n" + errs.join("\n"));
ws.close(); proc.kill();
