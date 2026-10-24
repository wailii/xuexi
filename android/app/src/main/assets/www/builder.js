// 建课：问几句 → 定方案 → 联网搜资料 → 排章节 → 补漏 → 一节节写 → 检查每一节。
// 和电脑上 skill 的建课流水线同一个顺序。每一步做完就存（build），App 被杀了重开能接着建。
const BUILD_STEPS = ["联网搜资料", "排出章节", "挑毛病，补漏掉的", "一节节写：学到什么程度、怎么追问、出处", "检查每一节写得够不够"];
const BUILD_NAMES = ["搜资料", "排章节", "补漏", "一节节写", "检查"];
// 所有课的封面都是同一种样子：博物馆藏品图录式的单件静物
const COVER_STYLE = (obj) => `博物馆藏品图录风格的静物摄影：${obj}。只有这一件东西，放在画面正中略偏下，约占画面宽度四成，浅灰白无缝背景，柔和漫射的自然光，淡淡的投影，极简，高级，真实材质细节，大量留白`;
const COVER_NEG = "文字，水印，标志，人物，手，多个物体，杂乱背景，卡通，插画，3D 渲染感，过度饱和，边框";
const makeCover = (B) => {
  if (B.coverDone || B.coverP || !B.plan.cover_object) return;
  B.coverP = Native.image(COVER_STYLE(B.plan.cover_object), COVER_NEG)
    .then((d) => { Native.set("cover:" + B.id, d); B.coverDone = true; saveBuild(); })
    .catch(() => {}).finally(() => { B.coverP = null; });
};
const saveBuild = () => { const { ch, bgTip, bgCheck, coverP, ...b } = S.build; Native.set("build", b); };

function openBuild() {
  if (!(S.build?.started && !S.build.viewed) && needCfg("build")) return;
  const B = S.build;
  if (B && B.started && !B.viewed) {
    if (!B.ch) { B.ch = buildChat(); B.ch.ai(`接着建「${B.plan.title}」。`); B.ch.phase(2); runBuild(B); }
    return push(B.ch.v);
  }
  const ch = buildChat();
  push(ch.v);
  askBuild(ch);
}
const buildChat = () => new Chat({ title: "新课", sub: "先问几句，再联网查资料建课", ph: "直接打字也行", quick: [] });

