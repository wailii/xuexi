// 一节课：每一轮把课程上下文和到目前为止的对话交给模型，由模型决定这一轮做什么——
// 复习、摸底、打底、追问、查证、测验，或者就顺着你聊。说的话一边生成一边流出来；
// 出的题 App 当场判对错，再把你的作答交回模型，它接着往下走。
const CONF_TXT = { low: "蒙的", med: "有点把握", high: "很确定" };

// ── 模型备的题，先查一遍格式，坏的丢掉 ──
const LETTERS = ["A", "B", "C", "D", "E"];
// 选项要像「A 一句话」：字母 A～E，文字不长；模型偶尔把题的字段名（right、conf、ok）写进选项，丢掉
const FIELD = /^(right|conf|ok|bad|q|type|stmt|why|hint|opts|.*placeholder.*)$/i;
function normOpts(opts) {
  if (!opts) return null;
  if (!Array.isArray(opts)) opts = Object.entries(opts);
  const out = opts
    .map((o, i) => (Array.isArray(o) ? [String(o[0]).trim().toUpperCase().slice(0, 1), String(o[1] ?? "").trim()] : [LETTERS[i] || "", String(o).trim()]))
    .filter(([k, t]) => t && /^[A-E]$/.test(k) && !FIELD.test(t) && t.length <= 40);
  return out.length >= 2 && out.length <= 5 && new Set(out.map(([k]) => k)).size === out.length ? out : null;
}
function normItem(k) {
  if (!k || typeof k !== "object") return null;
  const type = k.type === "sort" ? "sort" : k.type === "judge" || (k.stmt && !k.opts) ? "judge" : "choice";
  const o = { ...k, type, hints: Array.isArray(k.hints) ? k.hints.filter((h) => typeof h === "string" && h) : [] };
  if (type === "sort") {
    if (!Array.isArray(k.labels) || k.labels.length !== 2 || !Array.isArray(k.items)) return null;
    o.items = k.items.filter((x) => Array.isArray(x) && (x[1] === "L" || x[1] === "R")).map((x) => [String(x[0]), x[1], String(x[2] || "")]);
    o.ok = k.ok || "全对。";
    return o.items.length >= 3 && o.items.some((x) => x[1] === "L") && o.items.some((x) => x[1] === "R") ? o : null;
  }
  if (type === "judge") {
    if (!k.stmt || !["对", "不对"].includes(k.right)) return null;
  } else {
    o.opts = normOpts(k.opts);
    if (!o.opts || !k.q) return null;
    const keys = o.opts.map(([x]) => x);
    if (!keys.includes(k.right)) { const hit = o.opts.find(([, t]) => t === k.right); if (!hit) return null; o.right = hit[0]; }
  }
  o.ok = k.ok || "对。";
  o.bad = k.bad || `不对，答案是 ${o.right}。`;
  if (k.step) {
    const st = { ...k.step };
    if (st.q) { st.opts = normOpts(st.opts); if (!st.opts || !st.opts.some(([x]) => x === st.right)) delete st.q; }
    o.step = st.lead ? st : null;
  }
  return o;
}
function normTeach(t) {
  const socratic = (t.socratic || []).map(normItem).filter(Boolean);
  const base = (t.base || []).filter((x) => typeof x === "string" && x.trim());
  if (!t.probe || !base.length || socratic.length < 2) throw new Error("备出来的讲法或追问不完整");
  return { probe: t.probe, base, socratic };
}
function normTest(t) {
  const card = (k) => { const o = normItem(k); return o && o.type !== "sort" ? o : null; };
  const rows = (t.quiz || []).map((q, i) => [card(q), normItem((t.fix || [])[i]), card((t.retest || [])[i])]).filter(([q]) => q);
  if (!rows.length) throw new Error("出的测验题不完整");
  return { quiz: rows.map((r) => r[0]), fix: rows.map((r) => r[1]), retest: rows.map((r) => r[2]), review: (t.review || []).map(card).filter(Boolean) };
}



