// 用无头 Chrome 按剧本把原型点一遍，每个关键状态截一张图
//   node tools/drive2.mjs lesson build free    （tools/dev.py 要先在 8971 端口跑着，用真模型）
// 截图存到 learning-app/shots2/<剧本>-<序号>-<名字>.png
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "shots2"); mkdirSync(OUT, { recursive: true });
const URL0 = process.env.URL || "http://127.0.0.1:8971/";
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 页面里的小工具：都在最上面那一页里找
const HELP = `window.__t = {
  top: () => stack[stack.length - 1],
  q: (s) => __t.top().querySelector(s),
  qa: (s) => [...__t.top().querySelectorAll(s)],
  live: () => { const l = __t.qa('.q.cur'); return l[l.length - 1]; },
  ch: () => __t.top()._chat,
  // 按题的定义答：good=true 答对，false 答错；有把握的题顺手点把握
  ans(good, k) {
    const c = __t.live(), d = __t.ch().curDef;
    if (d.type === 'sort') { c.querySelectorAll('.srow').forEach((r, i) => r.querySelector('[data-v="' + (good || i ? d.items[i][1] : (d.items[i][1] === 'L' ? 'R' : 'L')) + '"]').click()); c.querySelector('.solid').click(); return 'sort'; }
    const ops = [...c.querySelectorAll('.op:not(.tried)')];
    const o = d.right == null ? ops[0] : ops.find((o) => (o.dataset.k === d.right) === good) || ops[0];
    o.click();
    const cf = c.querySelector('.conf:not(.done)'); if (cf) cf.querySelector('[data-k="' + (k || 'med') + '"]').click();
    return o.dataset.k;
  },
  fixSort() { const c = __t.live(), d = __t.ch().curDef; c.querySelectorAll('.srow').forEach((r, i) => r.querySelector('[data-v="' + d.items[i][1] + '"]').click()); c.querySelector('.solid').click(); },
  pick(x, k) { const c = __t.live(); const o = [...c.querySelectorAll('.op:not(.tried)')].find((o) => o.dataset.k === x || o.querySelector('span').textContent === x); o.click(); const cf = c.querySelector('.conf:not(.done)'); if (cf && k) cf.querySelector('[data-k="' + k + '"]').click(); },
  btn(t, sel = 'button') { const b = __t.qa(sel).filter((b) => b.textContent.trim() === t).pop(); b.click(); },
  quick(t) { __t.btn(t, '.quick button'); },
  multi(n) { const c = __t.live(); [...c.querySelectorAll('.chk')].slice(0, n).forEach((b) => b.click()); c.querySelector('.solid').click(); },
  type(t) { const v = __t.top(); v.querySelector('.comp input').value = t; v.querySelector('.comp').requestSubmit(); },
  bottom() { const s = __t.q('.scroll'); s.scrollTop = s.scrollHeight; },
  idle() { const v = __t.top(); return !v.querySelector('.caret') && !v.querySelector('.st.run') && !v.querySelector('.waitline'); },
  // 走一步：有确认就点「开始/行」，有题就答（wrong 时故意答错），有建议回复点第一个，都没有就说「继续」
  step(mode) {
    const ask = __t.q('.ask:not(.done)'); if (ask) { ask.querySelector('.yes').click(); return 'ask'; }
    const c = __t.live();
    if (c) {
      if (c.querySelector('.srow')) { __t.fixSort(); return 'sort'; }
      if (c.querySelector('.ord')) { const bs = [...c.querySelectorAll('.oi')].sort((a, b) => a.dataset.i - b.dataset.i); (mode === 'wrong' ? bs.reverse() : bs).forEach((b) => b.click()); c.querySelector('.solid').click(); return 'order'; }
      if (c.querySelector('.mt')) { const n = c.querySelectorAll('[data-l]').length; for (let i = 0; i < n; i++) { c.querySelector('[data-l="' + i + '"]').click(); c.querySelector('[data-r="' + (mode === 'wrong' ? (i + 1) % n : i) + '"]').click(); } c.querySelector('.solid').click(); return 'match'; }
      if (c.querySelector('.exr')) { const r = c.querySelector('.exr'); r.value = 900; r.dispatchEvent(new Event('input')); c.querySelector('.solid').click(); return 'explore'; }
      if (c.querySelector('.chk')) { __t.multi(2); return 'multi'; }
      if (!c.querySelector('.op')) { __t.type(mode === 'wrong' ? '不太清楚' : '我理解是提前把重活做完，提问时只做轻的'); return 'open'; }
      return 'ans:' + __t.ans(mode !== 'wrong', 'med');
    }
    const qb = __t.qa('.quick button'); if (qb.length) { const t = qb[0].textContent; qb[0].click(); return 'chip:' + t; }
    __t.type(mode === 'wrong' ? '不太清楚' : '我想想，应该是检索把对的材料递给了模型'); return 'type';
  },
  ready() { const last = __t.q('.scroll')?.lastElementChild; return __t.idle() && !!(__t.live() || __t.q('.ask:not(.done)') || __t.qa('.quick button').length || __t.q('.score') || __t.q('.err') || (last && last.classList.contains('ans'))); },
  stage() { return __t.q('.phases span.on')?.textContent; },
  err() { try { return __t.q('.err')?.innerText || ''; } catch { return ''; } },
  text() { return __t.q('.scroll').innerText; },
};`;

