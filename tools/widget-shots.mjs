// 把桌面小组件的几种样子画出来存成 PNG：design/widget/ 看效果，两张预览图放进安卓资源（选小组件时显示）
//   node tools/widget-shots.mjs      （tools/dev.py 要在 8971 跑着）
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "design", "widget"); mkdirSync(OUT, { recursive: true });
const RES = join(ROOT, "android/app/src/main/res/drawable-nodpi"); mkdirSync(RES, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9700 + Math.floor(Math.random() * 200);
const proc = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "wsh-"))}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
let pages;
for (let i = 0; i < 50; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (pages.find((p) => p.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (ex) => { const r = await send("Runtime.evaluate", { expression: ex, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
await send("Page.navigate", { url: "http://127.0.0.1:8971/" });
await sleep(4000);
const FIRST = "大模型 · 学 01 为什么需要 RAG：四大局限";
const shots = await ev(`(async () => {
  await document.fonts.load('40px "LXGW WenKai Screen"', "还剩节今天学完了新的一天来学一节大约分钟明天见没有课说说想学什么0123456789${FIRST}");
  await document.fonts.load('40px Hand', "还剩节0123456789");
  const st = { kind: "todo", left: 2, min: 30, first: ${JSON.stringify(FIRST)} };
  return {
    "small-todo": await Widget.small(st), "wide-todo": await Widget.wide(st),
    "small-done": await Widget.small({ kind: "done" }), "wide-done": await Widget.wide({ kind: "done" }),
    "small-new": await Widget.small({ kind: "new" }), "wide-new": await Widget.wide({ kind: "new" }),
  };
})()`);
for (const [k, d] of Object.entries(shots)) { writeFileSync(join(OUT, k + ".png"), Buffer.from(d.split(",")[1], "base64")); console.log("✓", k); }
copyFileSync(join(OUT, "small-todo.png"), join(RES, "widget_preview_small.png"));
copyFileSync(join(OUT, "wide-todo.png"), join(RES, "widget_preview_wide.png"));
ws.close(); proc.kill();