const strs = (a, max) => (Array.isArray(a) ? a.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, max) : []);
function normCard(k) {
  if (!k || typeof k !== "object") return null;
  if (k.type === "open") return k.q ? { type: "open", q: String(k.q) } : null;
  if (k.type === "order") { const items = strs(k.items, 7); return k.q && items.length >= 3 && new Set(items).size === items.length ? { ...k, items } : null; }
  if (k.type === "match") {
    const pairs = (k.pairs || []).filter((p) => Array.isArray(p) && p[0] && p[1]).map((p) => [String(p[0]), String(p[1])]).slice(0, 6);
    return k.q && pairs.length >= 2 ? { ...k, pairs } : null;
  }
  if (k.type === "explore") {
    const x = k.x || {}, f = String(k.formula || "").replace(/\^/g, "**");
    if (!k.text || !/^[\d\sx+\-*/().e]+$/i.test(f) || !(+x.max > +x.min)) return null;
    let fn;
    try { fn = new Function("x", `return (${f});`); if (!Number.isFinite(fn(+x.min)) || !Number.isFinite(fn(+x.max))) return null; } catch { return null; }
    const v = Math.min(+x.max, Math.max(+x.min, +x.value || +x.min));
    return { type: "explore", q: String(k.q || ""), text: String(k.text), x: { name: String(x.name || ""), unit: String(x.unit || ""), min: +x.min, max: +x.max, value: v }, y: { name: String(k.y?.name || ""), unit: String(k.y?.unit || "") }, fn };
  }
  return normItem(k);
}
function normChart(c) {
  if (!c || typeof c !== "object") return null;
  const pair = (a, max) => (Array.isArray(a) ? a.filter((p) => Array.isArray(p) && p[0]).map((p) => [String(p[0]), String(p[1] ?? "")]).slice(0, max) : []);
  if (c.type === "flow") { const lanes = (c.lanes || []).map((l) => ({ name: String(l.name || ""), steps: pair(l.steps, 7) })).filter((l) => l.steps.length >= 2).slice(0, 2); return lanes.length ? { type: "flow", title: String(c.title || ""), lanes } : null; }
  if (c.type === "compare") { const cols = strs(c.cols, 4); if (cols.length < 3) cols.unshift(""); const rows = (c.rows || []).filter((r) => Array.isArray(r) && r.length === cols.length).map((r) => r.map((x) => String(x ?? ""))).slice(0, 7); return cols.length >= 3 && rows.length >= 2 ? { type: "compare", title: String(c.title || ""), cols, rows } : null; }
  if (c.type === "timeline") { const items = pair(c.items, 8); return items.length >= 2 ? { type: "timeline", title: String(c.title || ""), items } : null; }
  return null;
}
// 从还没写完的 JSON 里把某个字符串字段先抠出来（流式时边收边显示）
function partialStr(all, key) {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(all);
  if (!m) return null;
  let i = m.index + m[0].length, out = "";
  while (i < all.length) {
    const ch = all[i];
    if (ch === "\\") {
      const n = all[i + 1];
      if (n === undefined) break;
      if (n === "u") { const h = all.slice(i + 2, i + 6); if (h.length < 4) break; out += String.fromCharCode(parseInt(h, 16)); i += 6; continue; }
      out += n === "n" ? "\n" : n === "t" ? "\t" : n;
      i += 2; continue;
    }
    if (ch === '"') return { text: out, done: true };
    out += ch; i++;
  }
  return { text: out, done: false };
}
const looseJSON = (t) => { const m = String(t).match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : t); };

