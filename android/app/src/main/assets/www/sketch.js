// 手画的东西（rough.js）：便利贴小人、手写圈、勾、划线、手画气泡、纸屑。
// 每样画三版，CSS 轮流显示（.v0/.v1/.v2），线会轻轻地抖，像逐帧手绘
const SK = (() => {
  const NS = "http://www.w3.org/2000/svg", INK = "#1d1c1a", Y = "#ffd84a";
  const mk = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const grp = (...nodes) => { const g = mk("g"); nodes.flat().forEach((n) => n && g.appendChild(n)); return g; };
  const line = (s, w = 2.4, c = INK) => ({ seed: s, stroke: c, strokeWidth: w, roughness: 1.2, bowing: 1.3 });
  const hatch = (s, c = Y) => ({ seed: s, stroke: "none", fill: c, fillStyle: "hachure", hachureGap: 3, fillWeight: 2.4, hachureAngle: -42, roughness: 1.5 });
  const dot = (s, c = INK) => ({ seed: s, stroke: c, strokeWidth: 0.8, fill: c, fillStyle: "solid", roughness: 0.4 });

  // 在 svg 里画三版；drawIn>0 先一笔笔画出来再开始抖
  function sketch(svg, make, drawIn = 0) {
    svg.querySelectorAll(":scope > .v0, :scope > .v1, :scope > .v2").forEach((g) => g.remove());
    const rc = rough.svg(svg), gs = [];
    for (let k = 0; k < 3; k++) { const g = make(rc, 5 + k * 23); g.classList.add("v" + k); svg.appendChild(g); gs.push(g); }
    if (drawIn) {
      svg.classList.add("drawing");
      const ps = [...gs[0].querySelectorAll("path")];
      ps.forEach((p) => { const L = p.getTotalLength() + 2; p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
      requestAnimationFrame(() => requestAnimationFrame(() => ps.forEach((p, i) => { p.style.transition = `stroke-dashoffset ${drawIn}ms cubic-bezier(.5,0,.3,1) ${i * 50}ms`; p.style.strokeDashoffset = 0; })));
      setTimeout(() => { svg.classList.remove("drawing"); ps.forEach((p) => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; p.style.transition = ""; }); }, drawIn + ps.length * 50 + 100);
    }
    return svg;
  }
  // 给一个元素套一层手画：svg 盖在它上面，大小跟着元素
  function around(el, make, drawIn, pad = [8, 6]) {
    // 还没排版（页面没挂上、在隐藏的页签里）就等它有了尺寸再画，不然画成 0×0
    if (!el.offsetWidth) { const ro = new ResizeObserver(() => { if (el.offsetWidth) { ro.disconnect(); around(el, make, drawIn, pad); } }); ro.observe(el); return null; }
    let svg = el.querySelector(":scope > svg.sk");
    if (!svg) svg = mk("svg", { class: "sk" }, el);
    const w = el.offsetWidth + pad[0] * 2, h = el.offsetHeight + pad[1] * 2;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.style.cssText = `left:${-pad[0]}px;top:${-pad[1]}px;width:${w}px;height:${h}px`;
    return sketch(svg, (rc, s) => make(rc, s, w, h), drawIn);
  }
  const circle = (el, drawIn, pad) => around(el, (rc, s, w, h) => grp(rc.ellipse(w / 2, h / 2, w - 6, h - 4, { ...line(s, 2.4), roughness: 1.6, bowing: 2 })), drawIn, pad);
  const strike = (el, drawIn) => around(el, (rc, s, w, h) => grp(rc.line(4, h * 0.62, w - 4, h * 0.4, line(s, 2.6))), drawIn, [4, 4]);
  const marker = (el) => around(el, (rc, s, w, h) => grp(rc.rectangle(2, h * 0.5, w - 4, h * 0.45, { ...hatch(s), hachureGap: 2.2, fillWeight: 3, hachureAngle: -20 })), 0, [3, 0]);
  const check = (el, drawIn) => around(el, (rc, s, w, h) => grp(rc.linearPath([[w * 0.15, h * 0.55], [w * 0.4, h * 0.85], [w * 0.9, h * 0.1]], line(s, 3.2))), drawIn, [0, 0]);

  // 黄纸：在元素后面画一张便利贴（手画边、右下角折痕、顶上一截胶带）
  const paper = (el, { tape = true, tint = "#fff2a8" } = {}) => {
    el.classList.add("paper");
    return around(el, (rc, s, w, h) => grp(
      rc.rectangle(2, 2, w - 4, h - 4, { seed: s, stroke: INK, strokeWidth: 1.3, roughness: 1.1, bowing: 0.8, fill: tint, fillStyle: "solid" }),
      rc.path(`M${w - 20} ${h - 2} L${w - 2} ${h - 20}`, line(s, 1.2)),
      tape ? rc.rectangle(w / 2 - 22, -7, 44, 13, { seed: s, stroke: "#9b978d", strokeWidth: 1, fill: "#e4e0d5", fillStyle: "solid", roughness: 1 }) : null), 0, [0, 0]);
  };
  // 黄纸贴上去抖一会儿就停（聊天里攒多了一直抖费电）
  const paperStill = (el, opt) => { const svg = paper(el, opt); if (svg) setTimeout(() => svg.classList.add("still"), 2500); else setTimeout(() => el.querySelector(":scope > svg.sk")?.classList.add("still"), 4000); return svg; };
  // 啪地贴上去
  const slap = (el, rot = -1.2) => el.animate([{ transform: `rotate(${rot - 7}deg) scale(1.16)`, opacity: 0 }, { transform: `rotate(${rot + 1}deg) scale(.98)`, opacity: 1, offset: 0.7 }, { transform: `rotate(${rot}deg)` }], { duration: 420, easing: "cubic-bezier(.5,0,.75,0)" });

  // ── 便利贴小人（100×100 的画布） ──
  const LOOK = { think: [-2.5, -3], look: [1.6, 2.6] };
  function eyes(rc, s, cx, cy, gap, e) {
    const out = [], [dx, dy] = LOOK[e] || [0, 0];
    for (const x of [cx - gap / 2, cx + gap / 2]) {
      if (e === "happy" || e === "celebrate") out.push(rc.path(`M${x - 5} ${cy + 2} Q${x} ${cy - 6} ${x + 5} ${cy + 2}`, line(s, 2.6)));
      else if (e === "sleep") out.push(rc.path(`M${x - 5} ${cy} Q${x} ${cy + 5} ${x + 5} ${cy}`, line(s, 2.4)));
      else if (e === "blink") out.push(rc.line(x - 5, cy + 1, x + 5, cy + 1, line(s, 2.4)));
      else out.push(rc.ellipse(x + dx, cy + dy, 9, 10.5, dot(s)));
    }
    return out;
  }
  function mouth(rc, s, cx, my, e) {
    const o = line(s, 2.4);
    if (e === "celebrate") return rc.path(`M${cx - 10} ${my - 2} Q${cx} ${my + 13} ${cx + 10} ${my - 2} Z`, { ...dot(s), roughness: 0.8 });
    if (e === "happy") return rc.path(`M${cx - 11} ${my - 2} Q${cx} ${my + 10} ${cx + 11} ${my - 2}`, o);
    if (e === "wrong") return rc.path(`M${cx - 9} ${my + 2} Q${cx - 4.5} ${my - 2} ${cx} ${my + 2} Q${cx + 4.5} ${my + 6} ${cx + 9} ${my + 2}`, o);
    if (e === "think") return rc.ellipse(cx + 5, my + 2, 6, 6, o);
    if (e === "sleep") return rc.path(`M${cx - 5} ${my + 2} Q${cx} ${my + 4} ${cx + 5} ${my + 2}`, o);
    return rc.path(`M${cx - 9} ${my - 1} Q${cx} ${my + 7} ${cx + 9} ${my - 1}`, o);
  }
  // 问号、想事的小泡泡、开心的小闪线
  function marks(rc, s, e, x, y) {
    if (e === "wrong") return [rc.path(`M${x - 5} ${y} Q${x - 5} ${y - 8} ${x + 2} ${y - 8} Q${x + 9} ${y - 8} ${x + 8} ${y - 1} Q${x + 7} ${y + 4} ${x + 2} ${y + 6} L${x + 2} ${y + 11}`, line(s, 2.4)), rc.ellipse(x + 2, y + 17, 3.5, 3.5, dot(s))];
    if (e === "think") return [rc.ellipse(x - 5, y + 12, 5, 5, line(s, 1.8)), rc.ellipse(x + 4, y + 1, 9, 9, line(s, 1.8))];
    if (e === "happy" || e === "celebrate") return [rc.line(x - 2, y + 4, x + 6, y - 4, line(s, 2)), rc.line(x + 2, y + 11, x + 12, y + 9, line(s, 2)), rc.line(x - 9, y + 1, x - 9, y - 8, line(s, 2))];
    return [];
  }
  const drawNote = (rc, s, e) => grp(
    rc.rectangle(18, 21, 64, 62, hatch(s)),
    rc.path("M16 19 L84 20 L83 70 L69 85 L17 84 Z", line(s, 2.4)),
    rc.path("M83 70 L71 71 L69 85", line(s, 2)),
    rc.rectangle(37, 11, 26, 11, { seed: s, stroke: "#9b978d", strokeWidth: 1.3, fill: "#d9d5ca", fillStyle: "hachure", hachureGap: 2.4, fillWeight: 1.2, roughness: 1.2 }),
    eyes(rc, s, 50, 46, 20, e), mouth(rc, s, 50, 60, e), marks(rc, s, e, 92, 4));

  // 一张便利贴小人的 SVG 文本（只一版，不抖），小组件画到画布上用
  const noteSVG = (e) => { const svg = mk("svg", { xmlns: NS, viewBox: "0 0 100 100", width: 240, height: 240 }); svg.appendChild(drawNote(rough.svg(svg), 3, e)); return new XMLSerializer().serializeToString(svg); };

  class Note {
    // host：放小人的元素；size：边长（px）
    constructor(host, size, expr = "idle") {
      this.host = host; this.expr = expr;
      host.classList.add("note-m"); host.style.width = host.style.height = size + "px";
      this.svg = mk("svg", { viewBox: "0 0 100 100" }, host);
      this.paint(expr); this.sleep(expr === "sleep");
      let gone = 0;
      const blink = () => {
        if (host.classList.contains("still")) return;
        if (!host.isConnected) { if (++gone > 12) return; } else gone = 0;
        if (host.isConnected && (this.expr === "idle" || this.expr === "look")) { const e = this.expr; this.paint("blink"); setTimeout(() => this.expr === e && this.paint(e), 150); }
        setTimeout(blink, 2400 + Math.random() * 2800);
      };
      setTimeout(blink, 1500 + Math.random() * 1800);
    }
    paint(e) { [...this.svg.children].forEach((g) => g.remove()); const rc = rough.svg(this.svg); for (let k = 0; k < 3; k++) { const g = drawNote(rc, 3 + k * 17, e); g.classList.add("v" + k); this.svg.appendChild(g); } }
    set(e) { this.expr = e; this.paint(e); this.sleep(e === "sleep"); return this; }
    play(cls, ms) { const h = this.host; h.classList.remove(cls); void h.offsetWidth; h.classList.add(cls); clearTimeout(h["_" + cls]); if (ms) h["_" + cls] = setTimeout(() => h.classList.remove(cls), ms); return this; }
    // 不再眨眼、不再抖：聊天记录里旧的小人，省电
    still() { this.host.classList.add("still"); return this; }
    sleep(on) {
      this.host.classList.toggle("nm-sleep", on);
      let z = this.host.querySelector(".zz");
      if (on && !z) { z = document.createElement("div"); z.className = "zz"; z.innerHTML = "<i>z</i><i>z</i><i>Z</i>"; this.host.appendChild(z); }
      if (!on && z) z.remove();
    }
  }

  // 手画框的一句话，挂在 anchor 下面，2.6 秒后消失
  function bubble(anchor, text, root) {
    root.querySelectorAll(":scope > .bub").forEach((b) => b.remove());
    const b = document.createElement("div"); b.className = "bub"; b.innerHTML = `<svg></svg><span></span>`; b.querySelector("span").textContent = text;
    root.appendChild(b);
    const ar = anchor.getBoundingClientRect(), rr = root.getBoundingClientRect(), w = b.offsetWidth, h = b.offsetHeight;
    const x = Math.max(12, Math.min(rr.width - w - 12, ar.left - rr.left + ar.width / 2 - w / 2));
    b.style.left = x + "px"; b.style.top = ar.bottom - rr.top + root.scrollTop + 6 + "px";
    const svg = b.querySelector("svg"); svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    sketch(svg, (rc, s) => grp(rc.rectangle(2, 2, w - 4, h - 4, { seed: s, stroke: INK, strokeWidth: 1.8, roughness: 1.4, fill: "#fff", fillStyle: "solid" })));
    b.animate([{ opacity: 0, transform: "translateY(-6px) scale(.9)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "cubic-bezier(.3,1.4,.5,1)" });
    setTimeout(() => { b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" }).onfinish = () => b.remove(); }, 2600);
  }

  // 从 (x, y) 撒一把手画纸屑
  function confetti(root, x, y, n = 16) {
    for (let i = 0; i < n; i++) {
      const s = mk("svg", { viewBox: "0 0 20 20", class: "cf" }); root.appendChild(s);
      const rc = rough.svg(s), t = i % 4;
      s.appendChild(t === 0 ? rc.rectangle(4, 4, 12, 12, { seed: i + 1, stroke: INK, strokeWidth: 1.2, fill: Y, fillStyle: "hachure", hachureGap: 2.2, roughness: 1.4 })
        : t === 1 ? rc.line(3, 17, 17, 3, { seed: i + 1, stroke: INK, strokeWidth: 2, roughness: 1.6 })
        : t === 2 ? rc.ellipse(10, 10, 9, 9, { seed: i + 1, stroke: "#2f4bff", strokeWidth: 2 })
        : rc.path("M2 10 Q6 4 10 10 T18 10", { seed: i + 1, stroke: INK, strokeWidth: 1.8, roughness: 1 }));
      s.style.left = x - 9 + "px"; s.style.top = y - 9 + "px";
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, d = 60 + Math.random() * 90, dx = Math.cos(a) * d, dy = Math.sin(a) * d, r = (Math.random() - 0.5) * 540;
      s.animate([{ transform: "translate(0,0) scale(.3)", opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(1) rotate(${r / 2}deg)`, opacity: 1, offset: 0.45 }, { transform: `translate(${dx * 1.15}px,${dy + 130}px) scale(.9) rotate(${r}deg)`, opacity: 0 }],
        { duration: 1300 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }).onfinish = () => s.remove();
    }
  }
  const centerIn = (el, root) => { const a = el.getBoundingClientRect(), r = root.getBoundingClientRect(); return [a.left - r.left + a.width / 2, a.top - r.top + a.height / 2 + root.scrollTop]; };

  return { sketch, circle, strike, marker, check, paper, paperStill, slap, noteSVG, Note, bubble, confetti, centerIn };
})();
