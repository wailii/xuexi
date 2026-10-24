// 算成本：用真模型从头建一门课，再上 10 轮课，tools/dev.py 把每次调用的用量记在 tools/usage.log
//   node tools/cost-run.mjs        （dev.py 要在 8972 跑着）
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HELP = readFileSync(join(ROOT, "tools/drive2.mjs"), "utf8").match(/const HELP = (`[\s\S]*?`);/)[1];
const mark = (m) => appendFileSync(join(ROOT, "tools/usage.log"), JSON.stringify({ kind: "mark", m, t: new Date().toTimeString().slice(0, 8) }) + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9900 + Math.floor(Math.random() * 90);
const proc = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "cost-"))}`, "--no-first-run", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "about:blank"], { stdio: "ignore" });
let pages;
for (let i = 0; i < 50; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (pages.find((p) => p.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (ex) => { const r = await send("Runtime.evaluate", { expression: ex, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
const until = async (cond, ms = 240000) => { const t0 = Date.now(); while (!(await ev(`!!(${cond})`))) { if (Date.now() - t0 > ms) throw new Error("等不到：" + cond); await sleep(800); } await sleep(500); };
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: "http://127.0.0.1:8972/" });
await sleep(3000);
await ev("localStorage.clear(); location.reload(); 1");
await sleep(4000);
await ev(`eval(${HELP}); 1`);

// 建课：说宋朝，跟着问题点第一个选项，方案出来就开始建
mark("建课开始");
await ev("openBuild(); 1");
await until("__t.qa('.quick button').length && __t.idle()");
await ev("__t.type('宋朝')");
for (let k = 0; k < 8; k++) {
  await until("__t.ready()");
  if (await ev("!!__t.q('.ask:not(.done)')")) break;
  console.log("  建课问答", k + 1, await ev("__t.step()"));
  await sleep(800);
}
await until("__t.q('.ask:not(.done)')");
await ev("__t.q('.ask:not(.done) .yes').click()");
console.log("  开始建课");
await until("S.build && (S.build.done || S.build.error)", 1200000);
console.log("  建完：", await ev("S.build.error || (S.build.total + ' 节')"));
mark("建课结束");

// 上课：开新课的第一节，答 10 轮
mark("上课开始");
await ev("popHome(); openLesson(S.courses.find((c) => c.id === S.build.id)); 1");
let turns = 0;
for (let k = 0; k < 24 && turns < 10; k++) {
  await until("__t.ready()");
  const before = await ev("__t.qa('.ans, .fb').length");
  console.log("  上课第", turns + 1, "轮：", await ev("__t.step()"));
  await sleep(1500);
  await until("__t.ready()");
  if ((await ev("__t.qa('.ans, .fb').length")) > before) turns++;
}
mark("上课结束");
ws.close(); proc.kill();