class Tutor {
  constructor(ch, c, nid, due) {
    Object.assign(this, { ch, c, nid, node: nid ? c.byId[nid] : null, due: [...due], msgs: [], busy: false, queue: null, mode: null, finished: false, results: [] });
    ch.onIntent = null;
    ch.onText = (t, ctx) => this.input(ctx?.card ? `他没点选项，打字回答正在等的那道题：「${t}」` : `他说：「${t}」`);
  }
  context() {
    const { c, node } = this;
    return {
      "课名": c.title, "学习者": c.profile, "他每天大约学几分钟": c.minutes || 20, "学完能做到": c.goal, "学到多深": c.depth, "追问往哪拉": c.orientation,
      "今天新的一节": node ? { "节号": num(c, this.nid), "节名": node.title, "学到什么程度": node.objective, "追问种子": node.seeds, "出处线索": node.anchors.slice(0, 4).map((a) => a.name) } : "今天没有新的一节，只复习",
      "今天到期复习": this.due.map((id) => ({ "节号": num(c, id), "节名": c.byId[id].title, "学到什么程度": c.byId[id].objective.slice(0, 260) })),
      "他的薄弱点": c.p.miss.filter((m) => m.open).slice(-6).map((m) => m.text),
      "他之前挂到这一节的问题": (node && c.p.carry?.[this.nid]) || [],
      "课程目录": c.list.map((x, i) => `${pad2(i + 1)} ${x.title}`),
    };
  }
  start() {
    const { c } = this;
    const parts = [];
    if (this.due.length) parts.push(`到期复习 ${this.due.length} 节（${this.due.map((id) => num(c, id)).join("、")}）`);
    if (this.node) parts.push(`新的一节是 ${num(c, this.nid)}「${this.node.title}」`);
    if (this.manual) return this.input(`【他翻笔记时点了「考考我这一节」】要复习 ${this.due.map((id) => num(c, id)).join("、")}。直接出题考，不用寒暄；考完写 reviewed，再给 done。`);
    this.input(`【他刚打开学习页面】今天：${parts.join("；")}。你来开场：简短打个招呼，说今天打算怎么学，然后开始。`);
  }
  // 你说的话、点的选项、搜到的结果，都从这里交给模型；模型正在说的时候先存着，说完再接着处理
  input(text) {
    // 接着上的旧课：等他先开口，第一句话带上「回来了」，导师才知道要先接上刚才讲到哪
    if (this.resumed) { this.resumed = false; text = `【他中途退出过，现在回来接着这一节。先用一句话接上刚才讲到哪，再回应他】${text}`; }
    if (this.busy) { this.queue = text; return; }
    this.turn(text);
  }
  async turn(text) {
    const { ch, c } = this;
    if (!spendTurn(ch)) return;
    this.busy = true;
    ch.setQuick([]);
    this.msgs.push({ role: "user", content: text });
    let raw, switched = false;
    const live = await ch.live();
    try {
      raw = "";
      raw = await Native.llm([{ role: "system", content: PROMPTS.tutor + "\n\n## 上下文\n" + JSON.stringify(this.context()) }, ...this.msgs.slice(-30)], {
        json: true, maxTokens: 3000,
        onDelta: (all) => { raw = all; const s = partialStr(all, "say"); if (s?.text) live.set(s.text); },
      });
    } catch (e) {
      live.end("");
      this.msgs.pop();
      this.busy = false;
      await ch.fail("没连上模型", e);
      return this.turn(text);
    }
    let r;
    try { r = looseJSON(raw); } catch { r = { say: partialStr(raw, "say")?.text || "", chips: [] }; }
    this.msgs.push({ role: "assistant", content: raw });
    this.mode = r.mode || this.mode;
    const { text: say, cites } = /\[\d+\]/.test(r.say || "") && this.results.length ? renumber(r.say, this.results) : { text: r.say || "", cites: [] };
    live.end(say, cites);
    const chart = normChart(r.chart);
    if (chart) ch.chart(chart);
    if (r.miss) { ch.note(r.miss); addMiss(c, this.nid || this.due[0], r.miss); }
    for (const [n, ok] of r.reviewed || []) this.reviewed(n, ok);
    this.busy = false;
    if (r.pick && ch.pendingChoose?.(String(r.pick))) return this.flush();
    if (r.lookup) return this.lookup(String(r.lookup));
    if (r.done && !this.finished) return this.finish(r.done);
    const k = normCard(r.card);
    // 模型这一轮回的东西没法用（没话、没题、也没别的动作）：给个重试，别让页面停在那
    if (!say && !k) { this.msgs.pop(); this.msgs.pop(); await ch.fail("模型这一轮没说出话来", ""); return this.turn(text); }
    if (k) this.ask(k);
    else {
      // 模型只说了一句、没出题也没给建议回复时，补几个，别让他不知道下一步点什么
      let chips = (r.chips || []).filter((x) => typeof x === "string" && x).slice(0, 3);
      if (!chips.length) chips = ["接着往下", "再考我一道", "今天到这"];
      ch.setQuick(chips);
      ch.input.placeholder = chips.length ? ch.ph0 : "直接打字回答";
    }
    this.persist();
    this.flush();
  }
  // 每一轮说完就存一份：页面被杀（vivo 清后台、装新版本）以后能接着上，没学完的也能翻回来看
  persist() {
    const { c, ch } = this, L = c.live;
    if (!L || L.done || this.finished) return;
    const html = ch.snap();
    Native.set("live:" + c.id, { sid: L.sid, title: L.title, nid: this.nid, due: this.due, manual: !!this.manual, msgs: this.msgs.slice(-30), revs: this.revs || [], answered: this.answered || 0, date: TODAY(), html });
    saveSession(c, { ...(c.sessions.find((x) => x.id === L.sid) || { id: L.sid, date: TODAY(), kind: "lesson", node: this.nid, title: L.title, sum: [] }), tag: "进行中", done: false }, html);
  }
  flush() { const q = this.queue; this.queue = null; if (q) this.turn(q); }

