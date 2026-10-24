// 桌面小组件：在页面里把样子画好（黄纸、便利贴小人、手写字，和首页同一套），交给原生贴到桌面上。
// 两种尺寸（2×2、4×2），每种再画一张「新的一天」：过了零点还没打开 App 时，原生换成这张，不显示昨天的数
const Widget = (() => {
  const INK = "#1d1c1a", PAPER = "#fff2a8", HAND = '"Hand", "LXGW WenKai Screen", "Noto Sans SC", sans-serif';
  const img = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
  const note = (e) => img("data:image/svg+xml;charset=utf-8," + encodeURIComponent(SK.noteSVG(e)));
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d"), rough.canvas(c)]; };
  const ink = (s, w = 3.2) => ({ seed: s, stroke: INK, strokeWidth: w, roughness: 1.2, bowing: 1.4 });
  function paper(rc, w, h) {
    rc.rectangle(10, 16, w - 20, h - 26, { seed: 7, stroke: INK, strokeWidth: 3, roughness: 1.1, bowing: 0.8, fill: PAPER, fillStyle: "solid" });
    rc.line(w - 50, h - 10, w - 10, h - 50, { seed: 7, stroke: INK, strokeWidth: 2.4, roughness: 1 });
    rc.rectangle(w / 2 - 52, 2, 104, 28, { seed: 7, stroke: "#9b978d", strokeWidth: 2, fill: "#e4e0d5", fillStyle: "solid", roughness: 1 });
  }
  const text = (g, t, x, y, px) => { g.font = `${px}px ${HAND}`; g.fillStyle = INK; g.textBaseline = "alphabetic"; g.fillText(t, x, y); return g.measureText(t).width; };
  const fitText = (g, t, px, max) => { g.font = `${px}px ${HAND}`; if (g.measureText(t).width <= max) return t; while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1); return t + "…"; };
  // 「还剩 (2) 节」：数字用笔圈起来
  function count(g, rc, x, y, n, big) {
    let cx = x + text(g, "还剩", x, y, big * 0.42) + big * 0.18;
    const nw = text(g, String(n), cx + big * 0.16, y, big);
    rc.ellipse(cx + big * 0.16 + nw / 2, y - big * 0.34, nw + big * 0.5, big * 0.98, { ...ink(11, 3.6), roughness: 1.6, bowing: 2 });
    text(g, "节", cx + nw + big * 0.5, y, big * 0.42);
  }
  // 荧光笔：在字后面先涂一道黄
  function marked(g, rc, t, x, y, px) {
    g.font = `${px}px ${HAND}`;
    const w = g.measureText(t).width;
    rc.rectangle(x - 4, y - px * 0.42, w + 8, px * 0.5, { seed: 5, stroke: "none", fill: "#ffcf2e", fillStyle: "hachure", hachureGap: 3, fillWeight: 4, hachureAngle: -20, roughness: 1.4 });
    text(g, t, x, y, px);
  }
  const check = (rc, x, y, s) => rc.linearPath([[x, y + s * 0.5], [x + s * 0.35, y + s * 0.85], [x + s, y]], ink(13, 4.5));
  const exprOf = (st) => (st.kind === "done" ? "sleep" : st.kind === "new" ? "happy" : "idle");
  async function putNote(g, st, x, y, s, rot) {
    const n = await note(exprOf(st));
    g.save(); g.translate(x + s / 2, y + s / 2); g.rotate((rot * Math.PI) / 180); g.drawImage(n, -s / 2, -s / 2, s, s); g.restore();
    if (st.kind === "done") text(g, "z Z", x + s * 0.78, y + s * 0.1, s * 0.22);
  }
  async function small(st) {
    const [c, g, rc] = canvas(440, 440);
    paper(rc, 440, 440);
    await putNote(g, st, 300, 46, 116, 8);
    if (st.kind === "todo") { count(g, rc, 44, 276, st.left, 128); marked(g, rc, `大约 ${st.min} 分钟`, 50, 372, 38); }
    else if (st.kind === "done") { text(g, "今天", 48, 150, 60); text(g, "学完了", 48, 250, 84); check(rc, 300, 200, 70); text(g, "明天见", 50, 360, 38); }
    else if (st.kind === "new") { text(g, "新的一天", 48, 250, 70); text(g, "来学一节？", 50, 340, 46); }
    else { text(g, "还没有课", 48, 250, 66); text(g, "说说想学什么", 50, 340, 42); }
    return c.toDataURL("image/png");
  }
  async function wide(st) {
    const [c, g, rc] = canvas(880, 420);
    paper(rc, 880, 420);
    await putNote(g, st, 52, 92, 216, -6);
    const x = 316;
    if (st.kind === "todo") {
      count(g, rc, x, 214, st.left, 128);
      marked(g, rc, `大约 ${st.min} 分钟`, x + 4, 292, 36);
      if (st.first) text(g, fitText(g, st.first, 32, 520), x + 4, 360, 32);
    } else if (st.kind === "done") { text(g, "今天学完了", x, 200, 84); check(rc, x + 440, 140, 70); text(g, "明天见", x + 4, 300, 40); }
    else if (st.kind === "new") { text(g, "新的一天", x, 200, 84); text(g, "来学一节？", x + 4, 300, 46); }
    else { text(g, "还没有课", x, 200, 84); text(g, "说说想学什么", x + 4, 300, 44); }
    return c.toDataURL("image/png");
  }
  let last = "", timer = 0;
  return {
    small, wide,
    // 首页每次刷新都调；数没变就不重画
    push(left, min, first) {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!Native.android) return;
        const kind = !S.courses.length ? "none" : left ? "todo" : "done", key = JSON.stringify([TODAY(), kind, left, min, first]);
        if (key === last) return;
        last = key;
        try {
          await document.fonts.load(`40px ${HAND}`, "还剩节今天学完了新的一天来学一节大约分钟明天见没有课说说想学什么0123456789" + (first || ""));
          const st = { kind, left, min, first };
          Native.widget({ date: TODAY(), small: await small(st), wide: await wide(st), smallNew: await small({ kind: "new" }), wideNew: await wide({ kind: "new" }) });
        } catch { last = ""; }
      }, 1500);
    },
  };
})();
