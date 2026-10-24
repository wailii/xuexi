"""把电脑上 universal-tutor 的两门课转成 web/packs.js，把 web/prompts/*.txt 打成 web/prompts.js。"""
import json, re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
skill = pathlib.Path.home() / ".claude/skills/universal-tutor/packs"
# RAG 这门的节名在卡带里没断句，用原型里整理过的
nice = dict(re.findall(r'\["(RAG-\d+)", "([^"]+)"', (root / "prototype/data.js").read_text()))

def anchor(s):
    urls = re.findall(r"https?://[^\s）)，,；;]+", s)
    url = urls[-1].rstrip("。.") if urls else None
    body = s.replace(url, "").strip(" 。.") if url else s
    parts = re.split(r"\s*(?:——|—|--)\s*", body, maxsplit=1)
    name, note = (parts + [""])[:2]
    return {"name": name.strip()[:80], "url": url, "note": note.strip()[:200]}

def pack(pid, cat, title, cover):
    meta = json.loads((skill / pid / "pack.json").read_text())
    nodes = json.loads((skill / pid / "curriculum.json").read_text())["nodes"]
    return {
        "id": pid, "cat": cat, "title": title, "cover": cover, "from": "电脑上的学习 skill",
        "profile": meta["learner_profile"], "goal": meta["goal"], "depth": meta["target_depth"], "orientation": meta["socratic_orientation"],
        "nodes": [{"id": n["id"], "title": nice.get(n["id"], n["title"]), "deps": n["deps"], "bloom": n.get("bloom", "understand"),
                   "objective": n["objective"], "seeds": n["socratic_seeds"], "anchors": [anchor(a) for a in n.get("grounding_anchors", [])]} for n in nodes],
    }

packs = [pack("rag-systems", "大模型", "RAG 系统设计", "llm"), pack("training-infra", "算力", "训推平台与算力调度", "gpu")]
(root / "web/packs.js").write_text("// 由 tools/gen.py 生成：电脑上学习 skill 的两门课\nconst PACKS = " + json.dumps(packs, ensure_ascii=False) + ";\n")
prompts = {p.stem: p.read_text() for p in sorted((root / "web/prompts").glob("*.txt"))}
(root / "web/prompts.js").write_text("// 由 tools/gen.py 生成：web/prompts/*.txt\nconst PROMPTS = " + json.dumps(prompts, ensure_ascii=False, indent=0) + ";\n")
print("packs:", [(p["id"], len(p["nodes"])) for p in packs], "prompts:", list(prompts))
print(json.dumps(packs[0]["nodes"][3]["anchors"][:2], ensure_ascii=False, indent=1))
print(json.dumps(packs[1]["nodes"][1]["anchors"], ensure_ascii=False))
