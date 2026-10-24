const { springCurve } = Engines;
const LINEAR_OK = window.CSS?.supports?.("transition-timing-function", "linear(0, 1)");
const SOFT = LINEAR_OK ? springCurve(180, 24) : { easing: "cubic-bezier(.2,.9,.25,1.05)", ms: 760 };
const SNAP = LINEAR_OK ? springCurve(320, 26) : { easing: "cubic-bezier(.3,1.25,.5,1)", ms: 520 };
const app = document.getElementById("app"), views = document.getElementById("views"), morph = document.getElementById("morph");
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const ICON = {
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  chev: `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  go: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
};
const tick = () => { const d = new Date(); $("clock").textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
tick(); setInterval(tick, 10000);
// 提示是一张小黄条，啪地贴上来
function toast(t) {
  const x = $("toast"); x.innerHTML = "<span></span>"; x.firstChild.textContent = t;
  SK.paper(x, { tape: false }); x.classList.add("on"); SK.slap(x, -1.5);
  clearTimeout(x._t); x._t = setTimeout(() => x.classList.remove("on"), 2600);
}
// 引导用的小提示：一张带便利贴的小黄条，贴在它说的东西旁边；每条只出一次，点「知道了」收起
function tip(key, anchor, text, mode = "after") {
  const seen = Native.get("tips") || {};
  if (!anchor || !anchor.isConnected || seen[key] || anchor.closest(".view") !== stack[stack.length - 1]) return null;
  seen[key] = TODAY(); Native.set("tips", seen);
  const t = el("div", "tipk stick" + (mode === "above" ? " above" : ""), `<span class="em"></span><span class="tx">${esc(text)}</span><button class="x">知道了</button>`);
  if (mode === "above") { const v = anchor.closest(".view"), ar = anchor.getBoundingClientRect(), vr = v.getBoundingClientRect(); v.append(t); t.style.bottom = vr.bottom - ar.top + 10 + "px"; }
  else anchor.after(t);
  const m = new SK.Note(t.querySelector(".em"), 30, "happy");
  SK.paperStill(t, { tape: false }); SK.slap(t, -1); m.play("nm-hop", 700);
  const close = () => { t.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.94)" }], { duration: 200, fill: "forwards" }).onfinish = () => t.remove(); };
  t.querySelector(".x").onclick = close;
  if (mode === "above") setTimeout(() => t.isConnected && close(), 9000);
  return t;
}
// 分享版装上时没有模型和 Key：要用模型的地方先带去设置，别让人点进去再报错
// 用不用得了模型：自己在设置里填了就行；没填时看分享版的体验额度（建 1 门课、和导师聊 10 次）
// kind：build 建课（还要联网搜）、turn 上课说一轮、free 随便问（也要联网搜）
const ownCfg = (search) => { const c = Native.cfg(); return !c || (!!(c.llmUrl && c.llmModel && c.llmKey) && (!search || !!c.dsKey)); };
const usingTrial = () => !ownCfg() && !!Native.trial()?.has;
function allowed(kind) {
  if (ownCfg(kind !== "turn")) return true;
  const t = Native.trial();
  if (!t?.has || t.spent || ownCfg()) return false;
  return kind === "build" ? t.builds < t.maxBuilds : t.turns < t.maxTurns;
}
function needCfg(kind) {
  if (allowed(kind)) return false;
  const t = Native.trial();
  toast(t?.has && !ownCfg() ? (kind === "build" ? "体验额度里的 1 门课用过了，填自己的 Key 接着建" : "体验额度用完了，填自己的 Key 接着学") : !ownCfg() ? "先在设置里填模型的接口地址、模型名和 Key" : "这一步要联网搜，先在设置里填百炼 Key");
  push(SettingsView());
  return true;
}
// 用体验额度时，导师每说一轮记一次；用完了就停在这，引导去设置
function spendTurn(ch) {
  if (!usingTrial()) return true;
  if (!allowed("turn")) {
    ch.card(`<b>体验额度用完了</b><h5>和导师聊的 10 次用完了</h5><p>在设置里填上自己的模型 Key，就能接着学。学过的进度和笔记都留着。</p>`).then(() => ch.chips([{ t: "去设置", k: true, fn: () => push(SettingsView()) }]));
    return false;
  }
  Native.trialUse("turn");
  return true;
}
// 空着的地方：便利贴睡着
const mountEmpty = (root) => root.querySelectorAll(".empty .em:empty").forEach((h) => new SK.Note(h, 30, "sleep"));

// ── 日期：进度一律按本机日期算 ──
const dayStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const TODAY = () => dayStr(new Date());
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dayStr(d); };
const short = (s) => { const [, m, d] = s.split("-"); return `${+m}.${d}`; };
const WEEK = () => "周" + "日一二三四五六"[new Date().getDay()];

// ── 课程和进度 ──
// course:<id> 课程（目录、每节要学到什么、追问种子、出处）；progress:<id> 进度；sessions:<id> 对话记录；chat:<sid> 对话原样
const COVERS = { history: "song", physics: "physics", llm: "llm" };
// 封面：建课时生成的那张；内置课用打包的；都没有就按主题挑一张现成的（同一种棚拍静物风格）
const coverOf = (c) => Native.get("cover:" + c.id) || (c.id === BUILTIN ? "img/cover-rag-systems.jpg" : `img/cover-${COVERS[c.cover] || c.cover || "book"}.jpg`);
const isDone = (s) => s === "learned" || s === "mastered";
const STATE_TXT = { mastered: "掌握", learned: "学过", learning: "在学", available: "能学", locked: "没解锁" };
const S = { courses: [], build: null };

// 电脑上学习 skill 的两门课：不自动加，用户点了才带进来
// 内置的一门课：「大模型」（电脑上学习 skill 的 rag-systems）。新装的第一次打开就放进去，让新用户能直接学一节
const BUILTIN = "rag-systems";
function seedBuiltin() {
  if (Native.get("seeded")) return;
  const ids = Native.get("courses") || [], p = PACKS.find((x) => x.id === BUILTIN);
  if (p && !ids.includes(p.id)) { Native.set("course:" + p.id, { ...p, created: TODAY() }); ids.unshift(p.id); }
  Native.set("courses", ids); Native.set("seeded", true);
}
// 老版本会自动塞进这两门课：一节都没学过的先收起来（数据留着，点「带上电脑上的课」能加回来）；
// 建课时模型起的大分类名（几门课会撞成同一个「大模型」）换成课名冒号前那半截
function migrate() {
  seedBuiltin();
  if (Native.get("v2")) return;
  const ids = Native.get("courses");
  if (ids) {
    const keep = ids.filter((id) => id === BUILTIN || !PACKS.some((p) => p.id === id) || Object.values(Native.get("progress:" + id)?.nodes || {}).some((n) => n.status));
    for (const id of keep) {
      const c = Native.get("course:" + id);
      if (c && !PACKS.some((p) => p.id === id)) Native.set("course:" + id, { ...c, cat: c.title.split("：")[0].slice(0, 8) });
    }
    Native.set("courses", keep);
  }
  Native.set("v2", true);
}
function loadCourse(id) {
  const pack = Native.get("course:" + id);
  if (!pack) return null;
  const c = { ...pack, p: Native.get("progress:" + id) || { nodes: {}, miss: [] }, sessions: (Native.get("sessions:" + id) || []).map((x) => (x.done ? x : { ...x, tag: "没学完", done: true })) };
  c.list = pack.nodes;
  c.byId = Object.fromEntries(pack.nodes.map((n, i) => [n.id, { ...n, i }]));
  return c;
}
function loadAll() { S.courses = (Native.get("courses") || []).map(loadCourse).filter(Boolean); }
const num = (c, id) => pad2(c.byId[id].i + 1);
const saveP = (c) => Native.set("progress:" + c.id, c.p);
const statusOf = (c, id) => c.p.nodes[id]?.status;
function stateOf(c, id) {
  const s = statusOf(c, id);
  if (s) return s;
  return c.byId[id].deps.every((d) => !c.byId[d] || isDone(statusOf(c, d))) ? "available" : "locked";
}
const dueOf = (c) => c.list.filter((n) => { const s = c.p.nodes[n.id]; return s && isDone(s.status) && s.next && s.next <= TODAY(); }).map((n) => n.id);
const currentOf = (c) => (c.list.find((n) => stateOf(c, n.id) === "learning") || c.list.find((n) => stateOf(c, n.id) === "available"))?.id || null;
function counts(c) {
  let m = 0, l = 0;
  for (const n of c.list) { const s = statusOf(c, n.id); if (s === "mastered") m++; else if (s === "learned") l++; }
  return { m, l, done: m + l, total: c.list.length, due: dueOf(c).length };
}
const unlockedBy = (c, id) => c.list.filter((n) => n.deps.includes(id) && !statusOf(c, n.id) && n.deps.every((d) => isDone(statusOf(c, d)))).map((n) => num(c, n.id));
// 今天的新课名额：建课时说的每天时长，40 分钟的一天两节，其余一天一节；只复习的会话不占名额
const quotaOf = (c) => Math.max(1, Math.floor((c.minutes || 20) / 20));
const learnedN = (c) => c.sessions.filter((s) => s.date === TODAY() && s.kind === "lesson" && s.node && s.done && s.tag !== "没学完").length;
const learnedToday = (c) => learnedN(c) >= quotaOf(c);

// 记一次成绩：≥4 达标，连着两次（跨天）达标才算掌握；间隔 1 天、3 天、再按难度系数拉长（和电脑上 tutor.py 同一套）
function master(c, id, score, conf) {
  const s = c.p.nodes[id] || (c.p.nodes[id] = { reps: 0, interval: 0, ease: 2.5, streak: 0 });
  const today = TODAY();
  if (score >= 4) {
    s.streak = (s.streak || 0) + 1;
    s.status = s.streak >= 2 && s.streakDate && s.streakDate !== today ? "mastered" : s.status === "mastered" ? "mastered" : "learned";
    s.streakDate = today;
    s.interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.max(1, Math.round(s.interval * s.ease));
    s.reps++;
    s.ease = Math.min(3, Math.max(1.3, s.ease + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02))));
  } else {
    s.streak = 0; s.status = "learning"; s.reps = 0; s.interval = 1; s.ease = Math.max(1.3, s.ease - 0.2);
  }
  s.last = today; s.score = score; s.next = addDays(s.interval);
  if (conf) (s.conf || (s.conf = [])).push([today, score, conf]);
  saveP(c);
  return s;
}
function addMiss(c, id, text) { c.p.miss.push({ node: id, text, open: true, date: TODAY() }); saveP(c); }
function clearMiss(c, id) { c.p.miss.forEach((m) => { if (m.node === id) m.open = false; }); saveP(c); }
function saveSession(c, s, html) {
  if (html != null) s.saved = true;
  const i = c.sessions.findIndex((x) => x.id === s.id);
  i >= 0 ? (c.sessions[i] = s) : c.sessions.unshift(s);
  Native.set("sessions:" + c.id, c.sessions.slice(0, 200));
  if (html != null) Native.set("chat:" + s.id, html);
}

// ── 页面栈：右进右出，弹簧推 ──
const stack = [];
const viewEl = (cls) => el("section", "view " + cls);
// 「新课」按钮浮在首页上面一层，翻页时跟首页用同一段动画一起滑走、滑回来，别留在原地慢慢淡掉
function morphWithHome(out) {
  // 新的一页从右边盖过来，按钮要在它盖到之前就淡完；回来时等首页快到位了再淡出来
  const dx = -0.24 * app.offsetWidth;
  const kf = out
    ? [{ transform: "none", opacity: 1 }, { opacity: 0, offset: 0.4 }, { transform: `translateX(${dx}px)`, opacity: 0 }]
    : [{ transform: `translateX(${dx}px)`, opacity: 0 }, { opacity: 0, offset: 0.55 }, { transform: "none", opacity: 1 }];
  morph.getAnimations().forEach((a) => a.cancel());
  morph.style.transition = "none";
  const a = morph.animate(kf, { duration: SOFT.ms * 0.9, easing: SOFT.easing, fill: "forwards" });
  a.onfinish = () => { a.cancel(); morph.style.transition = ""; };
}
// 兜底：翻到的这一页过一会儿还没摆正（个别手机内核的动画没跑完、被打断），直接摆正，别留白屏
const settle = (v) => setTimeout(() => {
  if (stack[stack.length - 1] !== v) return;
  try { v.getAnimations().forEach((a) => a.cancel()); } catch {}
  v.style.opacity = ""; v.style.transform = ""; v.style.visibility = ""; v.inert = false;
  if (!v.isConnected) views.append(v);
  // 不在栈里、也不在退场的页（退场动画没跑完没拿掉的）拿掉，别盖在上面
  [...views.children].forEach((n) => { if (!stack.includes(n) && !(n._leftAt && performance.now() - n._leftAt < 600)) n.remove(); });
  for (const n of [app, views, v]) { n.scrollLeft = 0; n.scrollTop = 0; }
  // 有的手机内核动画放完后合成层停在透明，样式算出来又没变、不会重画：轻改一下透明度逼它重画
  v.style.opacity = "0.99"; requestAnimationFrame(() => requestAnimationFrame(() => (v.style.opacity = "")));
}, SOFT.ms + 300);
function push(v) {
  const prev = stack[stack.length - 1];
  if (prev && prev === homeV) morphWithHome(true);
  try { v.getAnimations().forEach((x) => x.cancel()); } catch {}
  v.style.visibility = ""; v._leftAt = 0;
  views.append(v); stack.push(v);
  const sc = v.querySelector(".scroll");
  if (sc && v._scroll != null) sc.scrollTop = v._scroll;
  if (v._chat) requestAnimationFrame(() => v._chat.rephase());
  if (prev) {
    prev.inert = true;
    v.animate([{ transform: "translateX(100%)" }, { transform: "none" }], { duration: SOFT.ms, easing: SOFT.easing });
    // 底下这页只在翻页时淡出去，不用 fill 留住透明的样子（回来时取消它再淡入，个别手机会卡在透明）；翻完被盖住了就藏起来
    const out = prev.animate([{ transform: "none", opacity: 1 }, { transform: "translateX(-24%)", opacity: 0 }], { duration: SOFT.ms, easing: SOFT.easing });
    out.onfinish = () => { if (stack[stack.length - 1] !== prev) prev.style.visibility = "hidden"; };
  }
  v.onenter?.();
  syncMorph();
  settle(v);
}
function pop() {
  if (stack.length < 2) return false;
  if ($("sheet").classList.contains("on")) { $("sheet").classList.remove("on"); return true; }
  const v = stack.pop(), prev = stack[stack.length - 1];
  v._scroll = v.querySelector(".scroll")?.scrollTop;
  prev.inert = false;
  try { prev.getAnimations().forEach((a) => a.cancel()); } catch {}
  prev.style.visibility = "";
  prev.animate([{ transform: "translateX(-24%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: SOFT.ms * 0.9, easing: SOFT.easing });
  if (prev === homeV) morphWithHome(false);
  v._leftAt = performance.now();
  const a = v.animate([{ transform: "none" }, { transform: "translateX(100%)" }], { duration: 380, easing: "cubic-bezier(.3,0,.2,1)", fill: "forwards" });
  // 退出去的这一页滑完再拿掉；要是这期间又被打开了（退出来马上又点「接着上课」），别把它拿掉
  a.onfinish = () => { if (!stack.includes(v)) v.remove(); a.cancel(); };
  prev.onback?.();
  syncMorph();
  settle(prev);
  return true;
}
function popHome() {
  while (stack.length > 2) { const v = stack.splice(stack.length - 2, 1)[0]; v._scroll = v.querySelector(".scroll")?.scrollTop; v.remove(); }
  pop();
}
window.__back = () => pop();
document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop(); });
// 输入框获得焦点时，浏览器会把 overflow:hidden 的外框也卷上去露出输入框，键盘收起后不卷回来，整页就顶进了状态栏。外框横竖都只许停在 0
document.addEventListener("scroll", (e) => { const t = e.target; if (t instanceof Element && (t === app || t.classList.contains("views") || t.classList.contains("view")) && (t.scrollTop || t.scrollLeft)) { t.scrollTop = 0; t.scrollLeft = 0; } }, true);
addEventListener("resize", () => { if (app.scrollTop) app.scrollTop = 0; });
window.__insets = (top, bottom) => { document.documentElement.classList.add("app"); app.style.setProperty("--top", top + "px"); app.style.setProperty("--bot", bottom + "px"); requestAnimationFrame(syncMorph); };

// 大字遮罩升起
const masks = (t) => [...t].map((ch) => `<span class="mask"><span>${esc(ch)}</span></span>`).join("");
function reveal(root, start, gap = 70) {
  root.querySelectorAll(".mask > span").forEach((s, i) => s.animate([{ transform: "translateY(105%)" }, { transform: "none" }], { duration: SOFT.ms, easing: SOFT.easing, delay: start + i * gap, fill: "both" }));
}
function rise(nodes, start, gap = 60) {
  [...nodes].forEach((n, i) => n.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: SOFT.ms, easing: SOFT.easing, delay: start + i * gap, fill: "backwards" }));
}
const growBars = (root, delay = 0) => root.querySelectorAll(".bar i").forEach((b, i) => b.animate([{ transform: "scaleX(0)" }, { transform: b.style.transform }], { duration: SNAP.ms * 1.4, easing: SNAP.easing, delay: delay + i * 90, fill: "backwards" }));

// ── 首页 ──
let homeV;
// 今天要做的事：每门课有到期复习、或今天还没学新的一节，就列一行；正在上的课排最前
function todayTasks() {
  return S.courses.map((c) => {
    const due = dueOf(c), cid = currentOf(c), freshN = cid ? Math.max(0, quotaOf(c) - learnedN(c)) : 0;
    const sv = !(c.live && !c.live.done) && Native.get("live:" + c.id);
    if ((c.live && !c.live.done) || (sv?.html && (!sv.nid || !isDone(statusOf(c, sv.nid))))) return { c, text: "接着上课 · " + (c.live?.title || sv.title), min: 10, n: Math.max(1, due.length + freshN), live: true };
    const parts = [];
    if (due.length) parts.push(`复习 ${due.length} 节`);
    if (freshN) parts.push(`学 ${num(c, cid)} ${c.byId[cid].title}${freshN > 1 ? `（今天 ${freshN} 节）` : ""}`);
    return parts.length ? { c, text: parts.join(" · "), min: due.length * 2 + freshN * 15, n: due.length + freshN } : null;
  }).filter(Boolean).sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0));
}
function Home() {
  const v = viewEl("home pre");
  v.innerHTML = `<header class="top"><div class="htl" id="hHead"></div><div class="acts"><button class="hbtn" id="gear" aria-label="设置">${ICON.gear}</button><div class="slot" id="slot"></div></div><span class="hnote" id="hNote"></span></header>
    <main class="scroll"><div id="hHero"></div><div class="sect" id="hSect"></div><div id="hList"></div></main>`;
  homeV = v;
  v.note = new SK.Note(v.querySelector("#hNote"), 58);
  v.note.host.onclick = () => {
    const n = v.note, back = n.expr;
    n.set("happy").play("nm-hop", 700); Native.vibrate(10);
    SK.bubble(n.host, noteLine(v._left, v._min), v);
    setTimeout(() => n.expr === "happy" && n.set(back), 1500);
  };
  v.querySelector("#gear").onclick = () => push(SettingsView());
  v.onback = () => renderHome(false);
  return v;
}
// 便利贴说的话
const noteLine = (left, min) => !S.courses.length ? "点右上角，说说想学什么" : !left ? "今天这张可以撕了" : left === 1 ? `最后一节，${min} 分钟` : `${left} 节，${min} 分钟左右`;
// 左上角手写「还剩几节」：学完一节就把旧数划掉、旁边改写新数；全学完写「今天学完了」打个勾
function renderHead(v, tasks, first) {
  const left = tasks.reduce((a, t) => a + t.n, 0), min = tasks.reduce((x, t) => x + t.min, 0), d = TODAY();
  let day = Native.get("day");
  if (!day || day.date !== d) day = { date: d, seen: [] };
  const last = day.seen[day.seen.length - 1], fewer = last != null && left < last;
  if (last == null || left > last) day.seen = [left];
  else if (fewer) day.seen.push(left);
  Native.set("day", day);
  // 只有少了一节（刚学完）才划掉、说话；变多了（新到期的复习、新建的课）直接改写
  const seen = day.seen.slice(-3), key = seen.join(","), changed = v._seen != null && fewer;
  v._seen = key; v._left = left; v._min = min;
  const head = v.querySelector("#hHead"), date = `<div class="hd">${short(d)} ${WEEK()}</div>`;
  if (!S.courses.length) head.innerHTML = `${date}<div class="hand">还没有课</div>`;
  else if (left) head.innerHTML = `${date}<div class="hand"><span>还剩</span>${seen.slice(0, -1).map((n) => `<span class="n struck">${n}</span>`).join("")}<span class="n now">${left}</span><span>节</span></div><div class="hsub"><span class="hl">大约 ${min} 分钟</span></div>`;
  else head.innerHTML = `${date}<div class="hand">今天学完了<span class="ck"></span></div><div class="hsub">想多学一节，去下面的分类</div>`;
  const draw = () => {
    const st = head.querySelectorAll(".n.struck");
    st.forEach((n, i) => SK.strike(n, changed && i === st.length - 1 ? 380 : 0));
    const now = head.querySelector(".n.now"); if (now) setTimeout(() => SK.circle(now, first || changed ? 560 : 0), changed ? 420 : first ? 700 : 0);
    const hl = head.querySelector(".hl"); if (hl) SK.marker(hl);
    const ck = head.querySelector(".ck"); if (ck) SK.check(ck, first || changed ? 520 : 0);
  };
  Promise.race([document.fonts.load('42px Hand', "还剩节0123456789").then(() => document.fonts.load('16px Hand', "大约分钟")), sleep(1500)]).then(() => requestAnimationFrame(draw));
  const note = v.note, idle = S.courses.length && !left ? "sleep" : "idle";
  note.set(idle); note.host.classList.toggle("nm-sway", idle === "idle");
  if (changed) setTimeout(() => {
    note.set(left ? "happy" : "sleep").play("nm-hop", 700);
    SK.bubble(note.host, left ? `划掉一节，还剩 ${left} 节` : "今天这张可以撕了", v);
    if (left) setTimeout(() => note.expr === "happy" && note.set("idle"), 1800);
  }, 600);
}
function renderHome(first) {
  const v = homeV, hero = v.querySelector("#hHero"), tasks = todayTasks();
  renderHead(v, tasks, first);
  Widget.push(v._left, v._min, tasks[0] ? `${tasks[0].c.cat} · ${tasks[0].text}` : "");
  const seen = Native.get("tips") || {}, hello = !seen.welcome;
  v.note.host.hidden = hello || !S.courses.length;
  const noCfg = !allowed("turn"), trial = usingTrial() && Native.trial();
  const welcome = !hello ? "" : noCfg
    ? `<section class="welcome stick big"><span class="wm"></span><h5>我是便利贴</h5><p>先填一下模型：在设置里填接口地址、模型名、Key 和百炼 Key，填好就能开始学。</p><div class="wb"><button class="solid" id="wCfg">去设置</button></div></section>`
    : `<section class="welcome stick big"><span class="wm"></span><h5>我是便利贴</h5><p>${S.courses.length ? "先放了一门「大模型」，可以直接学一节试试。想学别的，跟我说。" : "说说想学什么，我去查资料排成课。"}</p><div class="wb">${S.courses.length ? `<button class="solid" id="wTry">先学一节</button>` : ""}<button class="${S.courses.length ? "ghost" : "solid"}" id="wGo">说说想学什么</button></div>${trial ? `<small class="wq">先送你：建 1 门课、和导师聊 10 次，不用填 Key</small>` : ""}</section>`;
  if (tasks.length) {
    hero.innerHTML = `${welcome}<section class="today"><div class="sect lab">今天</div>
      <div class="todos">${tasks.map((t, i) => `<button class="todo press ${i ? "" : "k"}" data-c="${t.c.id}"><div><b>${esc(t.c.cat)}</b><span>${esc(t.text)}</span></div><i>${ICON.go}</i></button>`).join("")}</div></section>`;
    hero.querySelectorAll(".todo").forEach((b) => (b.onclick = () => openLesson(S.courses.find((c) => c.id === b.dataset.c))));
  } else hero.innerHTML = welcome;
  const w = hero.querySelector(".welcome");
  if (w) {
    const wm = new SK.Note(hero.querySelector(".wm"), 64, "happy");
    requestAnimationFrame(() => { SK.paper(w); SK.slap(w, -0.8); setTimeout(() => wm.play("nm-hop", 700), 500); setTimeout(() => wm.set("idle"), 1800); });
    const done = () => { const t = Native.get("tips") || {}; t.welcome = TODAY(); Native.set("tips", t); };
    hero.querySelector("#wCfg")?.addEventListener("click", () => push(SettingsView()));
    hero.querySelector("#wGo")?.addEventListener("click", () => { done(); openBuild(); });
    hero.querySelector("#wTry")?.addEventListener("click", () => { done(); openLesson(S.courses.find((c) => c.id === BUILTIN) || S.courses[0]); });
  }
  if (tasks.length && !hello) setTimeout(() => tip("home-todo", hero.querySelector(".todos"), "今天要学的都在这，点开就上课") || tip("home-head", v.querySelector(".hsub"), "学完一节，我就把上面的数划掉一个"), first ? 1800 : 400);
  v.querySelector("#hSect").innerHTML = S.courses.length ? `分类 ${S.courses.length}` : "";
  const list = v.querySelector("#hList");
  list.innerHTML = S.courses.map((c, i) => {
    const k = counts(c);
    return `<div class="it" data-c="${c.id}"><div class="no">${pad2(i + 1)}</div><div><h3>${esc(c.cat)}</h3><div class="sub">${esc(c.title)}</div>
      <div class="meta"><span class="bar"><i style="transform:scaleX(${(k.done / k.total).toFixed(3)})"></i></span><span>${k.done} / ${k.total} 节</span>${k.due ? `<span>·</span><span class="acc">复习 ${k.due}</span>` : ""}${c.isNew ? `<span>·</span><span class="acc">新</span>` : ""}</div></div>${ICON.chev}</div>`;
  }).join("");
  list.querySelectorAll(".it").forEach((row) => (row.onclick = () => push(CatView(S.courses.find((c) => c.id === row.dataset.c)))));
  if (first) {
    rise(v.querySelector("#hHead").children, 120, 90);
    v.note.host.animate([{ transform: "rotate(7deg) scale(0)" }, { transform: "rotate(7deg) scale(1)" }], { duration: 520, delay: 650, easing: "cubic-bezier(.3,1.5,.5,1)", fill: "backwards" });
    const shot = v.querySelector("#shot");
    if (shot) setTimeout(() => {
      shot.animate([{ clipPath: "inset(46% 46% 46% 46% round 999px)" }, { clipPath: "inset(0 0 0 0 round 28px)" }], { duration: SOFT.ms * 1.2, easing: SOFT.easing, fill: "forwards" });
      shot.querySelector("img").animate([{ transform: "scale(1.18)" }, { transform: "none" }], { duration: 2400, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
    }, 380);
    rise(v.querySelectorAll(".hero h2, .hero p, .hero .lab, .today .lab, .todo"), 620, 90);
    rise(list.children, 1150, 90);
    growBars(list, 1400);
    setTimeout(() => v.classList.remove("pre"), 2600);
  } else {
    v.classList.remove("pre");
    const fresh = S.courses.find((c) => c.fresh);
    if (fresh) { fresh.fresh = false; const row = list.querySelector(`[data-c="${fresh.id}"]`); if (row) { rise([row], 250); growBars(row, 400); } }
  }
}

// ── 会变形的元素：新课按钮 ⇄ 建课进度条（弹簧推位置、宽高、圆角） ──
const MS = {}; let mraf = 0, mlast = 0;
function morphRect(mode) {
  const A = app.getBoundingClientRect();
  // 按排版位置算（offsetLeft/Top 一路加到 .app），页面正在滑进滑出时的 transform 不算进去，不然退得快了按钮会停在半路
  if (mode === "pill") {
    const slot = $("slot"); if (!slot || !slot.offsetWidth) return null;
    let x = 0, y = 0, n = slot;
    while (n && n !== app) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y, w: slot.offsetWidth, h: slot.offsetHeight, r: slot.offsetHeight / 2 };
  }
  const bot = parseFloat(getComputedStyle(app).getPropertyValue("--bot")) || 0;
  return { x: 14, y: A.height - 24 - bot - 64, w: A.width - 28, h: 64, r: 32 };
}
function setMorph(t, jump, k = 240, c = 25) {
  for (const key of ["x", "y", "w", "h", "r"]) {
    MS[key] = MS[key] || { x: t[key], v: 0 };
    Object.assign(MS[key], { t: t[key], k: key === "w" ? k * 0.8 : k, c });
    if (jump) { MS[key].x = t[key]; MS[key].v = 0; }
  }
  if (jump) drawMorph(); else if (!mraf) mraf = requestAnimationFrame(tickMorph);
}
function drawMorph() { Object.assign(morph.style, { left: MS.x.x + "px", top: MS.y.x + "px", width: MS.w.x + "px", height: MS.h.x + "px", borderRadius: Math.min(MS.r.x, MS.h.x / 2) + "px" }); }
function tickMorph(now) {
  const dt = Math.min(1 / 30, mlast ? (now - mlast) / 1000 : 1 / 60); mlast = now; let busy = false;
  for (const s of Object.values(MS)) {
    for (let i = 0; i < 4; i++) { const a = -s.k * (s.x - s.t) - s.c * s.v; s.v += (a * dt) / 4; s.x += (s.v * dt) / 4; }
    if (Math.abs(s.x - s.t) > 0.05 || Math.abs(s.v) > 0.05) busy = true; else { s.x = s.t; s.v = 0; }
  }
  drawMorph();
  if (busy) mraf = requestAnimationFrame(tickMorph); else { mraf = 0; mlast = 0; }
}
let morphMode = "";
function syncMorph() {
  const onHome = stack[stack.length - 1] === homeV;
  const B = S.build, mode = B && B.started && !B.viewed ? "bar" : "pill";
  morph.classList.toggle("away", !onHome);
  morph.classList.toggle("open", mode === "bar");
  morph.classList.toggle("done", !!(B && B.done));
  if (B && B.started) {
    const frac = B.done ? 1 : Math.min(0.98, (B.step - 1 + (B.frac || 0)) / 5);
    $("ringFg").style.strokeDashoffset = (106.8 * (1 - frac)).toFixed(1);
    $("ringN").textContent = B.step;
    const ex = B.error ? "wrong" : B.done ? "happy" : "think";
    if (!morph._note) morph._note = new SK.Note($("mNote"), 36, ex);
    if (morph._ex !== ex) { morph._note.set(ex); $("mNote").classList.toggle("nm-think", ex === "think"); if (morph._ex) morph._note.play("nm-hop", 700); morph._ex = ex; }
    $("mTop").textContent = B.error ? "建课停了 · 点开重试" : B.done ? `建好了 · ${B.total} 节` : `建课中 · 第 ${B.step} / 5 步`;
    $("mName").textContent = B.done ? B.plan.title : `${B.plan.title} · ${B.stepName || ""}`;
  }
  const t = morphRect(mode);
  if (!t) return;
  const animate = onHome && morphMode && morphMode !== mode;
  if (mode === "bar") setMorph(t, !animate, 200, 22); else setMorph(t, !animate, 260, 26);
  morphMode = mode;
}
morph.addEventListener("click", () => {
  const B = S.build;
  if (B && B.started && !B.viewed) { if (B.done) { const c = markViewed(); c && openLesson(c); } else openBuild(); }
  else openBuild();
});
addEventListener("resize", () => requestAnimationFrame(syncMorph));

// ── 分类页 ──
function CatView(c) {
  const v = viewEl("cat pre");
  v._course = c.id;
  const wide = c.list.length <= 24;
  v.innerHTML = `<div class="nav"><button class="back">${ICON.back}</button></div>
    <main class="scroll">
      <div class="ccover"><img src="${coverOf(c)}" alt=""></div>
      <div class="top"><div><h1 class="big" id="catName">${masks(c.cat)}</h1><div class="live"><span>${esc(c.title)} · ${c.list.length} 节</span></div>
        <div class="origin">${c.from ? "" : `${c.created ? short(c.created) + " " : ""}你建的，联网查了 ${new Set(c.list.flatMap((n) => n.anchors.map((a) => a.url))).size} 个来源`}<button class="lnk" id="ren">改名</button></div></div></div>
      <button class="go press" id="go"></button>
      <section class="prog">
        <div class="stats"><div><div class="n"></div><div class="l">掌握</div></div><div><div class="n"></div><div class="l">学过</div></div><div><div class="n"></div><div class="l">今天复习</div></div></div>
        <div class="rule">学完一节、小测 4 分以上算学过；隔天复习再过一次算掌握。</div>
        <div class="map ${wide ? "wide" : ""}">${c.list.map((n) => `<button class="cell" data-id="${n.id}"></button>`).join("")}</div>
        <div class="legend"><span><i style="background:var(--ink)"></i>掌握</span><span><i style="background:#b9b9bd"></i>学过</span><span><i style="background:var(--acc)"></i>在学</span><span><i style="background:#fff;box-shadow:inset 0 0 0 1.5px var(--ink)"></i>能学</span><span><i></i>没解锁</span></div>
        <div class="mapcap" id="cap"></div>
      </section>
      <nav class="seg two" id="seg"><i class="ind"></i><button data-t="c">对话<em id="cvn"></em></button><button data-t="n">笔记<em id="ntn"></em></button></nav>
      <div class="pager" id="pager">
        <section class="pane" data-t="c"><button class="ghost newc" id="newChat">${ICON.plus}新对话</button><div id="cvs"></div></section>
        <section class="pane" data-t="n"><div id="nts"></div></section>
      </div>
    </main>`;
  // 对话、笔记两页左右滑：荧光笔的两条边各走各的，往哪边切，那一边先到，看着被拉长
  const seg = v.querySelector("#seg"), ind = seg.querySelector(".ind"), tabs = [...seg.querySelectorAll("button")];
  const pager = v.querySelector("#pager"), panes = [...pager.children];
  let tab = c._tab === "n" ? "n" : "c", lastL = null;
  const place = (jump) => {
    const b = tabs.find((x) => x.dataset.t === tab), sr = seg.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (!sr.width) return;
    const L = br.left - sr.left, R = sr.right - br.right, right = lastL != null && L > lastL;
    ind.style.transition = jump || lastL == null ? "none" : `left ${right ? 520 : 300}ms ${SNAP.easing}, right ${right ? 300 : 520}ms ${SNAP.easing}`;
    ind.style.left = L + "px"; ind.style.right = R + "px"; lastL = L;
  };
  // 两页高矮不一：外框跟着当前这一页的高度，别让短的那页底下空一大块
  const fit = () => { const p = panes.find((x) => x.dataset.t === tab); if (p) pager.style.height = p.offsetHeight + "px"; };
  const pick = (t, jump) => {
    tab = c._tab = t;
    tabs.forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    place(jump); fit();
  };
  const goTab = (t, jump) => { pager.scrollTo({ left: panes.findIndex((p) => p.dataset.t === t) * pager.clientWidth, behavior: jump ? "auto" : "smooth" }); pick(t, jump); };
  tabs.forEach((b) => (b.onclick = () => goTab(b.dataset.t)));
  pager.addEventListener("scroll", () => { const t = panes[Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth))]?.dataset.t; if (t && t !== tab) pick(t); }, { passive: true });
  const ro = new ResizeObserver(fit); panes.forEach((x) => ro.observe(x));
  requestAnimationFrame(() => goTab(tab, true));
  setTimeout(() => tip("cat-tabs", seg, "聊过的在这，往左滑是笔记"), 900);
  v.querySelector(".back").onclick = pop;
  const cap = v.querySelector("#cap");
  let sel = null;
  const show = (id) => {
    sel = id;
    v.querySelectorAll(".cell").forEach((x) => x.classList.toggle("sel", x.dataset.id === id));
    const s = stateOf(c, id), n = c.byId[id], due = dueOf(c).includes(id);
    cap.innerHTML = `<b>${num(c, id)}</b>${esc(n.title)}<small>${STATE_TXT[s]}${due ? " · 今天到期" : ""}${s === "locked" ? ` · 要先学 ${n.deps.filter((d) => c.byId[d]).map((d) => num(c, d)).join("、")}` : ""}</small>`;
    const carried = c.p.carry?.[id] || [];
    if (carried.length) { const st = el("div", "stick", `<b>挂在这一节的问题</b>${carried.map(esc).join("<br>")}`); cap.append(st); SK.paperStill(st, { tape: false }); SK.slap(st); }
  };
  v.querySelectorAll(".cell").forEach((x) => (x.onclick = () => show(x.dataset.id)));
  const fill = () => {
    const k = counts(c), due = dueOf(c), cid = currentOf(c);
    v.querySelectorAll(".stats .n").forEach((n, i) => { n.textContent = [k.m, k.l, k.due][i]; n.classList.toggle("acc", i === 2 && k.due > 0); });
    v.querySelectorAll(".cell").forEach((x) => { x.className = `cell ${stateOf(c, x.dataset.id)} ${due.includes(x.dataset.id) ? "due" : ""} ${c.p.carry?.[x.dataset.id]?.length ? "carry" : ""}`; });
    if (sel) show(sel);
    const go = v.querySelector("#go"), live = c.live && !c.live.done;
    let main, sub;
    if (live) { main = "接着上课"; sub = c.live.title; }
    else if (cid) { const cur = c.byId[cid]; main = `${stateOf(c, cid) === "learning" ? "接着学" : "开始学"} ${num(c, cid)} ${cur.title}`; sub = `${due.length ? `先复习 ${due.length} 节 · ` : ""}大约 15 分钟`; }
    else if (due.length) { main = `复习 ${due.length} 节`; sub = "这门课都学过了"; }
    else { main = "这门课学完了"; sub = "到期了会提醒你复习"; }
    go.innerHTML = `<div><span>${esc(main)}</span><small>${esc(sub)}</small></div><i>${ICON.go}</i>`;
    go.onclick = () => (cid || due.length || live ? openLesson(c) : toast("这门课学完了"));
    const notes = Native.get("notes:" + c.id) || {}, nl = c.list.filter((n) => notes[n.id]);
    v.querySelector("#ntn").textContent = nl.length ? " " + nl.length : "";
    v.querySelector("#nts").innerHTML = nl.length ? nl.map((n) => `<div class="nt" data-n="${n.id}"><b>${num(c, n.id)}</b><span>${esc(n.title)}</span><em>${short(notes[n.id].date)} · ${notes[n.id].score} 分</em></div>`).join("") : `<div class="empty"><span class="em"></span>学完一节，这里会留一张笔记</div>`;
    mountEmpty(v);
    v.querySelectorAll(".nt").forEach((row) => (row.onclick = () => push(NoteView(c, row.dataset.n))));
    const liveSid = Native.get("live:" + c.id)?.sid;
    const rows = c.sessions.filter((s) => s.id === liveSid || !(s.tag === "没学完" && !s.saved && !s.sum?.length && !c.free?.[s.id]));
    v.querySelector("#cvn").textContent = rows.length ? " " + rows.length : "";
    const box = v.querySelector("#cvs");
    box.innerHTML = rows.length ? rows.map((r, i) => `<div class="cv" data-i="${i}"><div class="d ${r.date === TODAY() ? "now" : ""}">${r.date === TODAY() ? "今天" : short(r.date)}</div><h4>${esc(r.title)}</h4><div class="tg ${r.done ? "" : "acc"}">${esc(r.tag || "")}</div>${r.sum?.length ? `<div class="more"><div><ul>${r.sum.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div></div>` : ""}</div>`).join("") : `<div class="empty"><span class="em"></span>还没有对话</div>`;
    mountEmpty(box);
    box.querySelectorAll(".cv").forEach((row) => (row.onclick = () => openSession(c, rows[+row.dataset.i], row)));
  };
  fill();
  v.querySelector("#newChat").onclick = () => openFree(c);
  v.querySelector("#ren").onclick = () => {
    const h = v.querySelector("#catName");
    h.outerHTML = `<div class="renbox" id="catName"><input value="${esc(c.cat)}" maxlength="8"><button class="solid">好</button></div>`;
    const box = v.querySelector("#catName"), inp = box.querySelector("input");
    inp.focus(); inp.select();
    const save = () => {
      const name = inp.value.trim().slice(0, 8) || c.cat;
      c.cat = name;
      Native.set("course:" + c.id, { ...Native.get("course:" + c.id), cat: name });
      box.outerHTML = `<h1 class="big" id="catName">${masks(name)}</h1>`;
    };
    box.querySelector("button").onclick = save;
    inp.onkeydown = (e) => { if (e.key === "Enter") save(); };
  };
  v.onback = fill;
  v.onenter = () => {
    reveal(v.querySelector("h1"), 140, 80);
    rise(v.querySelectorAll(".live, .stats > div"), 260, 70);
    v.querySelectorAll(".cell").forEach((x, i) => x.animate([{ transform: "scale(0)" }, { transform: "none" }], { duration: SNAP.ms, easing: SNAP.easing, delay: 420 + Math.min(i, 60) * 9, fill: "backwards" }));
    rise(v.querySelectorAll(".go, .seg, .legend, .mapcap, .rule"), 360, 50);
    requestAnimationFrame(() => place(true));
    setTimeout(() => v.classList.remove("pre"), 1600);
  };
  return v;
}
// 点一条对话：正在进行的回到那页；做完的展开要点，再点一下看原样
function openSession(c, s, row) {
  if (c.live && c.live.sid === s.id && !c.live.done) return push(c.live.ch.v);
  if (c.free?.[s.id]) return push(c.free[s.id].v);
  if (Native.get("live:" + c.id)?.sid === s.id) return openLesson(c);
  if (s.sum?.length && !row.classList.contains("open")) return row.classList.add("open");
  const html = Native.get("chat:" + s.id);
  if (!html) return s.sum?.length ? row.classList.toggle("open") : toast("这次没学完，内容没存下来");
  const v = viewEl("chat replay");
  v.innerHTML = `<header class="dtop"><button class="back">${ICON.back}</button><div><h1>${esc(s.title)}</h1><small>${esc(c.cat)} · ${short(s.date)}</small></div></header><main class="scroll">${html}</main>`;
  v.querySelector(".back").onclick = pop;
  v.querySelectorAll(".cite").forEach((x) => (x.onclick = () => openSources(JSON.parse(x.dataset.src || "[]"))));
  push(v);
}

// ── 笔记：先遮住要点，自己在心里说一遍，再点开对；还能让导师再考一遍这一节 ──
function NoteView(c, id) {
  const n = (Native.get("notes:" + c.id) || {})[id], node = c.byId[id], st = c.p.nodes[id];
  const v = viewEl("notev");
  v.innerHTML = `<div class="nav"><button class="back">${ICON.back}</button></div>
    <main class="scroll">
      <h1 class="big">${masks(num(c, id))}</h1>
      <h2>${esc(node.title)}</h2>
      <div class="meta2">${short(n.date)} 学的 · ${n.score} 分 · ${STATE_TXT[stateOf(c, id)]}${st?.next ? ` · 下次复习 ${short(st.next)}` : ""}</div>
      <div class="recall hide"><p class="qq">先别看：这一节讲了哪几件事？在心里说一遍。</p><ol>${n.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ol><button class="solid">对一下</button></div>
      ${n.pitfalls.length ? `<h6>栽过的坑</h6><div class="sticks">${n.pitfalls.map((p) => `<div class="stick">${esc(p)}</div>`).join("")}</div>` : ""}
      ${n.example ? `<h6>例子</h6><p class="ex">${esc(n.example)}</p>` : ""}
      <button class="go press" id="quiz"><div><span>考考我这一节</span><small>出两三道题，从记忆里拿</small></div><i>${ICON.go}</i></button>
    </main>`;
  v.querySelector(".back").onclick = pop;
  v.querySelector(".recall .solid").onclick = (e) => { const r = v.querySelector(".recall"); r.classList.remove("hide"); rise(r.querySelectorAll("li"), 0, 80); SK.paperStill(r); };
  v.querySelector("#quiz").onclick = () => openLesson(c, { review: [id] });
  v.onenter = () => {
    reveal(v.querySelector("h1"), 120, 80);
    SK.paperStill(v.querySelector(".recall"));
    v.querySelectorAll(".sticks .stick").forEach((x, i) => { SK.paperStill(x, { tape: false }); setTimeout(() => SK.slap(x, i % 2 ? 1.2 : -1.2), 300 + i * 120); });
  };
  return v;
}

// ── 设置 ──
function SettingsView() {
  const v = viewEl("set");
  const cfg = Native.cfg();
  v.innerHTML = `<div class="nav"><button class="back">${ICON.back}</button></div>
    <main class="scroll">
      <div class="top" style="padding:0 0 6px"><div><h1 class="big">${masks("设置")}</h1></div></div>
      ${cfg ? `
      ${(() => { const t = usingTrial() && Native.trial(); return t ? `<div class="stick trialst"><b>体验额度</b>${t.spent ? "用完了，在下面填自己的 Key 接着用" : `还能建 ${Math.max(0, t.maxBuilds - t.builds)} 门课、和导师聊 ${Math.max(0, t.maxTurns - t.turns)} 次。用完了在下面填自己的 Key`}</div>` : ""; })()}
      <div class="sect">讲课的模型</div>
      <div class="field"><label>接口地址</label><input id="fUrl" value="${esc(cfg.llmUrl)}" placeholder="https://…/v1"></div>
      <div class="field"><label>模型名</label><input id="fModel" value="${esc(cfg.llmModel)}" placeholder="比如 deepseek-chat"></div>
      <div class="field"><label>Key</label><input id="fKey" value="${esc(cfg.llmKey)}" type="password" placeholder="sk-…"><small>OpenAI 兼容的接口都行</small></div>
      <div class="sect">联网搜索</div>
      <div class="field"><label>阿里云百炼 Key</label><input id="fDs" value="${esc(cfg.dsKey)}" type="password" placeholder="sk-…"><small>建课和查出处时联网搜。Key 在 <a href="#" id="dsLink">百炼控制台</a> 拿</small></div>
      <div class="row2"><button class="solid" id="save">保存</button><button class="ghost" id="test">试一下</button></div>
      <div class="msg" id="msg"></div>` : `<div class="msg">电脑上调试时，模型和搜索走开发服务器的配置。</div>`}
      <div class="sect">数据</div>
      <button class="ghost" id="tipsAgain">重看引导</button><br>
      <button class="danger" id="reset">清空所有课、进度和对话</button>
    </main>`;
  v.querySelector(".back").onclick = pop;
  v.querySelectorAll("input").forEach((i) => i.addEventListener("focus", () => setTimeout(() => i.scrollIntoView({ block: "center", behavior: "smooth" }), 350)));
  let mm = null;
  const msg = (t, ex) => {
    const box = v.querySelector("#msg"); box.textContent = t;
    if (!ex) return;
    const h = el("span", "em"); box.prepend(h); mm = new SK.Note(h, 30, ex);
    if (ex === "think") h.classList.add("nm-think"); else mm.play(ex === "wrong" ? "nm-tilt" : "nm-hop", 700);
  };
  if (cfg) {
    v.querySelector("#dsLink").onclick = (e) => { e.preventDefault(); Native.openUrl("https://bailian.console.aliyun.com/?apiKey=1"); };
    const read = () => ({ llmUrl: v.querySelector("#fUrl").value.trim(), llmModel: v.querySelector("#fModel").value.trim(), llmKey: v.querySelector("#fKey").value.trim(), dsKey: v.querySelector("#fDs").value.trim() });
    v.querySelector("#save").onclick = () => { Native.setCfg(read()); msg("存好了"); };
    v.querySelector("#test").onclick = async () => {
      Native.setCfg(read()); msg("在试模型…", "think");
      try {
        const t0 = Date.now(); await Native.llm([{ role: "user", content: "只回复两个字：好的" }], { maxTokens: 20 });
        msg(`模型通了，${((Date.now() - t0) / 1000).toFixed(1)} 秒。在试联网搜索…`, "think");
        const r = await Native.search("今天的新闻");
        msg(`模型和联网搜索都通了（搜到 ${r.results.length} 条）`, "happy");
      } catch (e) { msg("没通：" + e.message, "wrong"); }
    };
  }
  v.querySelector("#tipsAgain").onclick = () => { Native.del("tips"); toast("各个页面的小提示会再出一遍"); };
  v.querySelector("#reset").onclick = () => {
    if (!confirm("清空所有课、进度和对话？清空后从头开始。")) return;
    for (const c of S.courses) { Native.del("progress:" + c.id); Native.del("sessions:" + c.id); Native.del("notes:" + c.id); Native.del("cover:" + c.id); for (const n of c.list) { Native.del(`lesson:${c.id}:${n.id}`); Native.del(`review:${c.id}:${n.id}`); } }
    for (const id of Native.get("courses") || []) Native.del("course:" + id);
    Native.del("courses"); Native.del("build"); Native.del("day"); Native.del("tips"); Native.del("seeded"); Native.keepAlive(false);
    location.reload();
  };
  v.onenter = () => reveal(v.querySelector("h1"), 120, 80);
  return v;
}
