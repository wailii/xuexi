# 把 design/图标对比.src.html 拼成单文件 design/图标对比.html（rough.js、手写字体、组件图、照片都内嵌）
#   python3 tools/build-icon-page.py
import base64, pathlib, subprocess, tempfile
D = pathlib.Path(__file__).resolve().parent.parent / "design"
b64 = lambda p: base64.b64encode(p.read_bytes()).decode()
def jpg(p, px=480):
    if not p.exists(): return ""
    out = pathlib.Path(tempfile.mkdtemp()) / "x.jpg"
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", str(px), str(p), "--out", str(out)], check=True, capture_output=True)
    return "data:image/jpeg;base64," + b64(out)
s = (D / "图标对比.src.html").read_text()
s = s.replace("/*ROUGH*/", (D / "vendor/rough.js").read_text())
s = s.replace("/*HAND*/", b64(D.parent / "web/fonts/hand.woff2"))
s = s.replace("/*WIDE*/", "data:image/png;base64," + b64(D / "widget/wide-todo.png"))
for n in (1, 2): s = s.replace(f"/*PHOTO{n}*/", jpg(D / f"icon/c-photo-{n}.png"))
(D / "图标对比.html").write_text(s)
print("ok", len(s) // 1024, "KB")