// 建课前的对话：每一轮交给模型，它问一件事（可点选项，也可以直接打字）；你纠正它就改；信息够了给方案，你说改就再改
async function askBuild(ch) {
  ch.phase(0);
  const msgs = [];
  let busy = false, queue = null, asked = false;
  const sys = () => PROMPTS.build + "\n\n## 已有的分类\n" + JSON.stringify(S.courses.map((c) => c.cat));
  const go = async (text) => {
    if (busy) { queue = text; return; }
    busy = true;
    ch.setQuick([]);
    msgs.push({ role: "user", content: text });
    const live = await ch.live();
    let raw = "";
    try {
      raw = await Native.llm([{ role: "system", content: sys() }, ...msgs.slice(-24)], { json: true, maxTokens: 2500, onDelta: (all) => { const s = partialStr(all, "say"); if (s?.text) live.set(s.text); } });
    } catch (e) {
      live.end(""); msgs.pop(); busy = false;
      await ch.fail("没连上模型", e);
      return go(text);
    }
    let r;
    try { r = looseJSON(raw); } catch { r = { say: partialStr(raw, "say")?.text || "" }; }
    msgs.push({ role: "assistant", content: raw });
    live.end(r.say || "");
    busy = false;
    if (!r.say && !r.plan?.title && !r.question?.q) { msgs.pop(); msgs.pop(); await ch.fail("模型这一轮没说出话来", ""); return go(text); }
    ch.abort?.();
    if (r.plan?.title) showPlan(normPlan(r.plan));
    else if (r.question?.q && (r.question.opts || []).filter(Boolean).length >= 2) askQ(r.question);
    else ch.setQuick((r.chips || []).filter((x) => typeof x === "string" && x).slice(0, 3));
    if (queue) { const q = queue; queue = null; go(q); }
  };
  const askQ = async (q) => {
    if (!asked) { asked = true; ch.phase(1); }
    const opts = q.opts.filter(Boolean).map(String).slice(0, 5);
    if (q.multi) {
      const r = await ch.multi({ q: q.q + " 可以多选。", opts });
      if (r?.jump) return;
      go(`他选了：${r.join("、")}`);
    } else {
      const r = await ch.choice({ q: q.q, opts: opts.map((t, i) => [LETTERS[i], t]), row: opts.length === 3 && opts.every((t) => t.length <= 6) });
      if (r?.jump) return;
      go(`他选了：${opts[LETTERS.indexOf(r.key)]}`);
    }
  };
  const normPlan = (p) => {
    const plan = { ...p };
    plan.minutes = +plan.minutes || 20;
    plan.focus = (plan.focus || []).filter(Boolean);
    plan.queries = (plan.queries || []).filter(Boolean).slice(0, 8);
    if (!plan.queries.length) plan.queries = [plan.title];
    const base = String(plan.cat || plan.title.split("：")[0]).slice(0, 8);
    let cat = base, n = 1;
    while (S.courses.some((c) => c.cat === cat)) cat = `${base} ${++n}`;
    plan.cat = cat;
    return plan;
  };
  const showPlan = async (plan) => {
    if (!asked) { asked = true; ch.phase(1); }
    await ch.ai("按这个建，行吗？");
    await ch.card(`<b>建课方案</b><h5>${esc(plan.title)}</h5><p>分类：${esc(plan.cat)}<br>从这里讲起：${esc(String(plan.start || "从头讲").replace(/^从/, "").replace(/讲起$/, "") || "从头讲")}<br>先讲：${esc(plan.focus.join("、") || "按顺序来")}<br>每天 ${plan.minutes} 分钟</p>`);
    const yes = await ch.ask({ q: "建课一般要 3 到 5 分钟，可以先去忙别的，建好了通知你。哪里不对直接打字说。", yes: "开始建课", no: "再改改" });
    if (yes === true) start(plan);
    else if (yes === false) { await ch.ai("想改哪里？直接说。"); ch.setQuick(["换个课名", "从更基础讲起", "多讲点实操"]); }
  };
  const start = (plan) => {
    if (needCfg("build")) return;
    if (usingTrial()) Native.trialUse("build");
    ch.onText = null;
    ch.setQuick([]);
    S.build = { id: "c" + Date.now(), plan, step: 1, frac: 0, started: true, ch, sources: [], digest: [], searched: [], areas: null, nodes: {}, done: false, viewed: false };
    saveBuild();
    ch.phase(2);
    runBuild(S.build);
  };
  ch.onText = (t, ctx) => go(ctx?.card ? `他没点选项，直接打字回答：「${t}」` : `他说：「${t}」`);
  await ch.ai("想学什么？说个大概就行，也可以直接打字。");
  ch.setQuick(["宋朝", "量子力学入门", "怎么看懂财报"]);
}

