// 在真手机上一步步自己点：读当前页面、执行一句页面里的 JS、等模型说完、截屏
//   node tools/pcall.mjs view                 当前页面上有什么（最近几条对话、待答的题、建议回复）
//   node tools/pcall.mjs do "<js>"            执行一句，再等模型说完，打印页面
//   node tools/pcall.mjs js "<js>"            只执行，打印返回值
//   node tools/pcall.mjs shot <名字>           手机截屏存到 shots-phone/
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEV = process.env.DEV || "";
const HELP = readFileSync(join(ROOT, "tools/drive2.mjs"), "utf8").match(/const HELP = (`[\s\S]*?`);/)[1];
const VIEW = `window.__t.view = () => {
  const v = __t.top(), cls = v.className;
  const txt = (e) => e.innerText.replace(/\\n+/g, " / ").trim();
  if (/chat/.test(cls)) {
    const items = [...v.querySelectorAll(".scroll > *")].slice(-9).map((e) => {
      const c = e.className;
      if (/\\bme\\b/.test(c)) return "我：" + txt(e);
      if (/\\bans\\b/.test(c)) return "AI：" + txt(e);
      if (/\\bq\\b/.test(c)) return (/cur/.test(c) ? "【待答的题】" : "【答过的题】") + txt(e);
      if (/chart/.test(c)) return "【图】" + txt(e);
      if (/ask/.test(c)) return (/done/.test(c) ? "【确认·已选】" : "【确认】") + txt(e);
      if (/score/.test(c)) return "【成绩】" + txt(e);
      if (/notec/.test(c)) return "【笔记卡】" + txt(e);
      if (/waitline/.test(c)) return "（在想…）";
      return "[" + c + "] " + txt(e).slice(0, 200);
    });
    return { 页: v.querySelector(".dtop h1")?.innerText, 对话: items, 建议回复: __t.qa(".quick button").map((b) => b.textContent), 输入框提示: v.querySelector(".comp input")?.placeholder, 还在说: !__t.idle() };
  }
  return { 页: cls, 内容: v.innerText.replace(/\\n+/g, " / ").slice(0, 1600) };
};`;

const pages = await (await fetch("http://127.0.0.1:9333/json")).json();
const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (ex) => {
  const r = await send("Runtime.evaluate", { expression: ex, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await ev(`if (!window.__t) eval(${HELP}); ${VIEW}; 1`);
const [cmd, arg] = process.argv.slice(2);
const settle = async () => {
  await sleep(1200);
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    if (await ev("__t.idle() && !(__t.top().querySelector('.waitline'))")) { await sleep(600); if (await ev("__t.idle()")) return; }
    await sleep(800);
  }
};
const show = async () => console.log(JSON.stringify(await ev("__t.view()"), null, 1));
if (cmd === "view") await show();
else if (cmd === "js") console.log(JSON.stringify(await ev(arg)));
else if (cmd === "do") { console.log("→", JSON.stringify(await ev(arg))); await settle(); await show(); }
else if (cmd === "shot") { mkdirSync(join(ROOT, "shots-phone"), { recursive: true }); writeFileSync(join(ROOT, "shots-phone", arg + ".png"), execFileSync("adb", ["-s", DEV, "exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 })); console.log("saved", arg); }
ws.close();
