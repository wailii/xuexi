// 用无头 Chrome 按剧本把原型点一遍，每个关键状态截一张图
//   node tools/drive.mjs rag phy build free    （原型要先在 8970 端口跑着）
// 截图存到 learning-app/shots/<剧本>-<序号>-<名字>.png
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "shots"); mkdirSync(OUT, { recursive: true });
const URL0 = process.env.URL || "http://127.0.0.1:8970/";
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 页面里的小工具：都在最上面那一页里找
const HELP = `window.__t = {
  top: () => stack[stack.length - 1],
  q: (s) => __t.top().querySelector(s),
  qa: (s) => [...__t.top().querySelectorAll(s)],
  live: () => { const l = __t.qa('.q.cur'); return l[l.length - 1]; },
  ans(x, k) { const c = __t.live(); const o = [...c.querySelectorAll('.op:not(.tried)')].find((o) => o.dataset.k === x || o.querySelector('span').textContent === x); o.click(); const cf = c.querySelector('.conf:not(.done)'); if (cf && k) cf.querySelector('[data-k="' + k + '"]').click(); },
  stuck() { __t.live().querySelector('.stuck').click(); },
  btn(t, sel = 'button') { const b = __t.qa(sel).filter((b) => b.textContent.trim() === t).pop(); b.click(); },
  quick(t) { __t.btn(t, '.quick button'); },
  sort(vals) { const rows = __t.live().querySelectorAll('.srow'); rows.forEach((r, i) => r.querySelector('[data-v="' + vals[i] + '"]').click()); __t.live().querySelector('.solid').click(); },
  multi(ts) { const c = __t.live(); c.querySelectorAll('.chk').forEach((b) => ts.includes(b.textContent) && b.click()); c.querySelector('.solid').click(); },
  type(t) { const v = __t.top(); v.querySelector('.comp input').value = t; v.querySelector('.comp').requestSubmit(); },
  bottom() { const s = __t.q('.scroll'); s.scrollTop = s.scrollHeight; },
  idle() { const v = __t.top(); return !v.querySelector('.caret') && !v.querySelector('.st.run'); },
  stage() { return __t.q('.phases span.on')?.textContent; },
};`;