async function runBuild(B) {
  const ch = B.ch;
  B.error = null;
  Native.keepAlive(true, `正在建课 · ${B.plan.title}`);
  const set = (step, frac = 0) => { B.step = step; B.stepName = BUILD_NAMES[step - 1]; B.frac = frac; saveBuild(); syncMorph(); };
  const plan = B.plan;
  const flat = () => B.areas.flatMap((a) => a.nodes.map((n) => ({ ...n, area: a.name })));
  const outline = () => flat().map((n, i) => `${i + 1}. [${n.area}] ${n.title}`);
  const brief = () => ({ "课名": plan.title, "学习者": plan.profile, "学完能做到": plan.goal, "学到多深": plan.depth, "追问往哪拉": plan.orientation });
  const srcList = () => B.sources.map((s, i) => ({ "序号": i + 1, "标题": s.title, "网站": s.site }));
  const digest = (n) => B.digest.join("\n\n").slice(0, n);
  let away;
  try {
    await ch.steps({ think: "正在建课", done: "建好了", items: [
      { t: BUILD_STEPS[0], run: async ({ r, srcs, x }) => {
        // 这门课要搜的几个方向，搜完一个打个勾
        const showQ = () => (x.innerHTML = plan.queries.map((q) => `${B.searched.includes(q) ? "✓" : "·"} ${esc(q)}`).join("<br>"));
        showQ();
        B.bgTip?.remove(); if (B.bgCheck) document.removeEventListener("visibilitychange", B.bgCheck);
        const bg = !Native.bgAllowed() && (B.bgTip = await ch.tip("切到别的 App，手机会暂停建课，回来接着建。想切走也不停：后台耗电管理 → 学习 → 允许后台耗电。"));
        away = await ch.chips([{ t: "先去忙别的", fn: () => popHome() }, ...(bg ? [{ t: "去设置", fn: () => { Native.openBg(); toast("电池 → 后台耗电管理 → 学习 → 允许后台耗电"); } }] : [])]);
        if (bg) {
          const recheck = B.bgCheck = () => {
            if (document.visibilityState !== "visible" || !Native.bgAllowed()) return;
            document.removeEventListener("visibilitychange", recheck);
            bg.remove(); away?.querySelectorAll("button")[1]?.remove(); toast("好了，切走也会接着建");
          };
          document.addEventListener("visibilitychange", recheck);
        }
        set(1);
        makeCover(B);
        B.sources.forEach((s) => ch.chip(srcs, [siteOf(s)[0], siteOf(s)]));
        const todo = plan.queries.filter((q) => !B.searched.includes(q));
        for (let i = 0; i < todo.length; i += 3) {
          const got = await Promise.allSettled(todo.slice(i, i + 3).map(async (q) => {
            const f = await Native.search(q);
            B.digest.push(`【${q}】${(f.text || "").slice(0, 1600)}`);
            for (const s of f.results) if (s.url && !B.sources.some((x) => x.url === s.url) && B.sources.length < 48) { B.sources.push(s); ch.chip(srcs, [siteOf(s)[0], siteOf(s)]); }
            B.searched.push(q); showQ();
            r.textContent = `${B.sources.length} 个来源`; set(1, B.searched.length / plan.queries.length); ch.follow();
          }));
          const bad = got.find((g) => g.status === "rejected");
          if (bad && !B.sources.length) throw bad.reason;
        }
        r.textContent = `${B.sources.length} 个来源`;
      } },
      { t: BUILD_STEPS[1], mono: false, run: async ({ r, x }) => {
        set(2);
        if (!B.areas) {
          const o = await llmJSON(PROMPTS.skeleton, { ...brief(), "先讲的几块": plan.focus, "资料摘要": digest(9000), "来源": srcList() }, { maxTokens: 6000 });
          B.areas = (o.areas || []).filter((a) => a.name && a.nodes?.length).map((a) => ({ name: a.name, nodes: a.nodes.filter((n) => n.title).map((n) => ({ title: n.title, bloom: n.bloom || "understand", deps: n.deps || [] })) }));
          if (flat().length < 5) { B.areas = null; throw new Error("目录排得太少"); }
          saveBuild();
        }
        x.innerHTML = B.areas.map((a) => `${esc(a.name)} · ${a.nodes.length} 节`).join("<br>");
        r.textContent = `${flat().length} 节`;
      } },
      { t: BUILD_STEPS[2], run: async ({ r, x }) => {
        set(3);
        if (!B.gapped) {
          const o = await llmJSON(PROMPTS.gaps, { "课名": plan.title, "学完能做到": plan.goal, "目录": outline(), "资料摘要": digest(6000) }, { maxTokens: 2000 });
          const adds = (o.add || []).filter((a) => a.title).slice(0, 4).sort((a, b) => (b.after || 0) - (a.after || 0));
          for (const a of adds) {
            // 插到指定那一节后面所在的章里；插好后，排在它后面的节序号都 +1，依赖跟着顺延
            const list = flat(), after = Number.isFinite(+a.after) ? Math.min(Math.max(+a.after, 0), list.length) : list.length;
            const area = B.areas.find((z) => z.name === a.area) || B.areas.find((z) => z.name === list[after - 1]?.area) || B.areas[B.areas.length - 1];
            const posInArea = Math.max(0, list.slice(0, after).filter((n) => n.area === area.name).length);
            const node = { title: a.title, bloom: a.bloom || "understand", deps: [], late: true };
            area.nodes.splice(posInArea, 0, node);
            const q = flat().findIndex((n) => n.title === node.title && n.late) + 1;
            for (const z of B.areas) for (const n of z.nodes) if (n !== node) n.deps = n.deps.map((d) => (d >= q ? d + 1 : d));
            node.deps = (a.deps || []).map(Number).filter((d) => d >= 1 && d < q);
          }
          B.gapped = true;
          B.added = adds.map((a) => a.title);
          saveBuild();
        }
        x.innerHTML = (B.added || []).map((t) => `+ ${esc(t)}`).join("<br>");
        r.textContent = B.added?.length ? `补了 ${B.added.length} 节` : "没有漏的";
      } },
      { t: BUILD_STEPS[3], mono: true, run: async ({ r, x }) => {
        set(4);
        const list = flat(), todo = list.map((_, i) => i + 1).filter((n) => !B.nodes[n]);
        const batches = []; for (let i = 0; i < todo.length; i += 3) batches.push(todo.slice(i, i + 3));
        const write = async (ns) => {
          x.textContent = ns.map((n) => `${pad2(n)} ${list[n - 1].title}`).join("\n");
          const o = await llmJSON(PROMPTS.nodes, { ...brief(), "整门课目录": outline(), "这次要写的": ns.map((n) => ({ "全局序号": n, "节名": list[n - 1].title })), "来源": srcList(), "资料摘要": digest(5000) }, { maxTokens: 6000 });
          for (const w of o.nodes || []) if (ns.includes(+w.n) && w.objective) B.nodes[+w.n] = { objective: w.objective, seeds: (w.seeds || []).filter(Boolean), anchors: (w.anchors || []).filter((a) => B.sources[a.src - 1]) };
          saveBuild();
          const done = Object.keys(B.nodes).length;
          r.textContent = `${done}/${list.length}`; set(4, done / list.length);
        };
        for (let i = 0; i < batches.length; i += 3) await Promise.all(batches.slice(i, i + 3).map((b) => write(b).catch(() => {})));
        const left = list.map((_, i) => i + 1).filter((n) => !B.nodes[n]);
        for (let i = 0; i < left.length; i += 2) await write(left.slice(i, i + 2));
        x.textContent = "";
        if (list.some((_, i) => !B.nodes[i + 1])) throw new Error("有几节没写出来");
        r.textContent = `${list.length}/${list.length}`;
      } },
      { t: BUILD_STEPS[4], run: async ({ r }) => {
        set(5);
        // 写得太薄的（要求不具体、追问少于 2 个）重写一次
        const thin = Object.entries(B.nodes).filter(([, w]) => w.objective.length < 80 || w.seeds.length < 2).map(([n]) => +n);
        const list = flat();
        if (thin.length && !B.checked) {
          r.textContent = `${thin.length} 节偏薄，重写`;
          for (let i = 0; i < thin.length; i += 3) {
            const ns = thin.slice(i, i + 3);
            const o = await llmJSON(PROMPTS.nodes, { ...brief(), "整门课目录": outline(), "这次要写的": ns.map((n) => ({ "全局序号": n, "节名": list[n - 1].title, "上次写得太薄": true })), "来源": srcList(), "资料摘要": digest(5000) }, { maxTokens: 6000 }).catch(() => ({}));
            for (const w of o.nodes || []) if (ns.includes(+w.n) && w.objective?.length >= 80) B.nodes[+w.n] = { objective: w.objective, seeds: (w.seeds || []).filter(Boolean), anchors: (w.anchors || []).filter((a) => B.sources[a.src - 1]) };
          }
        }
        B.checked = true;
        r.textContent = `${list.length} 节都过了`;
      } },
    ] });
  } catch (e) {
    away?.remove();
    B.error = e.message || "出错了"; saveBuild(); syncMorph();
    Native.keepAlive(false);
    if (stack[stack.length - 1] !== ch.v) Native.notify("建课停了", `${plan.title}：${B.error}，点开重试`);
    await ch.fail(`第 ${B.step} 步没做完`, e);
    return runBuild(B);
  }
  away?.remove();
  if (B.coverP) await Promise.race([B.coverP, sleep(20000)]);
  // 存成一门课：节的编号、依赖、出处都落成和电脑上 skill 一样的格式
  const list = flat();
  const ids = list.map((_, i) => `N-${pad2(i + 1)}`);
  const course = {
    id: B.id, cat: plan.cat, title: plan.title, cover: plan.cover || "book", profile: plan.profile, goal: plan.goal, depth: plan.depth, orientation: plan.orientation, minutes: plan.minutes,
    areas: B.areas.map((a) => a.name), isNew: true, created: TODAY(),
    nodes: list.map((n, i) => {
      const w = B.nodes[i + 1];
      return { id: ids[i], title: n.title, area: n.area, bloom: n.bloom, deps: (n.deps || []).filter((d) => d >= 1 && d <= i).map((d) => ids[d - 1]), objective: w.objective, seeds: w.seeds, late: !!n.late,
        anchors: w.anchors.map((a) => { const s = B.sources[a.src - 1]; return { name: s.title, url: s.url, note: [s.site, a.note].filter(Boolean).join("：") }; }) };
    }),
  };
  Native.set("course:" + course.id, course);
  Native.set("courses", [...(Native.get("courses") || []), course.id]);
  const c = loadCourse(course.id);
  c.fresh = true;
  S.courses.push(c);
  B.done = true; B.total = list.length; saveBuild(); syncMorph();
  Native.keepAlive(false);
  if (stack[stack.length - 1] === homeV) renderHome(false);
  if (stack[stack.length - 1] === ch.v) markViewed();
  else Native.notify("课建好了", `${plan.title} · ${list.length} 节`);
  ch.phase(3);
  const weeks = Math.max(1, Math.round((list.length * 15) / plan.minutes / 7));
  await ch.ai(`建好了：**${list.length} 节**，分 ${B.areas.length} 章。每天 ${plan.minutes} 分钟，大约 ${weeks} 周学完。`);
  await builtCard(ch, c);
}