  reviewed(n, ok) {
    const { c, ch } = this;
    if (!this.answered) return; // 一道题都还没答，不认这个结果
    const id = c.list.find((x, i) => pad2(i + 1) === pad2(+String(n).replace(/\D/g, "")))?.id;
    if (!id || !this.due.includes(id)) return;
    this.due = this.due.filter((x) => x !== id);
    const s = master(c, id, ok ? 5 : 3);
    if (ok) clearMiss(c, id);
    (this.revs || (this.revs = [])).push([id, !!ok]);
    ch.line(ok ? `${num(c, id)} 复习过了${s.status === "mastered" ? "，算掌握了" : ""} · 下次 ${short(s.next)}` : `${num(c, id)} 这次没过 · 明天再考一次`, ok);
  }

  async lookup(q) {
    const { ch } = this;
    let found = { results: [], text: "" };
    try {
      await ch.steps({ think: "在查资料…", done: "查完了", items: [{ t: "联网搜：" + q, run: async ({ r, srcs }) => {
        found = await Native.search(q);
        found.results.slice(0, 6).forEach((s) => ch.chip(srcs, [siteOf(s)[0], siteOf(s)]));
        r.textContent = `${found.results.length} 条`;
      } }] });
    } catch (e) { ch.ai("没查成：" + e.message); }
    this.results = found.results;
    this.input(`【搜索结果】\n${found.results.slice(0, 10).map((s, i) => `${i + 1}. ${s.title}（${siteOf(s)}）`).join("\n") || "没搜到"}\n摘要：${(found.text || "").slice(0, 2500)}`);
  }

