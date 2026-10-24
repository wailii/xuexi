// 在真手机上测：通过 adb 转发的 WebView 调试口驱动 App 页面（手机自己的原生桥、网络、模型），
// 截图用手机截屏（adb screencap），按键（Home、返回）用 adb。
//   adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
//   node tools/phone.mjs settings lesson recall free build back
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "shots-phone"); mkdirSync(OUT, { recursive: true });
const DEV = process.env.DEV || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (...a) => execFileSync("adb", ["-s", DEV, ...a], { maxBuffer: 64 << 20 });
// 页面里的小工具和电脑上的剧本共用一份（drive2.mjs 里的 HELP）
const HELP = readFileSync(join(ROOT, "tools/drive2.mjs"), "utf8").match(/const HELP = (`[\s\S]*?`);/)[1];

let ws, id = 0;
const pend = new Map();
async function connect() {
  const pages = await (await fetch("http://127.0.0.1:9333/json")).json();
  ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (ex) => {
  const r = await send("Runtime.evaluate", { expression: ex, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(ex.slice(0, 80) + " → " + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
let n = 0;
const shot = (name) => { writeFileSync(join(OUT, `${String(++n).padStart(2, "0")}-${name}.png`), adb("exec-out", "screencap", "-p")); console.log("✓", name); };
const until = async (cond, ms = 180000) => {
  const t0 = Date.now();
  while (!(await ev(`!!(${cond})`))) {
    const e = await ev("__t.err()");
    if (e) throw new Error("页面出了错误卡：" + e.replace(/\s+/g, " ").slice(0, 200));
    if (Date.now() - t0 > ms) throw new Error("等不到：" + cond);
    await sleep(700);
  }
  await sleep(400);
};
const READY = "__t.ready()";
const js = async (ex, wait = 600) => { await ev(ex); await sleep(wait); };
async function loop(max, stop, mode) {
  for (let k = 0; k < max; k++) {
    await until(READY);
    if (stop && (await ev(`!!(${stop})`))) return;
    console.log("   第", k + 1, "步：", await ev(`__t.step(${mode ? JSON.stringify(mode) : ""})`));
    await sleep(900);
  }
}
const notifs = () => adb("shell", "dumpsys", "notification", "--noredact").toString().split("\n").filter((l) => /com\.xiaodeng\.xuexi/.test(l) || /android\.title=|android\.text=/.test(l)).join("\n");

const S = {
  // 设置页：试一下模型和联网搜索；把电脑上的两门课带进来
  async settings() {
    await js("__t.q('#gear').click()", 1500); shot("settings");
    await js("__t.q('#test').click()", 500);
    await until("/通了|没通/.test(__t.q('#msg').textContent) && !/在试/.test(__t.q('#msg').textContent)", 120000);
    console.log("   ", await ev("__t.q('#msg').textContent")); shot("settings-test");
    if (await ev("!!__t.q('#imp')")) await js("__t.q('#imp').click()", 1500);
    await js("__t.q('.back').click()", 1500); shot("home");
  },
  // 完整上一节（大模型 01）：中途打字问、点想不出来、故意答错、说我会了，一直到出分和笔记
  async lesson() {
    await js("[...__t.qa('.it')].find((x) => x.querySelector('h3').textContent === '大模型').click()", 2000); shot("category");
    await js("__t.q('#go').click()", 500);
    await until(READY); shot("open");
    await loop(3);
    await until(READY); await js("__t.type('这和让模型直接上网搜有什么区别？')"); await until(READY); shot("typed");
    await until(READY); await js("__t.live() && __t.live().querySelector('.stuck') ? __t.live().querySelector('.stuck').click() : __t.step('wrong')"); await until(READY); shot("stuck");
    await js("__t.step('wrong')"); await until(READY); shot("wrong");
    await loop(4);
    await until(READY); await js("__t.live() ? __t.step() : __t.type('我会了，直接考我吧')"); await until(READY); shot("quiz");
    await loop(14, "__t.q('.score')");
    await until("__t.q('.score') && __t.idle()"); await js("__t.bottom()", 800); shot("score");
    await js("__t.btn('回到课程')", 2200); shot("category-after");
  },
  // 回忆：翻笔记，先遮住要点，点开对；再让导师考一遍这一节
  async recall() {
    await js("__t.q('.nt').click()", 1500); shot("note");
    await js("__t.q('.recall .solid').click()", 1200); shot("note-open");
    await js("__t.q('#quiz').click()", 500);
    await loop(8, "__t.q('.chips') && __t.idle() && !__t.live()");
    await js("__t.bottom()", 800); shot("review");
    await js("popHome()", 1500);
  },
  // 随便问（算力）
  async free() {
    await js("[...__t.qa('.it')].find((x) => x.querySelector('h3').textContent === '算力').click()", 2000);
    await js("__t.q('#newChat').click()", 1500);
    await js("__t.type('国产卡调度和英伟达卡有什么不一样？')");
    await until("(__t.q('.ask:not(.done)') && __t.idle()) || (__t.idle() && __t.qa('.ans').length >= 2)", 240000);
    await js("__t.bottom()", 800); shot("free");
    await js("popHome()", 1500);
  },
  // 建课：说宋朝、打字纠正、要改方案，开始后按 Home 切到后台，看建课会不会停、通知来不来
  async build() {
    await js("document.getElementById('morph').click()", 1500);
    await until("__t.qa('.quick button').length && __t.idle()");
    await js("__t.type('宋朝')"); await until(READY); shot("build-q1");
    await js("__t.type('我是产品经理，想看懂宋朝为什么有钱却老打败仗，别讲太学术')"); await until(READY); shot("build-corrected");
    await loop(6, "__t.q('.ask:not(.done)')");
    await until(READY); shot("build-plan");
    await js("__t.q('.ask:not(.done) .yes').click()", 15000); shot("building");
    adb("shell", "input", "keyevent", "KEYCODE_HOME");
    await sleep(8000);
    console.log("   后台通知：\n" + notifs());
    shot("bg-notification");
    const t0 = Date.now();
    while (!(await ev("!!(S.build && (S.build.done || S.build.error))"))) { if (Date.now() - t0 > 900000) throw new Error("建课 15 分钟没完"); await sleep(5000); }
    console.log("   建完用了", Math.round((Date.now() - t0) / 1000), "秒（在后台）", await ev("S.build.error || ''"));
    await sleep(3000);
    console.log("   建完的通知：\n" + notifs());
    adb("shell", "cmd", "statusbar", "expand-notifications"); await sleep(1500); shot("done-notification"); adb("shell", "cmd", "statusbar", "collapse");
    adb("shell", "am", "start", "-n", "com.xiaodeng.xuexi/.MainActivity"); await sleep(2500);
    await js("stack.length > 1 && popHome()", 1500); shot("home-built");
    await js("document.getElementById('morph').click()", 500); await until(READY); shot("song-first");
    await loop(2);
    await js("popHome()", 1500);
  },
  // 返回键、键盘
  async back() {
    await js("[...__t.qa('.it')][0].click()", 1800);
    adb("shell", "input", "keyevent", "KEYCODE_BACK"); await sleep(1500);
    console.log("   返回键后页面层数：", await ev("stack.length"));
    await js("[...__t.qa('.it')][0].click()", 1800);
    await js("__t.q('#newChat').click()", 1500);
    await js("__t.top().querySelector('.comp input').focus()", 1500);
    adb("shell", "input", "tap", "540", "2200"); await sleep(1500); shot("keyboard");
    adb("shell", "input", "keyevent", "KEYCODE_BACK"); await sleep(800);
    adb("shell", "input", "keyevent", "KEYCODE_BACK"); await sleep(1200);
    console.log("   两次返回后页面层数：", await ev("stack.length"));
    await js("popHome()", 1200);
  },
};

await connect();
await ev(`eval(${HELP})`);
if (!(await ev("typeof __t === 'object'"))) throw new Error("小工具没放进页面");
let bad = 0;
for (const name of process.argv.slice(2)) {
  console.log("==", name);
  try { await S[name](); } catch (e) { bad++; console.log("✗", name, e.message); shot(name + "-FAIL"); }
}
const errs = adb("logcat", "-d", "-t", "3000").toString().split("\n").filter((l) => /chromium.*(Uncaught|Error)|AndroidRuntime|FATAL/i.test(l));
if (errs.length) console.log("logcat 报错：\n" + errs.slice(-15).join("\n"));
ws.close();
process.exit(bad ? 1 : 0);
