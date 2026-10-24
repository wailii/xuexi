// 对话引擎：逐字流出的回答、题卡、步骤卡、环节条；一节课怎么走在 tutor.js
const STAGES = ["复习", "摸底", "打底", "追问", "查证", "测验"];
// ── 对话引擎 ──
// 说一句话就能改方向：这几类说法会让导师切到对应环节
const INTENTS = [
  ["测验", /考我|测一下|直接考|小测|我会了|我懂了|都会了|太简单/],
  ["打底", /没懂|不懂|听不懂|看不懂|再讲|讲慢|讲简单|什么意思|没明白/],
  ["查证", /业界|真实|实际|出处|来源|证据|论文|谁说的|怎么做的/],
  ["复习", /复习|之前学的|上一节|前面学的|忘了/],
];
const intentOf = (t) => INTENTS.find(([, re]) => re.test(t))?.[0];

class Chat {
  constructor({ title, sub, phases, ph, quick }) {
    const v = (this.v = viewEl("chat")); v._chat = this;
    v.innerHTML = `<header class="dtop"><button class="back">${ICON.back}</button><div><h1>${esc(title)}</h1><small>${esc(sub || "")}</small></div></header>
      ${phases ? `<nav class="phases"><div class="ind"></div>${phases.map((p) => `<span>${esc(p)}</span>`).join("")}</nav>` : ""}
      <main class="scroll"></main>
      ${quick ? `<div class="quick">${quick.map((q) => `<button>${esc(q)}</button>`).join("")}</div>` : ""}
      <form class="comp"><input placeholder="${esc(ph || "说点什么…")}" enterkeyhint="send"><button class="send" type="submit">${ICON.up}</button></form>`;
    this.sc = v.querySelector(".scroll"); this.input = v.querySelector("input"); this.comp = v.querySelector(".comp");
    this.ph0 = this.input.placeholder; this.stick = true; this.waiter = null; this.lock = Promise.resolve(); this.cur = -1;
    this.sc.addEventListener("scroll", () => (this.stick = this.sc.scrollHeight - this.sc.scrollTop - this.sc.clientHeight < 90));
    this.comp.onsubmit = (e) => { e.preventDefault(); const t = this.input.value.trim(); if (!t) return; this.input.value = ""; this.typed(t); };
    v.querySelectorAll(".quick button").forEach((b) => (b.onclick = () => this.typed(b.textContent, true)));
    this.quickBox = v.querySelector(".quick");
    v.querySelector(".back").onclick = pop;
    if (phases) {
      this.tabs = [...v.querySelectorAll(".phases span")]; this.ind = v.querySelector(".phases .ind");
      this.E = { l: { x: 0, v: 0, t: 0 }, r: { x: 0, v: 0, t: 0 } };
    }
  }
  follow() { if (this.stick) this.sc.scrollTop = this.sc.scrollHeight; }
  setQuick(list) {
    if (!this.quickBox) return;
    this.quickBox.innerHTML = list.map((t) => `<button>${esc(t)}</button>`).join("");
    this.quickBox.querySelectorAll("button").forEach((b, i) => {
      b.onclick = () => { this.setQuick([]); this.typed(list[i], true); };
      b.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: i * 60, fill: "backwards" });
    });
  }
  // 边生成边显示的一条回答：先是一行「在想…」，第一句话来了换成正文，结束时按引用编号补上出处
  async live(onStart) {
    await this.lock;
    let release;
    this.lock = new Promise((r) => (release = r));
    let wait = this.add(waitRow("在想…")), box = null;
    const open = () => { if (box) return; wait?.remove(); wait = null; onStart?.(); box = this.add(el("div", "ans")); };
    return {
      set: (text) => { if (!text) return; open(); box.innerHTML = rich(text) + `<span class="caret"></span>`; this.follow(); },
      end: (text, cites) => {
        wait?.remove();
        if (text) { open(); box.innerHTML = rich(text, cites); box.querySelectorAll(".cite").forEach((x) => (x.onclick = () => openSources(cites))); }
        else box?.remove();
        this.follow(); release();
      },
    };
  }
  switchNow(i, why) {
    if (this.tabs) { this.tabs[i].classList.add("seen"); this.phase(i); }
    this.add(el("div", "switch", `<b>${esc(this.tabs ? this.tabs[i].textContent : "")}</b>${why ? `<span>${esc(why)}</span>` : ""}`));
  }
  add(node, parent) { (parent || this.sc).append(node); node.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" }); this.follow(); return node; }
  wait(fn, ph) { this.waiter = fn; this.input.placeholder = ph || "也可以打字回答"; this.comp.classList.add("wait"); }
  unwait() { this.waiter = null; this.input.placeholder = this.ph0; this.comp.classList.remove("wait"); }
  typed(t, quick) {
    this.me(t);
    const it = this.onIntent && (quick || !this.waiter) && intentOf(t);
    if (it) return this.onIntent(it, t);
    if (this.waiter) return this.waiter(t);
    if (this.onText) return this.onText(t, {});
    if (this.onFree) return this.onFree(t);
  }
  // 等模型时的一行流光字；模型回来就收掉
  async thinking(text, p) {
    await this.lock;
    const w = this.add(waitRow(text));
    try { return await p; } finally { w.remove(); }
  }
  // 出错了：说清楚哪一步没成，给一个重试
  async fail(what, e) {
    await this.lock;
    const box = this.add(el("div", "err", `<span class="em"></span><b>${esc(what)}</b>${esc(e?.message || e || "")}<div class="chips"><button class="k">重试</button></div>`));
    new SK.Note(box.querySelector(".em"), 34, "wrong").play("nm-tilt");
    return new Promise((res) => (box.querySelector("button").onclick = () => { box.remove(); res(); }));
  }
  // 最近几句对话，给模型看上下文
  recent(n = 8) {
    return [...this.sc.querySelectorAll(".me, .ans, .q")].slice(-n).map((x) => (x.classList.contains("me") ? "学习者：" : x.classList.contains("q") ? "题：" : "导师：") + x.innerText.replace(/\s+/g, " ").slice(0, 240));
  }
  me(t) { this.add(el("div", "me", esc(t))); }
  // 正在等回答的卡被一句话打断：收起来，标上「跳过了」
  hold(card, resolve) { this.abort = () => { this.abort = null; this.unwait(); card.classList.remove("cur"); card.classList.add("done", "skipped"); resolve({ jump: true, card }); }; }
  release() { this.abort = null; }

  // 逐字流出：**加粗** {数字} [1] 引用编号
  ai(text, cites) {
    const run = () => this._ai(String(text ?? ""), cites).catch(() => null);
    this.lock = this.lock.then(run, run);
    return this.lock;
  }
  async _ai(text, cites, into) {
    const box = into ? into.appendChild(el("div", "ans")) : this.add(el("div", "ans")), caret = el("span", "caret");
    for (const para of text.split("\n")) {
      const p = el("p"); box.append(p);
      const re = /\*\*(.+?)\*\*|\{(.+?)\}|\[(\d+)\]/g; let m, last = 0; const segs = [];
      while ((m = re.exec(para))) {
        if (m[3] != null && !(+m[3] > 0 && cites?.[+m[3] - 1])) continue;
        if (m.index > last) segs.push({ t: para.slice(last, m.index) });
        segs.push(m[1] ? { b: m[1] } : m[2] ? { n: m[2] } : { c: +m[3] });
        last = re.lastIndex;
      }
      if (last < para.length) segs.push({ t: para.slice(last) });
      for (const s of segs) {
        if (s.c) {
          const x = el("span", "cite", s.c); x.dataset.src = JSON.stringify(cites || []); x.onclick = () => openSources(cites); p.append(x, caret);
          x.animate([{ transform: "scale(0)" }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.3,1.6,.5,1)" }); await sleep(60); continue;
        }
        const node = s.b ? el("b") : s.n ? el("span", "num") : document.createTextNode("");
        p.append(node, caret);
        const chars = [...(s.t ?? s.b ?? s.n)];
        for (let i = 0; i < chars.length; ) { const k = 1 + (Math.random() < 0.5); node.textContent += chars.slice(i, i + k).join(""); i += k; if (i % 6 < 2) this.follow(); await sleep(16); }
      }
    }
    caret.remove(); this.follow();
    return box;
  }

  // 顶上六个环节：黑块跳到当前环节，去过的下面留一个点；对话里写一行为什么切过来
  async switchTo(i, why) {
    await this.lock;
    if (this.tabs) { this.tabs[i].classList.add("seen"); this.phase(i); }
    this.add(el("div", "switch", `<b>${esc(this.tabs ? this.tabs[i].textContent : "")}</b>${why ? `<span>${esc(why)}</span>` : ""}`));
  }
  phase(i) {
    if (!this.tabs || i === this.cur) return;
    this.cur = i;
    this.tabs.forEach((t, j) => t.classList.toggle("on", j === i));
    const row = this.v.querySelector(".phases").getBoundingClientRect(), b = this.tabs[i].getBoundingClientRect(), E = this.E;
    const L = b.left - row.left + 2, R = b.right - row.left - 2, jump = !row.width || E.r.t === 0;
    const right = R > E.r.t; E.l.t = L; E.r.t = R; E.l.k = right ? 120 : 340; E.r.k = right ? 340 : 120;
    const draw = () => { this.ind.style.left = E.l.x + "px"; this.ind.style.width = Math.max(0, E.r.x - E.l.x) + "px"; };
    if (jump) { E.l.x = L; E.r.x = R; draw(); return; }
    let t0 = 0;
    const tick = (now) => {
      const dt = Math.min(1 / 30, t0 ? (now - t0) / 1000 : 1 / 60); t0 = now; let busy = false;
      for (const s of [E.l, E.r]) { for (let q = 0; q < 4; q++) { const a = -s.k * (s.x - s.t) - 2 * Math.sqrt(s.k) * 0.8 * s.v; s.v += (a * dt) / 4; s.x += (s.v * dt) / 4; } if (Math.abs(s.x - s.t) > 0.1 || Math.abs(s.v) > 0.1) busy = true; else { s.x = s.t; s.v = 0; } }
      draw(); if (busy) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  rephase() { if (this.tabs && this.cur >= 0) { const i = this.cur; this.cur = -1; this.E.r.t = 0; this.phase(i); } }

  // 步骤卡：转圈 → 打勾，每步右边一个结果
  async steps({ think, done, items }) {
    await this.lock;
    const turn = this.add(el("section", "turn"));
    turn.innerHTML = `<div class="sthd"><span class="em"></span><div class="think">${esc(think)}</div></div><div class="steps">${items.map((it) => `<div class="st"><span class="ic"></span><span>${esc(it.t)}</span><span class="r"></span><div class="srcs"></div><div class="x ${it.mono ? "mono" : ""}"></div></div>`).join("")}</div>`;
    const rows = [...turn.querySelectorAll(".st")], m = new SK.Note(turn.querySelector(".em"), 28, "think");
    m.host.classList.add("nm-think");
    for (let i = 0; i < items.length; i++) {
      const it = items[i], row = rows[i], r = row.querySelector(".r");
      row.className = "st run";
      if (it.run) {
        try { await it.run({ row, r, srcs: row.querySelector(".srcs"), x: row.querySelector(".x"), chat: this }); } catch (e) {
          row.className = "st bad"; const th = turn.querySelector(".think"); th.textContent = "停在这一步"; th.classList.add("done");
          m.host.classList.remove("nm-think"); m.set("wrong").play("nm-tilt"); m.still();
          throw e;
        }
      }
      else {
        for (const s of it.srcs || []) { await sleep(150); this.chip(row.querySelector(".srcs"), s); this.follow(); }
        await sleep(it.dur || 550);
      }
      row.className = "st ok"; if (it.r) r.textContent = it.r; this.follow();
    }
    const th = turn.querySelector(".think"); th.textContent = done; th.classList.add("done");
    m.host.classList.remove("nm-think"); m.set("happy").play("nm-hop", 700); setTimeout(() => m.still(), 1500);
    return turn;
  }
  chip(box, [ini, name]) {
    const c = el("span", "", `<i>${esc(ini)}</i>${esc(name)}`); box.append(c);
    c.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(.3,1.5,.5,1)" });
  }

  // 选择题。conf：选完先问有多确定，确定前可以改选，确定后才亮对错。
  // 「想不出来」一层层给提示，最后才给答案；打字打 A/B 或选项原文算选中，其它当成卡住了
  async choice(def) {
    await this.lock;
    const { q, stmt, opts, hints = [], reveal, row } = def;
    const html = `${stmt ? `<p class="stmt">${esc(stmt)}</p>` : `<p class="qt">${esc(q)}</p>`}
      <div class="ops ${row ? "row" : ""}">${opts.map(([k, t]) => `<button class="op" data-k="${esc(k)}"><i>${esc(k)}</i><span>${esc(t)}</span><em></em></button>`).join("")}</div>
      <div class="hints"></div><div class="qf">${hints.length || reveal || def.onStuck ? `<button class="ghost stuck">想不出来</button>` : ""}</div>`;
    const res = { card: this.add(el("div", "q cur", html)), def, hintsUsed: 0, tries: [] };
    res.again = async () => { await this.lock; res.card = this.add(el("div", "q cur", html)); return this._pick(res); };
    return this._pick(res);
  }
  _pick(res) {
    const { card, def } = res, { opts, right, hints = [], reveal } = def;
    this.curDef = def;
    card.querySelectorAll(".op").forEach((o) => { if (res.tries.includes(o.dataset.k)) o.classList.add("tried"); });
    this.follow();
    return new Promise((resolve) => {
      this.hold(card, resolve);
      const finish = (k, revealed) => {
        this.release(); this.unwait(); this.pendingChoose = null; card.classList.remove("cur"); card.classList.add("done");
        card.querySelectorAll(".op").forEach((o) => { o.classList.toggle("pick", o.dataset.k === k); o.onclick = null; });
        res.key = k; res.ok = right == null ? null : k === right && !revealed; res.revealed = !!revealed; res.tries.push(k);
        const cf = card.querySelector(".conf"); if (cf) revealed ? cf.remove() : cf.classList.add("done");
        this.mark(res); this.follow(); resolve(res);
      };
      const choose = (k) => {
        if (!def.conf) return finish(k);
        res.key = k;
        card.querySelectorAll(".op").forEach((o) => o.classList.toggle("pick", o.dataset.k === k));
        if (card.querySelector(".conf")) return;
        const cf = el("div", "conf", `<span>有多确定？</span><div class="seg"><button data-k="low">蒙的</button><button data-k="med">有点把握</button><button data-k="high">很确定</button></div>`);
        card.querySelector(".hints").before(cf);
        cf.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
        cf.querySelectorAll("button").forEach((b) => (b.onclick = () => { b.classList.add("on"); res.conf = b.dataset.k; finish(res.key); }));
        this.follow();
      };
      card.querySelectorAll(".op:not(.tried)").forEach((o) => (o.onclick = () => choose(o.dataset.k)));
      this.pendingChoose = (k) => { const ok = opts.some(([x]) => x === k) && !res.tries.includes(k); if (ok) choose(k); return ok; };
      const stuck = card.querySelector(".stuck");
      const label = () => (res.hintsUsed >= hints.length ? (right ? "看答案" : "跳过") : "想不出来");
      const hint = async (tag) => {
        if (res.hintsUsed < hints.length) {
          const h = el("div", "hint", `<b>${tag || "提示"}</b><span></span>`); card.querySelector(".hints").append(h);
          const span = h.querySelector("span"), txt = [...hints[res.hintsUsed++]];
          if (stuck) stuck.textContent = label();
          for (let i = 0; i < txt.length; i += 2) { span.textContent += txt.slice(i, i + 2).join(""); await sleep(16); }
          this.follow();
        } else if (right) {
          card.querySelector(".hints").append(el("div", "hint", `<b>答案</b><span>${esc(reveal || "")}</span>`));
          finish(right, true);
        } else finish(opts[opts.length - 1][0]);
      };
      if (stuck && def.onStuck) { stuck.textContent = "想不出来"; stuck.onclick = () => def.onStuck(); }
      else if (stuck) { stuck.textContent = label(); stuck.onclick = () => hint(); }
      this.wait((t) => {
        const s = t.trim().replace(/[。.！!？?]/g, ""), avail = opts.filter(([k]) => !res.tries.includes(k));
        const hit = avail.find(([k, txt]) => s.toUpperCase() === k.toUpperCase() || s === txt) || avail.find(([, txt]) => txt.length > 4 && s.includes(txt));
        if (hit) return choose(hit[0]);
        if (this.onText) return this.onText(t, { card: def });
        this.ai(hints.length > res.hintsUsed ? "收到。我换个问法，你再从选项里挑：" : "收到。从上面的选项里挑一个最接近的：").then(() => hints.length > res.hintsUsed && hint("换个问法"));
      });
    });
  }
  mark(res) {
    if (res.def.right == null) return;
    const o = res.card.querySelector(`.op[data-k="${CSS.escape(res.key)}"]`);
    if (res.key === res.def.right) { o.classList.add("right"); o.querySelector("em").textContent = res.revealed ? "答案" : "对"; }
    else { o.classList.add("wrong"); o.querySelector("em").textContent = "不对"; }
  }
  retry(res) { return res.again(); }
  showRight(res) { const o = res.card.querySelector(`.op[data-k="${CSS.escape(res.def.right)}"]`); o.classList.add("right"); o.querySelector("em").textContent = "答案"; }
  judge(def) { return this.choice({ ...def, opts: [["对", "对"], ["不对", "不对"], ["说不准", "说不准"]], row: true }); }

  async multi({ q, opts }) {
    await this.lock;
    const card = this.add(el("div", "q cur"));
    card.innerHTML = `<p class="qt">${esc(q)}</p><div class="ops">${opts.map((t) => `<button class="chk"><i></i><span>${esc(t)}</span></button>`).join("")}</div><div class="qf"><span></span><button class="solid" disabled>选好了</button></div>`;
    const ok = card.querySelector(".solid"), boxes = [...card.querySelectorAll(".chk")];
    boxes.forEach((b) => (b.onclick = () => { b.classList.toggle("on"); ok.disabled = !boxes.some((x) => x.classList.contains("on")); }));
    return new Promise((resolve) => {
      this.hold(card, resolve);
      ok.onclick = () => { this.release(); card.classList.remove("cur"); card.classList.add("done"); boxes.forEach((b) => (b.onclick = null)); resolve(boxes.filter((b) => b.classList.contains("on")).map((b) => b.textContent)); };
    });
  }

  // 归位题：每一行点左右两档；排好了统一对答案，错的行写明放错了，留着改
  async sort({ q, items, labels }) {
    await this.lock;
    const card = this.add(el("div", "q cur"));
    card.innerHTML = `<p class="qt">${esc(q)}</p><div class="sorts">${items.map(([t], i) => `<div class="srow" data-i="${i}"><span>${esc(t)}</span><div class="seg"><button data-v="L">${labels[0]}</button><button data-v="R">${labels[1]}</button></div></div>`).join("")}</div><div class="qf"><span></span><button class="solid" disabled>排好了</button></div>`;
    const rows = [...card.querySelectorAll(".srow")], btn = card.querySelector(".solid"), pick = {};
    this.curDef = { type: "sort", items };
    let rounds = 0, firstWrong = 0;
    rows.forEach((r) => r.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      pick[r.dataset.i] = b.dataset.v; r.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); r.classList.remove("bad", "ok"); r.querySelector(".why")?.remove();
      btn.disabled = Object.keys(pick).length < items.length;
    })));
    return new Promise((resolve) => {
      this.hold(card, resolve);
      btn.onclick = () => {
        rounds++;
        let bad = 0;
        rows.forEach((r, i) => {
          const good = pick[i] === items[i][1]; r.classList.toggle("ok", good); r.classList.toggle("bad", !good);
          if (!good) { bad++; if (!r.querySelector(".why")) r.append(el("div", "why", esc(items[i][2] || ""))); }
        });
        if (rounds === 1) firstWrong = bad;
        if (bad) { btn.textContent = "改好了"; this.follow(); return; }
        this.release(); card.classList.remove("cur"); card.classList.add("done");
        rows.forEach((r) => r.querySelectorAll("button").forEach((b) => (b.onclick = null)));
        resolve({ firstTry: rounds === 1, firstWrong });
      };
    });
  }

  // 排顺序：按你觉得的先后依次点，每项标上第几；再点一下取消。排好了统一对答案，排错的标出应该第几
  async order(def) {
    await this.lock;
    const n = def.items.length;
    let idx = def.items.map((_, i) => i);
    for (let t = 0; t < 8 && idx.every((v, i) => v === i); t++) idx = idx.sort(() => Math.random() - 0.5);
    const card = this.add(el("div", "q cur", `<p class="qt">${esc(def.q)}</p><div class="ord">${idx.map((i) => `<button class="oi" data-i="${i}"><b></b><span>${esc(def.items[i])}</span><em></em></button>`).join("")}</div>
      <div class="qf"><button class="ghost">重排</button><button class="solid" disabled>排好了</button></div>`));
    this.curDef = { type: "order", items: def.items };
    const seq = [], rows = [...card.querySelectorAll(".oi")], ok = card.querySelector(".solid");
    const draw = () => { rows.forEach((r) => { const k = seq.indexOf(+r.dataset.i); r.classList.toggle("on", k >= 0); r.querySelector("b").textContent = k >= 0 ? k + 1 : ""; }); ok.disabled = seq.length < n; };
    rows.forEach((r) => (r.onclick = () => { const i = +r.dataset.i, k = seq.indexOf(i); k >= 0 ? seq.splice(k, 1) : seq.push(i); draw(); Native.vibrate(8); }));
    card.querySelector(".ghost").onclick = () => { seq.length = 0; draw(); };
    return new Promise((resolve) => {
      this.hold(card, resolve);
      ok.onclick = () => {
        this.release();
        let wrong = 0;
        rows.forEach((r) => { const i = +r.dataset.i, good = seq.indexOf(i) === i; r.classList.add(good ? "ok" : "bad"); if (!good) { wrong++; r.querySelector("em").textContent = `应在第 ${i + 1}`; } r.onclick = null; });
        card.classList.remove("cur"); card.classList.add("done", "keep");
        this.follow();
        resolve({ firstTry: !wrong, wrong });
      };
    });
  }

  // 连线：先点左边一项，再点右边和它对应的那项，中间画一条线；点已连上的取消
  async match(def) {
    await this.lock;
    const L = def.pairs.map((p) => p[0]);
    let R = def.pairs.map((_, i) => i);
    for (let t = 0; t < 8 && R.every((v, i) => v === i); t++) R = R.sort(() => Math.random() - 0.5);
    const card = this.add(el("div", "q cur", `<p class="qt">${esc(def.q)}</p><div class="mt"><svg class="mtl"></svg><div class="mc">${L.map((t, i) => `<button class="mi" data-l="${i}">${esc(t)}</button>`).join("")}</div><div class="mc">${R.map((i) => `<button class="mi" data-r="${i}">${esc(def.pairs[i][1])}</button>`).join("")}</div></div>
      <div class="qf"><span></span><button class="solid" disabled>连好了</button></div>`));
    this.curDef = { type: "match", pairs: def.pairs };
    const link = {}, svg = card.querySelector(".mtl"), box = card.querySelector(".mt"), ok = card.querySelector(".solid");
    let sel = null;
    const pos = (b, side) => { const a = box.getBoundingClientRect(), r = b.getBoundingClientRect(); return [side ? r.left - a.left : r.right - a.left, r.top - a.top + r.height / 2]; };
    const draw = (marks) => {
      svg.innerHTML = Object.entries(link).map(([l, r]) => {
        const [x1, y1] = pos(card.querySelector(`[data-l="${l}"]`), 0), [x2, y2] = pos(card.querySelector(`[data-r="${r}"]`), 1);
        const cls = marks ? (+l === +r ? "ok" : "bad") : "";
        return `<path class="${cls}" d="M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}"/>`;
      }).join("");
      card.querySelectorAll("[data-l]").forEach((b) => b.classList.toggle("on", b.dataset.l in link || sel === b.dataset.l));
      card.querySelectorAll("[data-r]").forEach((b) => b.classList.toggle("on", Object.values(link).includes(b.dataset.r)));
      ok.disabled = Object.keys(link).length < L.length;
    };
    card.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => { const l = b.dataset.l; if (l in link) delete link[l]; sel = sel === l ? null : l; draw(); }));
    card.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => {
      const r = b.dataset.r, had = Object.keys(link).find((k) => link[k] === r);
      if (had != null) delete link[had];
      if (sel != null) { link[sel] = r; sel = null; Native.vibrate(8); }
      draw();
    }));
    return new Promise((resolve) => {
      this.hold(card, resolve);
      ok.onclick = () => {
        this.release();
        const wrong = Object.entries(link).filter(([l, r]) => +l !== +r).length;
        draw(true);
        card.querySelectorAll(".mi").forEach((b) => (b.onclick = null));
        Object.entries(link).forEach(([l, r]) => { if (+l !== +r) card.querySelector(`[data-l="${l}"]`).insertAdjacentHTML("beforeend", `<em>→ ${esc(def.pairs[l][1])}</em>`); });
        card.classList.remove("cur"); card.classList.add("done", "keep");
        this.follow();
        resolve({ firstTry: !wrong, wrong });
      };
    });
  }

  // 拖数字：拖一个量，句子里另一个量跟着算出来；跨好几个数量级时按对数拖
  async explore(def) {
    await this.lock;
    const { x, y } = def, f = def.fn;
    const logScale = x.max / Math.max(x.min, 1e-9) >= 100 && x.min > 0;
    const toV = (s) => (logScale ? x.min * Math.pow(x.max / x.min, s / 1000) : x.min + ((x.max - x.min) * s) / 1000);
    const toS = (v) => Math.round(logScale ? (1000 * Math.log(v / x.min)) / Math.log(x.max / x.min) : (1000 * (v - x.min)) / (x.max - x.min));
    const nice = (v) => { const a = Math.abs(v); const r = a >= 1e8 ? +(v / 1e8).toFixed(a >= 1e9 ? 0 : 1) + " 亿" : a >= 1e4 ? +(v / 1e4).toFixed(a >= 1e5 ? 0 : 1) + " 万" : a >= 100 ? Math.round(v) : a >= 1 ? +v.toFixed(1) : +v.toPrecision(2); return String(r); };
    const card = this.add(el("div", "q cur", `<p class="qt">${esc(def.q)}</p><p class="exs"></p>
      <input class="exr" type="range" min="0" max="1000" value="${toS(x.value)}"><div class="exb"><i></i></div>
      <div class="qf"><span class="exh">拖一拖</span><button class="solid">看明白了</button></div>`));
    this.curDef = { type: "explore" };
    const range = card.querySelector(".exr"), sent = card.querySelector(".exs"), bar = card.querySelector(".exb i");
    const yMax = Math.max(Math.abs(f(x.max)), Math.abs(f(x.min)), 1e-9);
    let first = null, last = null;
    const draw = () => {
      const v = toV(+range.value), out = f(v);
      last = [v, out]; first = first || [v, out];
      const xs = `<b class="ex1">${nice(v)} ${esc(x.unit || "")}</b>`, ys = `<b class="ex2">${nice(out)} ${esc(y.unit || "")}</b>`;
      sent.innerHTML = esc(def.text).replace("{x}", xs).replace("{y}", ys);
      bar.style.transform = `scaleX(${Math.min(1, Math.abs(out) / yMax).toFixed(3)})`;
    };
    range.oninput = draw; draw();
    return new Promise((resolve) => {
      this.hold(card, resolve);
      card.querySelector(".solid").onclick = () => {
        this.release(); range.disabled = true;
        card.classList.remove("cur"); card.classList.add("done", "keep");
        resolve({ x0: nice(first[0]), y0: nice(first[1]), x1: nice(last[0]), y1: nice(last[1]) });
      };
    });
  }

  // 图：流程（一到两列）、对比表、时间线，一格一格长出来
  async chart(spec) {
    await this.lock;
    let body = "";
    if (spec.type === "flow") {
      body = `<div class="fl ${spec.lanes.length > 1 ? "two" : ""}">${spec.lanes.map((ln) => `<div class="fln">${ln.name ? `<h6>${esc(ln.name)}</h6>` : ""}${ln.steps.map(([t, d], i) => `${i ? `<i class="fla"></i>` : ""}<div class="fls"><b>${esc(t)}</b>${d ? `<span>${esc(d)}</span>` : ""}</div>`).join("")}</div>`).join("")}</div>`;
    } else if (spec.type === "compare") {
      body = `<div class="cmp" style="grid-template-columns: ${spec.cols.map((_, i) => (i ? "1fr" : "auto")).join(" ")}">${spec.cols.map((h) => `<b class="ch">${esc(h)}</b>`).join("")}${spec.rows.map((r) => r.map((x, i) => `<span class="${i ? "" : "rh"}">${esc(x)}</span>`).join("")).join("")}</div>`;
    } else if (spec.type === "timeline") {
      body = `<div class="tl">${spec.items.map(([t, d]) => `<div class="tli"><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join("")}</div>`;
    }
    if (!body) return;
    const box = this.add(el("div", "chart", `${spec.title ? `<p class="ct">${esc(spec.title)}</p>` : ""}${body}`));
    rise(box.querySelectorAll(".fls, .fla, .cmp > *, .tli"), 80, 45);
    this.follow();
  }

  // 学完一节的笔记卡
  async noteCard(n) {
    await this.lock;
    const box = this.add(el("div", "notec stick big", `<p class="ct">笔记 · 存进这门课了</p><h5>${esc(n.title)}</h5><ol>${n.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>${n.pitfalls?.length ? `<h6>栽过的坑</h6><ul>${n.pitfalls.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}${n.example ? `<h6>例子</h6><p>${esc(n.example)}</p>` : ""}`));
    rise(box.children, 100, 60);
    SK.paperStill(box); SK.slap(box, -0.6);
    return box;
  }
  // 存回放用的样子：纸屑、提示、气泡、「在想」这些一闪而过的东西不存
  snap() { const x = this.sc.cloneNode(true); x.querySelectorAll(".cf, .tipk, .bub, .waitline").forEach((n) => n.remove()); return x.innerHTML; }

  // 开放题：用输入框作答
  async open({ q, skip }) {
    await this.lock;
    const card = this.add(el("div", "q cur", `<p class="qt">${esc(q)}</p><div class="qf"><button class="ghost">${esc(skip)}</button><span></span></div>`));
    this.input.focus({ preventScroll: true });
    return new Promise((resolve) => {
      this.hold(card, resolve);
      const end = (t) => { this.release(); this.unwait(); card.classList.remove("cur"); card.classList.add("done"); resolve(t); };
      card.querySelector(".ghost").onclick = () => { this.me(skip); end(null); };
      this.wait((t) => end(t), "用你自己的话说…");
    });
  }

  async ask({ q, yes, no }) {
    await this.lock;
    const box = this.add(el("div", "ask", `<p>${esc(q)}</p><div class="bt"><button class="yes">${esc(yes)}</button><button>${esc(no)}</button></div>`));
    return new Promise((resolve) => {
      this.hold(box, resolve);
      box.querySelectorAll("button").forEach((b, i) => (b.onclick = () => { this.release(); b.classList.add("on"); box.classList.add("done"); resolve(i === 0); }));
    });
  }
  // 一行灰色说明，返回这一行（之后可以拿掉）
  async tip(t) { await this.lock; const b = this.add(el("div", "tipl", esc(t))); this.follow(); return b; }
  // 薄弱点贴成一张黄色便利贴
  async note(t, label = "记进薄弱点") { await this.lock; const b = this.add(el("div", "stick", `<b>${esc(label)}</b>${esc(t)}`)); SK.paperStill(b, { tape: false }); SK.slap(b); await sleep(250); }
  // 一张大便利贴（建课方案这类要他过目的东西）
  async card(html) { await this.lock; const b = this.add(el("div", "stick big", html)); SK.paperStill(b); SK.slap(b, -0.6); this.follow(); await sleep(350); return b; }
  async line(t, acc) { await this.lock; this.add(el("div", "line" + (acc ? " acc" : ""), esc(t))); await sleep(200); }
  async score({ sc, lv, sub, items, ft }) {
    await this.lock;
    const box = this.add(el("div", "score", `<span class="snote"></span><div class="top2"><div class="sc"><span class="scn">${sc}</span><small>/ 5</small></div><div class="lv"><b>${esc(lv)}</b><span>${esc(sub)}</span></div></div>
      <ul>${items.map(([ok, t, skip]) => `<li class="${ok ? "" : "no"}"><i></i><span>${esc(t)}${skip ? `<em>跳过了，按小测算</em>` : ""}</span></li>`).join("")}</ul>
      <div class="ft"><b>${esc(ft[0])}</b>${ft.slice(1).map(esc).join("<br>")}</div>`));
    box.querySelector(".sc").animate([{ transform: "translateY(30%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: SOFT.ms, easing: SOFT.easing });
    rise(box.querySelectorAll("li"), 200, 90);
    // 便利贴拍到成绩卡上；分高的把分数圈起来、撒纸屑
    const nh = box.querySelector(".snote"), good = +sc >= 4, m = new SK.Note(nh, 50, good ? "celebrate" : +sc >= 3 ? "happy" : "idle");
    nh.animate([{ transform: "scale(2) rotate(-28deg)", opacity: 0 }, { transform: "scale(.92) rotate(10deg)", opacity: 1, offset: 0.7 }, { transform: "scale(1) rotate(7deg)" }], { duration: 460, delay: 300, easing: "cubic-bezier(.5,0,.75,0)", fill: "both" });
    setTimeout(() => {
      if (+sc >= 3) SK.circle(box.querySelector(".scn"), 560, [14, 18]);
      if (good) { const [x, y] = SK.centerIn(nh, box); SK.confetti(box, x, y, 16); m.play("nm-party", 1200); Native.vibrate(20); }
    }, 720);
    setTimeout(() => { if (good) m.set("happy"); }, 2200);
    setTimeout(() => m.still(), 5000);
    await sleep(500);
  }
  // 判对错的那句话：便利贴先点头或歪头，话跟在它旁边
  verdict(ok, text) {
    const run = async () => {
      const row = this.add(el("div", "fb")), m = new SK.Note(el("span"), 36, ok ? "happy" : "wrong");
      row.append(m.host);
      m.play(ok ? "nm-nod" : "nm-tilt", ok ? 900 : 0);
      await this._ai(String(text ?? ""), null, row);
      setTimeout(() => m.still(), 2500);
    };
    this.lock = this.lock.then(run, run).catch(() => null);
    return this.lock;
  }
  async chips(list) {
    await this.lock;
    const box = this.add(el("div", "chips", list.map((c) => `<button class="${c.k ? "k" : ""}">${esc(c.t)}</button>`).join("")));
    box.querySelectorAll("button").forEach((b, i) => (b.onclick = () => list[i].fn(b, box)));
    return box;
  }
}


// 等模型时那一行：便利贴在想事，旁边一行流光字
function waitRow(text) {
  const w = el("div", "waitline", `<span></span><span class="think">${esc(text)}</span>`);
  new SK.Note(w.firstElementChild, 28, "think").host.classList.add("nm-think");
  return w;
}

// 一段话排成网页：\n 分段，**加粗**，{数字}，[1] 引用编号（有出处时）
function rich(text, cites) {
  return String(text).split("\n").filter((p) => p.trim()).map((p) => "<p>" + esc(p)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\{([^{}]{1,24})\}/g, '<span class="num">$1</span>')
    .replace(/\[(\d+)\]/g, (m, n) => (cites?.[+n - 1] ? `<span class="cite">${n}</span>` : m)) + "</p>").join("");
}
function renumber(text, results) {
  const order = [];
  const out = String(text || "").replace(/\[(\d+)\]/g, (m, n) => {
    const r = results[+n - 1];
    if (!r) return "";
    let i = order.indexOf(r);
    if (i < 0) { order.push(r); i = order.length - 1; }
    return `[${i + 1}]`;
  });
  return { text: out, cites: order.map((s) => ({ name: s.title, url: s.url, note: s.site })) };
}
const siteOf = (s) => (s.site && s.site !== "无" ? s.site : (s.url || "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0] || s.title);
function openSources(list) {
  $("srcList").innerHTML = (list || []).length ? list.map((s, i) => `<div class="src"><b>${i + 1}</b><div><h6>${esc(s.name)}</h6>${s.note ? `<p>${esc(s.note)}</p>` : ""}${s.url ? `<a href="#" data-u="${esc(s.url)}">${esc(s.url)}</a>` : ""}</div></div>`).join("") : `<div class="src"><div><p>没有可打开的链接</p></div></div>`;
  $("srcList").querySelectorAll("a").forEach((a) => (a.onclick = (e) => { e.preventDefault(); Native.openUrl(a.dataset.u); }));
  $("sheet").classList.add("on");
}
$("sheet").onclick = (e) => { if (e.target.id === "sheet") $("sheet").classList.remove("on"); };
