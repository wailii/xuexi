// 原生能力：调模型、联网搜、存东西、通知、保活。
// 安卓里走 AndroidBridge（结果异步回到 window.__native）；电脑上调试走 tools/dev.py，存东西用 localStorage。
const JUNK = /什么值得买|smzdm|美篇|meipian|百度教育|easylearn|作业帮|zuoyebang|哔哩哔哩|bilibili|抖音|douyin|快手|小红书|xiaohongshu|百家号|baijiahao|网易号|163\.com\/dy|搜狐号|sohu\.com\/a\/|今日头条|toutiao|360doc|豆丁|docin|道客巴巴|doc88|原创力文档|book118|淘宝|京东|jd\.com/i;
const Native = (() => {
  const A = window.AndroidBridge;
  const pend = new Map();
  let seq = 0;
  window.__native_delta = (id, text) => pend.get(id)?.delta?.(text);
  window.__native = (id, ok, payload) => {
    const p = pend.get(id);
    if (!p) return;
    pend.delete(id);
    ok ? p.res(payload) : p.rej(new Error(payload));
  };
  const call = (fn, ...args) => new Promise((res, rej) => { const id = "n" + ++seq; pend.set(id, { res, rej }); A[fn](id, ...args); });
  const callStream = (fn, onDelta, ...args) => new Promise((res, rej) => { const id = "n" + ++seq; pend.set(id, { res, rej, delta: onDelta }); A[fn](id, ...args); });
  // 电脑上：调试服务器一段段回，攒起来交给 onDelta
  const postStream = async (body, onDelta) => {
    const r = await fetch("/api/llm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, stream: true }) });
    const rd = r.body.getReader(), dec = new TextDecoder();
    let all = "";
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      all += dec.decode(value, { stream: true });
      const err = all.indexOf("\u0000ERR");
      if (err >= 0) throw new Error(all.slice(err + 4));
      onDelta(all);
    }
    if (!all) throw new Error("模型没返回内容");
    return all;
  };
  const post = async (path, body) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    if (!r.ok) throw new Error(t || `出错了（${r.status}）`);
    return t;
  };
  const key = (k) => "ls:" + k;
  // 网断了再试：vivo 切到后台几秒就冻住 App，正在等的连接会被掐断，回到前台再接着要。Key、额度这类错不重试
  const NETERR = /连不上|等太久|网络|abort|reset|timed? ?out|Failed to fetch|NetworkError|EOF|closed|（5\d\d）/i;
  const front = () => document.visibilityState === "visible" ? Promise.resolve() : new Promise((r) => {
    const f = () => { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", f); r(); } };
    document.addEventListener("visibilitychange", f);
  });
  const again = async (fn) => {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) {
        const m = e.message || "", slow = /等太久|timed? ?out/i.test(m);
        if (i >= (slow ? 1 : 3) || !NETERR.test(m)) throw e;
        if (!(A?.bgAllowed ? A.bgAllowed() : true)) await front();
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  };
  return {
    android: !!A,
    llm(messages, opt = {}) {
      const body = { messages, json: !!opt.json, maxTokens: opt.maxTokens || 8000 };
      if (opt.onDelta) return again(() => A ? callStream("llmStream", opt.onDelta, JSON.stringify(body)) : postStream(body, opt.onDelta));
      return again(() => A ? call("llm", JSON.stringify(body)) : post("/api/llm", body));
    },
    // 联网搜：购物、题库、短视频、自媒体这类站点的结果不要，课程和出处不能拿它们当依据
    async search(q) {
      const r = JSON.parse(await again(() => A ? call("search", q) : post("/api/search", { q })));
      r.results = (r.results || []).filter((x) => x.url && !JUNK.test(`${x.site} ${x.url}`));
      return r;
    },
    // 生一张封面图，回 data URL
    image(prompt, neg = "") { return again(() => A ? call("image", prompt, neg) : post("/api/image", { prompt, neg })); },
    get(k) {
      try { const v = A ? A.get(k) : localStorage.getItem(key(k)); return v == null || v === "" ? null : JSON.parse(v); } catch { return null; }
    },
    set(k, v) { const s = JSON.stringify(v); A ? A.set(k, s) : localStorage.setItem(key(k), s); },
    del(k) { A ? A.del(k) : localStorage.removeItem(key(k)); },
    notify(title, text) { A?.notify(title, text); },
    keepAlive(on, text = "") { A?.keepAlive(!!on, text); },
    // 桌面小组件的几张图（页面画好的 PNG）
    widget(o) { A?.widget?.(JSON.stringify(o)); },
    // 切到后台还能不能接着跑（vivo 要在「后台耗电管理」里设成允许后台耗电）
    bgAllowed() { return A?.bgAllowed ? A.bgAllowed() : true; },
    openBg() { A?.openBg?.(); },
    openUrl(u) { A ? A.openUrl(u) : window.open(u, "_blank"); },
    cfg() { return A ? JSON.parse(A.cfgGet()) : null; },
    // 分享版的体验额度（建 1 门课、聊 10 次）；电脑上调试没有
    trial() { return A?.trialInfo ? JSON.parse(A.trialInfo()) : null; },
    trialUse(kind) { return A?.trialUse ? JSON.parse(A.trialUse(kind)) : null; },
    setCfg(o) { A?.cfgSet(JSON.stringify(o)); },
    vibrate(ms = 12) { A?.vibrate(ms); },
  };
})();

// 让模型只回一个 JSON；格式坏了再要一次
async function llmJSON(system, user, opt = {}) {
  const msgs = [{ role: "system", content: system }, { role: "user", content: typeof user === "string" ? user : JSON.stringify(user) }];
  let last;
  for (let i = 0; i < 2; i++) {
    const t = await Native.llm(msgs, { json: true, ...opt });
    const m = t.match(/\{[\s\S]*\}/);
    try { return JSON.parse(m ? m[0] : t); } catch (e) { last = e; }
  }
  throw new Error("模型回的格式不对，再试一次");
}