function markViewed() {
  const B = S.build;
  if (!B || B.viewed) return null;
  B.viewed = true;
  Native.del("build");
  syncMorph();
  return S.courses.find((c) => c.id === B.id) || null;
}

async function builtCard(ch, c) {
  await ch.lock;
  const groups = (c.areas || []).map((a) => ({ a, ns: c.list.filter((n) => n.area === a) }));
  const card = ch.add(el("div", "built", `<div class="cover"><img src="${coverOf(c)}" alt=""></div>
    <div class="bd"><h3>${esc(c.title)}</h3><div class="nums"><div><b>${c.list.length}</b><span>节</span></div><div><b>${groups.length}</b><span>章</span></div><div><b>${new Set(c.list.flatMap((n) => n.anchors.map((a) => a.url))).size}</b><span>个来源</span></div></div></div>
    ${groups.map((g, i) => `<div class="area ${i ? "" : "open"}"><button><span>${esc(g.a)}</span><em>${g.ns.length} 节</em></button><div class="ls"><div><ul>${g.ns.map((n) => `<li class="${n.id === c.list[0].id ? "first" : ""}"><b>${num(c, n.id)}</b><span>${esc(n.title)}</span><em>${n.id === c.list[0].id ? "能学" : n.late ? "补的" : ""}</em></li>`).join("")}</ul></div></div></div>`).join("")}
    <div class="ft"><button class="solid">开始第一课</button></div><span class="bnote"></span>`));
  card.querySelectorAll(".area > button").forEach((b) => (b.onclick = () => b.parentElement.classList.toggle("open")));
  card.querySelector(".solid").onclick = () => { markViewed(); openLesson(c); };
  rise(card.querySelectorAll(".bd, .area, .ft"), 100, 70);
  const nh = card.querySelector(".bnote"), m = new SK.Note(nh, 54, "celebrate");
  setTimeout(() => { const [x, y] = SK.centerIn(nh, card); SK.confetti(card, x, y, 16); m.play("nm-party", 1200); }, 400);
  setTimeout(() => m.set("happy"), 2000); setTimeout(() => m.still(), 4000);
}

// ── 启动 ──
(async () => {
  migrate();
  loadAll();
  await Promise.race([document.fonts.ready, sleep(1500)]);
  push(Home());
  renderHome(true);
  requestAnimationFrame(() => {
    syncMorph();
    morph.classList.add("away");
    setTimeout(() => { if (stack[stack.length - 1] !== homeV) return; morph.classList.remove("away"); morph.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], { duration: SNAP.ms, easing: SNAP.easing }); }, 500);
  });
  const b = Native.get("build");
  if (!b || b.done || !b.started) Native.keepAlive(false);
  if (b && b.started && !b.viewed) {
    S.build = b;
    if (b.done) syncMorph();
    else { b.ch = buildChat(); b.ch.ai(`接着建「${b.plan.title}」。`); requestAnimationFrame(() => b.ch.phase(2)); runBuild(b); }
  }
})();