// 剧本：["js", 代码] 执行；["until", 条件, 超时毫秒]；["wait", 毫秒]；["shot", 名字]
const LIVE = "__t.live() && __t.idle()";
const ASK = "__t.q('.ask:not(.done)') && __t.idle()";
const END = "__t.q('.score') && __t.q('.chips') && __t.idle()";
const B = ["js", "__t.bottom()"];
const S = {
  // 大模型：复习答错 → 打底补前一节 → 摸底说能讲清楚、跳过打底 → 连着两题卡住 → 退回打底 → 中途说「没懂」再换讲法 → 查证 → 测验错一题 → 回追问补 → 重考 → 成绩
  rag: [
    ["wait", 3800], ["shot", "home"],
    ["js", "__t.qa('.it')[0].click()"], ["wait", 1800], ["shot", "category"],
    ["js", "__t.q('#go').click()"], ["until", LIVE], ["shot", "review"],
    ["js", "__t.ans('A')"], ["wait", 500], ["shot", "conf-in-card"],
    ["js", "__t.ans('C', 'high')"], ["until", LIVE + " && __t.stage() === '摸底'"], B, ["shot", "review-wrong-fix"],
    ["js", "__t.ans('A')"], ["until", LIVE], ["js", "__t.type('提前算好，提问的时候就快')"], ["until", LIVE + " && __t.stage() === '追问'"], B, ["shot", "skip-base"],
    ["js", "__t.sort(['L','R','L','R','R','R'])"], ["wait", 500], B, ["shot", "sort-wrong"],
    ["js", "__t.live().querySelectorAll('.srow')[1].querySelector('[data-v=L]').click(); __t.live().querySelector('.solid').click()"],
    ["until", LIVE], ["js", "__t.stuck()"], ["wait", 1200], ["js", "__t.ans('A')"], ["until", LIVE], ["js", "__t.ans('B')"], ["until", LIVE], ["js", "__t.ans('B')"],
    ["until", LIVE + " && __t.qa('.switch').length >= 5"], B, ["shot", "struggle-base"],
    ["js", "__t.quick('没懂，再讲讲')"], ["until", LIVE + " && __t.stage() === '追问'"], B, ["shot", "intent-base"],
    ["js", "__t.ans('不对')"], ["until", LIVE], ["js", "__t.ans('A')"], ["until", ASK], B, ["shot", "ask-ground"],
    ["js", "__t.btn('看看')"], ["until", LIVE + " && __t.stage() === '测验'"], B, ["shot", "ground"],
    ["js", "__t.qa('.cite')[0].click()"], ["wait", 700], ["shot", "sources"], ["js", "document.getElementById('sheet').classList.remove('on')"], ["wait", 400],
    ["js", "__t.ans('A', 'high')"], ["until", LIVE + " && __t.stage() === '追问'"], B, ["shot", "quiz-fix"],
    ["js", "__t.ans('不对')"], ["until", LIVE + " && __t.stage() === '测验'"], ["js", "__t.ans('B', 'med')"], ["until", LIVE], ["js", "__t.ans('B', 'high')"],
    ["until", END, 30000], B, ["shot", "score"],
    ["js", "__t.btn('回到课程')"], ["wait", 2000], ["shot", "category-after"],
    ["js", "__t.q('.back').click()"], ["wait", 1500], ["shot", "home-after"],
  ],
  // 物理：复习两张，07 答错 → 打底补 07 → 摸底时说「我会了，考我」→ 直接测验 → 跳过的追问按小测算
  phy: [
    ["wait", 3500], ["js", "__t.qa('.it')[1].click()"], ["wait", 1800], ["shot", "category"],
    ["js", "__t.q('#go').click()"], ["until", LIVE], ["js", "__t.ans('B', 'med')"], ["until", LIVE], ["js", "__t.ans('B', 'high')"], ["until", LIVE], B, ["shot", "cleared"],
    ["js", "__t.ans('对', 'med')"], ["until", LIVE + " && __t.stage() === '摸底'"], B, ["shot", "review-fix"],
    ["js", "__t.quick('我会了，考我')"], ["until", LIVE + " && __t.stage() === '测验'"], B, ["shot", "intent-quiz"],
    ["js", "__t.ans('B', 'high')"], ["until", LIVE], ["js", "__t.ans('不对', 'med')"], ["until", END], B, ["shot", "score"],
    ["js", "__t.btn('回首页')"], ["wait", 1500], ["shot", "home-after"],
  ],
  // 建课，然后宋朝第一课：前两题都一次答对 → 跳过剩下的追问 → 测验时问「有出处吗」→ 查证 → 回到测验
  build: [
    ["wait", 3500], ["js", "document.getElementById('morph').click()"], ["until", "__t.q('.chips') && __t.idle()"], ["shot", "topic"],
    ["js", "__t.btn('宋朝')"], ["until", LIVE], ["js", "__t.ans('B')"], ["until", LIVE], ["js", "__t.ans('A')"], ["until", LIVE],
    ["js", "__t.multi(['政治制度','打仗和外交'])"], ["until", LIVE], ["js", "__t.ans('20 分钟')"], ["until", ASK], B, ["shot", "summary"],
    ["js", "__t.btn('开始建课')"], ["wait", 6000], B, ["shot", "building"],
    ["js", "__t.btn('先去忙别的')"], ["wait", 2200], ["shot", "home-bar"],
    ["until", "S.build.done", 60000], ["wait", 1500], ["shot", "home-built"],
    ["js", "document.getElementById('morph').click()"], ["until", LIVE], ["shot", "song-probe"],
    ["js", "__t.ans('C')"], ["until", LIVE], ["js", "__t.ans('B')"], ["until", LIVE], ["js", "__t.ans('B')"], ["until", LIVE + " && __t.stage() === '测验'"], B, ["shot", "song-fast"],
    ["js", "__t.quick('有出处吗')"], ["until", LIVE + " && __t.stage() === '测验' && __t.qa('.cite').length"], B, ["shot", "song-ground"],
    ["js", "__t.ans('B', 'high')"], ["until", LIVE], ["js", "__t.ans('B', 'med')"], ["until", END], B, ["shot", "song-score"],
    ["js", "__t.btn('回到课程')"], ["wait", 2400], ["shot", "song-category"],
    ["js", "__t.q('.back').click()"], ["wait", 1500], ["shot", "home-3"],
  ],
  result: [
    ["wait", 3000], ["js", "demoBuild(true)"], ["until", "S.build && S.build.done", 30000], ["wait", 2500], ["js", "push(S.build.view)"], ["wait", 1500], B, ["shot", "built-card"],
  ],
  free: [
    ["wait", 3500], ["js", "__t.qa('.it')[0].click()"], ["wait", 1600], ["js", "__t.q('#newChat').click()"], ["until", "__t.q('.chips') && __t.idle()"], ["shot", "start"],
    ["js", "__t.qa('.chips button')[0].click()"], ["until", ASK], B, ["shot", "answer"],
    ["js", "__t.btn('带上')"], ["wait", 800], ["js", "__t.type('向量库怎么选')"], ["wait", 2500], B, ["shot", "typed"],
    ["js", "__t.q('.back').click()"], ["wait", 1500], ["shot", "category"],
  ],
  alldone: [
    ["wait", 3500], ["js", "S.courses.forEach((c) => { c.finished = true; c.due = []; }); renderHome(false)"], ["wait", 600], ["shot", "home"],
  ],
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(S);
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "drv-"))}`, "--no-first-run", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "about:blank"], { stdio: "ignore" });
let ver; for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(150); } }
const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === "Runtime.exceptionThrown") logs.push(d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text); if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") logs.push(d.params.args.map((a) => a.value || a.description).join(" ")); };
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
let bad = 0;
await Promise.all(names.map(async (name) => {
  const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
  const { result: { sessionId: s } } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, s); await send("Runtime.enable", {}, s);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s);
  await send("Emulation.setFocusEmulationEnabled", { enabled: true }, s);
  await send("Page.navigate", { url: URL0 }, s);
  await sleep(1500);
  const ev = async (ex) => { const r = await send("Runtime.evaluate", { expression: ex, awaitPromise: true, returnByValue: true }, s); if (r.result?.exceptionDetails) throw new Error(ex + " → " + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
  await ev(HELP);
  let n = 0;
  try {
    for (const [op, a, b] of S[name]) {
      if (op === "wait") await sleep(a);
      else if (op === "js") { await ev(a); await sleep(250); }
      else if (op === "until") { const t0 = Date.now(); while (!(await ev(`!!(${a})`))) { if (Date.now() - t0 > (b || 25000)) throw new Error("等不到：" + a); await sleep(200); } await sleep(300); }
      else if (op === "shot") { const { result } = await send("Page.captureScreenshot", { format: "png" }, s); const f = join(OUT, `${name}-${String(++n).padStart(2, "0")}-${a}.png`); writeFileSync(f, Buffer.from(result.data, "base64")); console.log("✓", f.replace(ROOT + "/", "")); }
    }
  } catch (e) { bad++; console.log(`✗ ${name}：${e.message}`); const { result } = await send("Page.captureScreenshot", { format: "png" }, s); writeFileSync(join(OUT, `${name}-FAIL.png`), Buffer.from(result.data, "base64")); }
}));
if (logs.length) { bad++; console.log("页面报错：\n" + logs.join("\n")); }
ws.close(); proc.kill();
process.exit(bad ? 1 : 0);
