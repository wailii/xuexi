// 翻页回归：假建课（搜索、生图都换成假的，不花钱）→ 第 1 步时返回首页；再进课、退出；连点进出。每步记首页的状态、截图到 shots2/back-*.png
//   node tools/back-test.mjs        （dev.py 要在 8972 跑着）
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "shots2"); mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9900 + Math.floor(Math.random() * 90);
const proc = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "back-"))}`, "--no-first-run", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "about:blank"], { stdio: "ignore" });
let pages;
for (let i = 0; i < 150; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (pages.find((p) => p.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (ex) => { const r = await send("Runtime.evaluate", { expression: ex, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
const shot = async (name) => { const { result } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, `back-${name}.png`), Buffer.from(result.data, "base64")); };
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: "http://127.0.0.1:8972/" }); await sleep(3000);
await ev("localStorage.clear(); location.reload(); 1"); await sleep(4000);

// 首页此刻的状态：看得见吗（不透明、没被藏、在屏幕里、是最上面一页、外框没被卷走）
const state = `(() => { const v = stack[stack.length - 1], r = v.getBoundingClientRect(), cs = getComputedStyle(v);
  return { top: v.className, op: cs.opacity, vis: cs.visibility, x: Math.round(r.left), last: views.lastElementChild === v, n: views.children.length, scroll: [app.scrollLeft, app.scrollTop, views.scrollLeft, v.scrollLeft, v.scrollTop].join(","), hidden: [...views.children].filter(x => x !== v).map(x => x.className + ":" + getComputedStyle(x).visibility).join(" ") }; })()`;
const check = async (label) => {
  const out = [];
  for (const t of [100, 400, 800, 1300, 2000]) { await sleep(t - (out.at(-1)?.t || 0)); out.push({ t, ...(await ev(state)) }); if (t === 400 || t === 2000) await shot(`${label}-${t}`); }
  const end = out.at(-1), ok = end.op === "1" && end.vis === "visible" && end.x === 0 && end.last && end.scroll === "0,0,0,0,0";
  console.log(ok ? "✓" : "✗", label, JSON.stringify(end)); return ok;
};

// 1. 假建课，到第 1 步时返回
await ev(`(() => {
  Native.image = () => new Promise(() => {}); let qn = 0;
  Native.search = (q) => sleep(400 + Math.random() * 500).then(() => ({ text: "摘要 " + q, results: Array.from({ length: 5 }, (_, i) => ({ title: q + i, url: "https://example.com/" + (qn++), site: ["新东方在线", "百度百科", "知乎"][i % 3] })) }));
  S.build = { id: "c" + Date.now(), plan: { title: "英语口语", queries: "abcdefghijkl".split(""), profile: "", goal: "", depth: "", orientation: "", focus: [], minutes: 15, cover_object: "手册" }, step: 1, frac: 0, started: true, sources: [], digest: [], searched: [], areas: null, nodes: {}, done: false, viewed: false };
  S.build.ch = buildChat(); push(S.build.ch.v); S.build.ch.phase(2); runBuild(S.build).catch(() => {}); return 1; })()`);
await sleep(2500);
await shot("build");
const r1 = await ev("JSON.stringify(" + state + ")"); console.log("  建课页上，首页：", await ev(`(() => { const h = homeV; return getComputedStyle(h).visibility + " op=" + getComputedStyle(h).opacity; })()`));
await ev("__back()"); const a = await check("build-back");
// 2. 再点「建课中」条回到建课页，再返回
await ev("document.getElementById('morph').click()"); await sleep(1200);
const onBuild = await ev("stack.length === 2 && getComputedStyle(stack[1]).visibility");
console.log("  再进建课页：", onBuild);
await ev("__back()"); const b = await check("build-back2");
// 3. 进课程页、退出
await ev("[...document.querySelectorAll('.it, [data-c]')].find(e => e.offsetParent)?.click()"); await sleep(1200);
await ev("__back()"); const c = await check("cat-back");
// 4. 连点：进出进出
for (let i = 0; i < 4; i++) { await ev("[...document.querySelectorAll('.it, [data-c]')].find(e => e.offsetParent)?.click()"); await sleep(150); await ev("__back()"); await sleep(120); }
const d = await check("rapid");
console.log(a && b && c && d ? "全部通过" : "有没过的", errs.length ? "页面报错：" + errs.join(" | ") : "");
ws.close(); proc.kill();
