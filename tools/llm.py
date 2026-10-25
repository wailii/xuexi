"""在电脑上试 OpenAI 兼容接口的模型：读听会的 secrets（不打印 Key），流式调用，返回全文和耗时。"""
import json, time, urllib.request, pathlib, os, sys

kv = dict(l.strip().split("=", 1) for l in (pathlib.Path.home() / "随便聊聊/meeting-recorder/secrets.properties").read_text().splitlines() if "=" in l and not l.startswith("#"))
URL = kv["LLM_URL"].rstrip("/").removesuffix("/chat/completions") + "/chat/completions"
KEY, MODEL = kv["LLM_KEY"], kv["LLM_MODEL"]
for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"): os.environ.pop(k, None)

def chat(messages, json_mode=False, max_tokens=8000):
    body = {"model": MODEL, "stream": True, "messages": messages, "max_tokens": max_tokens,
            "thinking": {"type": "disabled"}, "chat_template_kwargs": {"enable_thinking": False}}
    if json_mode: body["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(URL, json.dumps(body).encode(), {"Content-Type": "application/json", "Authorization": "Bearer " + KEY, "Accept": "text/event-stream", "Accept-Encoding": "identity"})
    t0 = time.time(); first = None; out = []
    with urllib.request.urlopen(req, timeout=180) as r:
        for raw in r:
            line = raw.decode().strip()
            if not line.startswith("data:"): continue
            d = line[5:].strip()
            if d == "[DONE]": break
            o = json.loads(d)
            ch = (o.get("choices") or [{}])[0]
            c = (ch.get("delta") or {}).get("content")
            if c:
                if first is None: first = time.time() - t0
                out.append(c)
    return "".join(out), first, time.time() - t0

if __name__ == "__main__":
    print("model:", MODEL)
    t, f, a = chat([{"role": "user", "content": "只回复两个字：好的"}])
    print(repr(t), f"首字 {f:.1f}s 全部 {a:.1f}s")
