"""电脑上调试用：伺服 web/，并替网页调模型（flagos DeepSeek）和联网搜索（百炼千问）。
用法：python3 tools/dev.py 8971
Key 从听会的 secrets.properties 读，不进网页。
"""
import json, os, sys, time, pathlib, urllib.request, urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
LOG = ROOT / "tools" / "dev.log"
USAGE = ROOT / "tools" / "usage.log"   # 每次调模型、搜索、生图用了多少（算成本用）


def usage(rec):
    rec["t"] = time.strftime("%H:%M:%S")
    with USAGE.open("a") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
kv = dict(l.strip().split("=", 1) for l in (pathlib.Path.home() / "随便聊聊/meeting-recorder/secrets.properties").read_text().splitlines() if "=" in l and not l.startswith("#"))
LLM_URL = kv["LLM_URL"].rstrip("/").removesuffix("/chat/completions") + "/chat/completions"
for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"):
    os.environ.pop(k, None)


def llm(messages, as_json, max_tokens, on_delta=None):
    body = {"model": kv["LLM_MODEL"], "stream": True, "messages": messages, "max_tokens": max_tokens,
            "thinking": {"type": "disabled"}, "chat_template_kwargs": {"enable_thinking": False},
            "stream_options": {"include_usage": True}}
    if as_json:
        body["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(LLM_URL, json.dumps(body).encode(), {"Content-Type": "application/json", "Authorization": "Bearer " + kv["LLM_KEY"], "Accept": "text/event-stream", "Accept-Encoding": "identity"})
    out, used = [], {}
    with urllib.request.urlopen(req, timeout=240) as r:
        for raw in r:
            line = raw.decode("utf-8", "ignore").strip()
            if not line.startswith("data:"):
                continue
            d = line[5:].strip()
            if d == "[DONE]":
                break
            o = json.loads(d)
            if o.get("usage"):
                used = o["usage"]
            c = ((o.get("choices") or [{}])[0].get("delta") or {}).get("content")
            if c:
                out.append(c)
                if on_delta:
                    on_delta(c)
    sysp = messages[0]["content"] if messages and messages[0]["role"] == "system" else ""
    usage({"kind": "llm", "tag": sysp[:14], "in_chars": sum(len(m["content"]) for m in messages), "out_chars": len("".join(out)),
           "prompt_tokens": used.get("prompt_tokens"), "completion_tokens": used.get("completion_tokens"), "cached": (used.get("prompt_tokens_details") or {}).get("cached_tokens")})
    return "".join(out)


def search(q):
    body = {"model": "qwen-plus", "input": {"messages": [{"role": "user", "content": q}]},
            "parameters": {"result_format": "message", "enable_search": True, "max_tokens": 1200,
                           "search_options": {"forced_search": True, "enable_source": True, "search_strategy": "pro"}}}
    req = urllib.request.Request("https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation", json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "Authorization": "Bearer " + kv["DASHSCOPE_API_KEY"]})
    o = json.load(urllib.request.urlopen(req, timeout=120))
    usage({"kind": "search", "q": q, "usage": o.get("usage")})
    res = [{"title": r.get("title", ""), "url": r.get("url", ""), "site": r.get("site_name", "")} for r in o.get("output", {}).get("search_info", {}).get("search_results", [])]
    return {"text": o["output"]["choices"][0]["message"]["content"], "results": res}


def image(prompt, neg):
    import base64, io
    from PIL import Image
    body = {"model": "qwen-image-3.0", "input": {"messages": [{"role": "user", "content": [{"text": prompt}]}]},
            "parameters": {"negative_prompt": neg, "size": "1472*1140", "watermark": False, "prompt_extend": False}}
    req = urllib.request.Request("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "Authorization": "Bearer " + kv["DASHSCOPE_API_KEY"]})
    o = json.load(urllib.request.urlopen(req, timeout=180))
    usage({"kind": "image", "usage": o.get("usage")})
    url = o["output"]["choices"][0]["message"]["content"][0]["image"]
    im = Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=60).read())).convert("RGB")
    im = im.resize((900, round(im.height * 900 / im.width)))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(WEB), **k)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n) or b"{}")
        t0 = time.time()
        if self.path == "/api/llm" and req.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            # HTTP/1.0：不写长度，一段段直接写，写完关连接就是结束
            def chunk(s):
                self.wfile.write(s.encode())
                self.wfile.flush()
            n = 0
            try:
                out = llm(req["messages"], req.get("json"), req.get("maxTokens", 8000), lambda c: chunk(c))
                n = len(out)
            except Exception as e:
                chunk("\u0000ERR" + str(e))
            with LOG.open("a") as f:
                f.write(f"{time.strftime('%H:%M:%S')} /api/llm 流式 {time.time() - t0:.1f}s {n}字\n")
            return
        try:
            if self.path == "/api/llm":
                out = llm(req["messages"], req.get("json"), req.get("maxTokens", 8000))
            elif self.path == "/api/image":
                out = image(req["prompt"], req.get("neg", ""))
            elif self.path == "/api/search":
                out = json.dumps(search(req["q"]), ensure_ascii=False)
            else:
                self.send_error(404); return
            code = 200
        except urllib.error.HTTPError as e:
            out, code = f"接口报错（{e.code}）：{e.read()[:300].decode('utf-8', 'ignore')}", 502
        except Exception as e:
            out, code = f"连不上：{e}", 502
        with LOG.open("a") as f:
            f.write(f"{time.strftime('%H:%M:%S')} {self.path} {code} {time.time() - t0:.1f}s {len(out)}字\n")
        b = out.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8971
    print(f"http://127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