  // 出题：App 当场判，先把模型写好的那句对/错说出来，再把作答交回模型
  async ask(k) {
    const { ch } = this;
    ch.abort?.();
    const done = () => (this.answered = (this.answered || 0) + 1);
    if (k.type === "open") {
      const t = await ch.open({ q: k.q, skip: "说不上来" });
      if (t?.jump) return;
      done();
      return this.input(t == null ? "【他点了说不上来】" : `他答：「${t}」`);
    }
    if (k.type === "order") {
      const r = await ch.order(k);
      if (r?.jump) return;
      done();
      await ch.verdict(r.firstTry, r.firstTry ? k.ok || "对，顺序没问题。" : k.bad || `有 ${r.wrong} 处顺序不对，正确的标在旁边了。`);
      return this.input(r.firstTry ? "【排顺序他一次就排对了】" : `【排顺序他排错了 ${r.wrong} 处，已经看到正确顺序】`);
    }
    if (k.type === "match") {
      const r = await ch.match(k);
      if (r?.jump) return;
      done();
      await ch.verdict(r.firstTry, r.firstTry ? k.ok || "对，全连对了。" : k.bad || `有 ${r.wrong} 条连错了，正确的标在旁边了。`);
      return this.input(r.firstTry ? "【连线他全连对了】" : `【连线他连错了 ${r.wrong} 条，已经看到正确的】`);
    }
    if (k.type === "explore") {
      const r = await ch.explore(k);
      if (r?.jump) return;
      done();
      return this.input(`【他拖了「${k.x.name}」：从 ${r.x0} ${k.x.unit} 拖到 ${r.x1} ${k.x.unit}，「${k.y.name}」从 ${r.y0} ${k.y.unit} 变成 ${r.y1} ${k.y.unit}】`);
    }
    if (k.type === "sort") {
      const r = await ch.sort(k);
      if (r?.jump) return;
      done();
      await ch.verdict(r.firstTry, r.firstTry ? k.ok : `第一次放错了 ${r.firstWrong} 个，现在都对了。`);
      return this.input(r.firstTry ? "【归类题他一次就全对】" : `【归类题他第一次放错了 ${r.firstWrong} 个，后来改对了】`);
    }
    const r = await (k.type === "judge" ? ch.judge({ ...k, onStuck: () => this.input("【他点了想不出来，这道题还在等他答】") }) : ch.choice({ ...k, onStuck: () => this.input("【他点了想不出来，这道题还在等他答】") }));
    if (r?.jump) return;
    done();
    await ch.verdict(r.ok, r.ok ? k.ok : k.bad);
    const picked = k.type === "judge" ? r.key : `${r.key}（${k.opts.find(([x]) => x === r.key)?.[1] || ""}）`;
    this.input(`【他选了 ${picked}${r.conf ? `，把握：${CONF_TXT[r.conf]}` : ""}，${r.ok ? "答对了" : `答错了，正确是 ${k.right}`}】`);
  }

  async finish(d) {
    const { c, ch, nid } = this;
    this.finished = true;
    const items = (Array.isArray(d.points) ? d.points : []).map((p) => (Array.isArray(p) ? [!!p[1], String(p[0])] : [!!p.ok, String(p.point || p.text || "")])).filter(([, t]) => t);
    const sc = Math.min(5, Math.max(1, Math.round(+d.score) || 1));
    let ft = [];
    if (nid) {
      const s = master(c, nid, sc);
      if (c.p.carry?.[nid]) { delete c.p.carry[nid]; saveP(c); }
      const un = sc >= 4 ? unlockedBy(c, nid) : [];
      ft = [`下次复习 ${short(s.next)}`, un.length ? `解锁了 ${un.join("、")}` : sc >= 4 ? "" : `${num(c, nid)} 还在学，明天再来`];
      await ch.score({ sc, lv: sc >= 4 ? "学会了" : "还差一点", sub: sc >= 4 ? (s.status === "mastered" ? "算掌握了" : "再考过一次就算掌握") : "明天再学一遍这节", items: items.length ? items : [[sc >= 4, "这一节"]], ft: ft.filter(Boolean) });
    }
    const nt = d.note && typeof d.note === "object" ? d.note : null;
    if (nid && nt && strs(nt.points, 6).length) {
      const note = { node: nid, title: `${num(c, nid)} ${c.byId[nid].title}`, date: TODAY(), score: sc, points: strs(nt.points, 6), pitfalls: strs(nt.pitfalls, 4), example: String(nt.example || "") };
      Native.set("notes:" + c.id, { ...(Native.get("notes:" + c.id) || {}), [nid]: note });
      const nc = await ch.noteCard(note);
      setTimeout(() => tip("note-saved", nc, "笔记存进这门课的「笔记」页了，到复习那天我叫你"), 900);
    }
    const L = c.live;
    L.done = true;
    Native.del("live:" + c.id);
    const sum = items.filter(([ok]) => !ok).map(([, t]) => "没过：" + t).concat((this.revs || []).map(([id, ok]) => `复习 ${num(c, id)}：${ok ? "过了" : "没过"}`));
    saveSession(c, { id: L.sid, date: TODAY(), kind: "lesson", node: nid, title: L.title, tag: nid ? `${sc} 分` : `复习 ${(this.revs || []).filter((x) => x[1]).length}/${(this.revs || []).length}`, sum, done: true }, null);
    setTimeout(() => saveSession(c, c.sessions.find((x) => x.id === L.sid), ch.snap()), 2400);
    ch.setQuick([]);
    // 学完以后还能接着问，就是不再记分
    ch.onText = (t) => this.turnFree(t);
    await ch.chips([{ t: "回到课程", k: true, fn: () => toCourse(c) }, { t: "回首页", fn: popHome }]);
  }
  turnFree(t) { this.finished = true; this.input(`【这一节已经学完记了分】他又说：「${t}」`); }
}