const LIVE = "__t.live() && __t.idle()";
const READY = "__t.ready()";
const LONG = 180000;
const B = ["js", "__t.bottom()"];
const S = {
  // 首页空着 → 带上电脑上的课 → 学 RAG 第一节：模型每轮自己决定做什么；中途打字问一句、点一次想不出来、故意答错一次
  lesson: [
    ["wait", 2500], ["shot", "empty-home"],
    ["js", "__t.q('#imp').click()"], ["wait", 1500], ["shot", "imported"],
    ["js", "__t.qa('.it')[0].click()"], ["wait", 1800], ["shot", "category"],
    ["js", "__t.q('#go').click()"], ["until", READY, LONG], B, ["shot", "open"],
    ["loop", 3, ""],
    ["until", READY, LONG], ["js", "__t.live() ? __t.type('这和让模型直接上网搜有什么区别？') : __t.type('这和让模型直接上网搜有什么区别？')"], ["until", READY, LONG], B, ["shot", "typed"],
    ["until", READY, LONG], ["js", "__t.live() && __t.live().querySelector('.stuck') ? __t.live().querySelector('.stuck').click() : __t.step('wrong')"], ["until", READY, LONG], B, ["shot", "stuck"],
    ["js", "__t.step('wrong')"], ["until", READY, LONG], B, ["shot", "wrong"],
    ["js", "__t.qa('.quick button').length ? __t.type('我会了，直接考我吧') : __t.step()"], ["until", READY, LONG], B, ["shot", "ask-quiz"],
    ["loop", 12, "__t.q('.score')"],
    ["until", "__t.q('.score') && __t.idle()", LONG], B, ["shot", "score"],
    ["js", "__t.btn('回到课程')"], ["wait", 2200], ["shot", "category-after"],
    ["js", "__t.q('.nt').click()"], ["wait", 1500], ["shot", "note"],
    ["js", "__t.q('.recall .solid').click()"], ["wait", 1000], ["shot", "note-open"],
    ["js", "__t.q('.back').click()"], ["wait", 1200], ["js", "__t.q('.back').click()"], ["wait", 1500], ["shot", "home-after"],
  ],
  // 建课：说「中转站」→ 它问清是哪种 → 中途打字纠正 → 方案出来后打字要改 → 开始建
  build: [
    ["wait", 3000], ["js", "document.getElementById('morph').click()"], ["until", "__t.qa('.quick button').length && __t.idle()"], ["shot", "topic"],
    ["js", "__t.type('中转站')"], ["until", READY, LONG], B, ["shot", "first-question"],
    ["js", "__t.type('我说的是大模型 API 中转站，我是产品经理，想搞懂它怎么设计')"], ["until", READY, LONG], B, ["shot", "corrected"],
    ["loop", 6, "__t.q('.ask:not(.done)')"],
    ["until", READY, LONG], B, ["shot", "plan"],
    ["js", "__t.type('课名短一点，分类就叫中转站')"], ["until", "__t.q('.ask:not(.done)') && __t.idle()", LONG], B, ["shot", "plan-2"],
    ["js", "__t.q('.ask:not(.done) .yes').click()"], ["wait", 20000], B, ["shot", "building"],
    ["js", "__t.btn('先去忙别的')"], ["wait", 2500], ["shot", "home-bar"],
    ["until", "S.build && (S.build.done || S.build.error)", 900000], ["wait", 2000], ["shot", "home-built"],
    ["js", "document.getElementById('morph').click()"], ["until", READY, LONG], B, ["shot", "first-lesson"],
    ["js", "__t.q('.back').click()"], ["wait", 1200], ["js", "__t.qa('.it').at(-1).click()"], ["wait", 1800], ["shot", "new-category"],
  ],
  free: [
    ["wait", 3000], ["js", "__t.q('#imp').click()"], ["wait", 1200], ["js", "__t.qa('.it')[1].click()"], ["wait", 1800],
    ["js", "__t.q('#newChat').click()"], ["wait", 1500], ["js", "__t.type('国产卡调度和英伟达卡有什么不一样？')"], ["until", "(__t.q('.ask:not(.done)') && __t.idle()) || (__t.idle() && __t.qa('.ans').length >= 2)", LONG], B, ["shot", "answer"],
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
  const ev = async (ex) => { const r = await send("Runtime.evaluate", { expression: ex, awaitPromise: true, returnByValue: true }, s); if (r.result?.exceptionDetails) throw new Error(ex + " → " + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
  // 等页面里的脚本跑起来、首页推进页面栈了，再把小工具放进去
  for (let t0 = Date.now(); Date.now() - t0 < 30000; ) { if (await ev("typeof stack !== 'undefined' && stack.length > 0").catch(() => false)) break; await sleep(300); }
  await ev(HELP);
  let n = 0;
  try {
    for (const [op, a, b] of S[name]) {
      if (op === "wait") await sleep(a);
      else if (op === "js") { await ev(a); await sleep(250); }
      else if (op === "until") {
        const t0 = Date.now();
        while (!(await ev(`!!(${a})`))) {
          const e = await ev("__t.err()");
          if (e) throw new Error("页面出了错误卡：" + e.replace(/\s+/g, " ").slice(0, 200));
          if (Date.now() - t0 > (b || 25000)) throw new Error("等不到：" + a);
          await sleep(500);
        }
        await sleep(300);
      }
      else if (op === "loop") {
        for (let k = 0; k < a; k++) {
          const t0 = Date.now();
          while (!(await ev("__t.ready()"))) { if (Date.now() - t0 > LONG) throw new Error("等不到模型"); await sleep(600); }
          const e = await ev("__t.err()"); if (e) throw new Error("页面出了错误卡：" + e.replace(/\s+/g, " ").slice(0, 200));
          if (b && (await ev(`!!(${b})`))) break;
          const what = await ev("__t.step()");
          console.log(`  ${name} 第 ${k + 1} 步：${what}`);
          await sleep(800);
          const { result } = await send("Page.captureScreenshot", { format: "png" }, s);
          writeFileSync(join(OUT, `${name}-${String(++n).padStart(2, "0")}-step${k + 1}.png`), Buffer.from(result.data, "base64"));
        }
      }
      else if (op === "shot") { const { result } = await send("Page.captureScreenshot", { format: "png" }, s); const f = join(OUT, `${name}-${String(++n).padStart(2, "0")}-${a}.png`); writeFileSync(f, Buffer.from(result.data, "base64")); console.log("✓", f.replace(ROOT + "/", "")); }
    }
  } catch (e) { bad++; console.log(`✗ ${name}：${e.message}`); const { result } = await send("Page.captureScreenshot", { format: "png" }, s); writeFileSync(join(OUT, `${name}-FAIL.png`), Buffer.from(result.data, "base64")); }
}));
if (logs.length) { bad++; console.log("页面报错：\n" + logs.join("\n")); }
ws.close(); proc.kill();
process.exit(bad ? 1 : 0);
