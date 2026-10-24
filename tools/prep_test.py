"""试：让 DeepSeek 按一个知识点的卡带内容，备出一节课（讲法、追问、测验、补救）。"""
import json, sys, time, pathlib, concurrent.futures as cf
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from llm import chat

pack = json.load(open(pathlib.Path.home() / ".claude/skills/universal-tutor/packs/rag-systems/curriculum.json"))
meta = json.load(open(pathlib.Path.home() / ".claude/skills/universal-tutor/packs/rag-systems/pack.json"))
node = next(n for n in pack["nodes"] if n["id"] == sys.argv[1] if len(sys.argv) > 1) if len(sys.argv) > 1 else next(n for n in pack["nodes"] if n["id"] == "RAG-04")
prompt_dir = pathlib.Path(__file__).parent.parent / "prototype"
SYS = (prompt_dir / "prompts" / "prep.txt").read_text()

def run(part, covered=None):
    extra = {"追问已考的要点": covered} if covered else {}
    user = json.dumps({**extra, "课程目录": [f"第 {int(n['id'].split('-')[1])} 节 {n['title']}" for n in pack["nodes"]], "要备的部分": part, "学习者": meta["learner_profile"], "目标": meta["target_depth"], "提问方向": meta["socratic_orientation"],
        "知识点": {"编号": node["id"], "标题": node["title"], "学到什么程度": node["objective"], "追问种子": node["socratic_seeds"],
                 "出处": [{"i": i + 1, "说明": a} for i, a in enumerate(node["grounding_anchors"])]}}, ensure_ascii=False)
    t, f, a = chat([{"role": "system", "content": SYS}, {"role": "user", "content": user}], json_mode=True)
    return part, t, f, a

t0 = time.time()
covered = None
for part in ["讲", "考"]:
    part, t, f, a = run(part, covered)
    print(f"== {part}  首字 {f:.1f}s  全部 {a:.1f}s  {len(t)} 字")
    o = json.loads(t)
    if part == "讲": covered = [x["point"] for x in o["socratic"]]
    def show(x, d=0):
        if isinstance(x, dict):
            for k, v in x.items():
                if k in ("hints", "reveal", "step", "okAfter", "badAfter"): continue
                if isinstance(v, (dict, list)): print("  " * d + k + ":"); show(v, d + 1)
                else: print("  " * d + f"{k}: {v}")
        elif isinstance(x, list):
            for v in x:
                if isinstance(v, list) and all(isinstance(y, str) for y in v): print("  " * d + " / ".join(v))
                else: show(v, d); print("  " * d + "-")
        else: print("  " * d + str(x))
    show(o)
print(f"总共 {time.time() - t0:.1f}s")