function toCourse(c) {
  const prev = stack[stack.length - 2];
  if (prev && prev._course === c.id) return pop();
  popHome();
  setTimeout(() => push(CatView(c)), 380);
}



// ── 打开一节课 ──
// 上次没学完、页面被杀掉的那一节（还没学过才算）
function resumable(c) {
  const sv = Native.get("live:" + c.id);
  if (!sv?.html) return null;
  if (sv.nid && (!c.byId[sv.nid] || isDone(statusOf(c, sv.nid)))) { Native.del("live:" + c.id); return null; }
  return sv;
}
// 接着上：上次说到的地方原样摆回来（只能看，里面的题答不了了），导师带着之前的对话接着往下
function resumeLesson(c, sv) {
  const nid = sv.nid && c.byId[sv.nid] ? sv.nid : null, due = (sv.due || []).filter((id) => c.byId[id]);
  const ch = new Chat({ title: nid ? `${num(c, nid)} ${c.byId[nid].title}` : `复习 ${due.length} 节`, sub: `${c.cat} · ${c.title}`, quick: [] });
  const old = el("div", "resumed replay", sv.html);
  old.querySelectorAll(".q.cur").forEach((q) => q.classList.remove("cur"));
  ch.sc.append(old);
  c.live = { ch, sid: sv.sid, title: sv.title, done: false };
  saveSession(c, { ...(c.sessions.find((x) => x.id === sv.sid) || { id: sv.sid, date: TODAY(), kind: "lesson", node: nid, title: sv.title, sum: [] }), tag: "进行中", done: false });
  push(ch.v);
  requestAnimationFrame(() => (ch.sc.scrollTop = ch.sc.scrollHeight));
  const t = new Tutor(ch, c, nid, due);
  Object.assign(t, { msgs: sv.msgs || [], revs: sv.revs || [], answered: sv.answered || 0, manual: !!sv.manual });
  if (!t.msgs.length) t.msgs.push({ role: "user", content: "【这一节之前已经聊过的内容】\n" + old.innerText.slice(-3000) }, { role: "assistant", content: '{"say":"好，接着上次讲。"}' });
  // 旧对话不自动开口，等他先说（点下面的建议回复或者直接打字）
  t.resumed = true;
  ch.setQuick(["接着讲", "考我一道", "今天到这"]);
  ch.ph0 = ch.input.placeholder = "接着说就行，刚才那道题也可以直接答";
}
function openLesson(c, opt = {}) {
  if (needCfg("turn")) return;
  if (c.live && !c.live.done) { if (opt.review) toast("先把正在上的这节学完"); return push(c.live.ch.v); }
  const saved = !opt.review && resumable(c);
  if (saved) return resumeLesson(c, saved);
  const nid = opt.review ? null : currentOf(c), due = opt.review || dueOf(c);
  if (!nid && !due.length) return toast("这门课学完了");
  if (c.isNew) { c.isNew = false; Native.set("course:" + c.id, { ...Native.get("course:" + c.id), isNew: false }); }
  const title = nid ? `${due.length ? `复习 ${due.length} 节 · ` : ""}学 ${num(c, nid)} ${c.byId[nid].title}` : `复习 ${due.length} 节`;
  const ch = new Chat({ title: nid ? `${num(c, nid)} ${c.byId[nid].title}` : `复习 ${due.length} 节`, sub: `${c.cat} · ${c.title}`, quick: [] });
  c.live = { ch, sid: "s" + Date.now(), title, done: false };
  saveSession(c, { id: c.live.sid, date: TODAY(), kind: "lesson", node: nid, title, tag: "进行中", sum: [], done: false });
  push(ch.v);
  setTimeout(() => tip("lesson-type", ch.sc.firstElementChild, "不会就直接打字问，题也能打字答"), 2500);
  const t = new Tutor(ch, c, nid, due);
  t.manual = !!opt.review;
  t.start();
}


// ── 新对话：随便问，联网查了再答 ──
// 新对话：导师先开口——按他学到哪、栽过什么坑，说一两句，再给 3 个能直接点的问题（旧对话不这样，等他先说）
async function freeHello(c, ch) {
  const plain = `关于「${c.title}」，想问什么都行。`;
  if (!spendTurn(ch)) return;
  const cur = currentOf(c);
  const ctx = {
    "课名": c.title,
    "学过的节": c.list.filter((n) => isDone(statusOf(c, n.id))).slice(-5).map((n) => n.title),
    "正在学的节": cur ? c.byId[cur].title : "",
    "栽过的坑": c.p.miss.filter((m) => m.open).slice(-3).map((m) => m.text),
    "挂着的问题": Object.values(c.p.carry || {}).flat().slice(-3),
  };
  const live = await ch.live();
  try {
    const raw = await Native.llm([{ role: "system", content: PROMPTS.hello }, { role: "user", content: JSON.stringify(ctx) }], { json: true, maxTokens: 400, onDelta: (all) => { const s = partialStr(all, "say"); if (s?.text) live.set(s.text); } });
    const r = looseJSON(raw);
    live.end(r.say || plain);
    ch.setQuick((r.chips || []).filter((x) => typeof x === "string" && x).slice(0, 3));
  } catch { live.end(plain); }
}
function openFree(c) {
  if (needCfg("free")) return;
  const ch = new Chat({ title: "新对话", sub: `${c.cat} · ${c.title}`, ph: "想问什么都行", quick: [] });
  const sid = "f" + Date.now();
  (c.free || (c.free = {}))[sid] = ch;
  let first = "";
  push(ch.v);
  freeHello(c, ch);
  ch.onText = async (q) => {
    if (ch.busyQ) return ch.ai("上一个还在查，等我一下。");
    if (!spendTurn(ch)) return;
    ch.busyQ = true;
    if (!first) { first = q; ch.v.querySelector(".dtop h1").textContent = q; }
    try {
      let found, a;
      await ch.steps({ think: "在查…", done: "查完了", items: [
        { t: "联网查资料", run: async ({ r, srcs }) => { found = await Native.search(`${c.title.split("：")[0]} ${q}`.slice(0, 80)); found.results.slice(0, 5).forEach((s) => ch.chip(srcs, [siteOf(s)[0], siteOf(s)])); r.textContent = `${found.results.length} 条`; } },
        { t: "写回答", run: async () => { a = await llmJSON(PROMPTS.answer, { "课名": c.title, "整门课目录": c.list.map((x, i) => `第 ${i + 1} 节 ${x.title}`), "他的问题": q, "搜索结果": found.results.map((s, i) => ({ "序号": i + 1, "标题": s.title, "网站": s.site })), "摘要": (found.text || "").slice(0, 3500) }, { maxTokens: 1500 }); } },
      ] });
      const { text, cites } = renumber(a.text, found.results);
      await ch.ai(text || "没查到靠得住的说法。", cites);
      const n0 = c.list[(+a.node || 0) - 1], n = n0 && c.byId[n0.id];
      if (n && !isDone(statusOf(c, n.id))) {
        const yes = await ch.ask({ q: `第 ${n.i + 1} 节「${n.title}」专门讲这个。学到那一节时，把这个问题带上？`, yes: "带上", no: "不用" });
        if (yes) { { const cr = c.p.carry || (c.p.carry = {}); (cr[n.id] || (cr[n.id] = [])).push(q); } saveP(c); await ch.note(`学到 ${n.i + 1} 节时一起讲`, "带上了"); }
      }
    } catch (e) { await ch.ai("没查成：" + e.message); }
    ch.busyQ = false;
    saveSession(c, { id: sid, date: TODAY(), kind: "free", title: "问：" + first, tag: "提问", sum: [], done: true }, ch.snap());
  };
}
