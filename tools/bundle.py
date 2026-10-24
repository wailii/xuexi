"""把原型打成一个 HTML（脚本、图片都内联），手机上直接打开就能点。
用法：python3 tools/bundle.py  → learning-app/学习App原型.html
"""
import base64, re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = root / "prototype"
html = (src / "index.html").read_text(encoding="utf-8")

def inline_script(m):
    return "<script>\n" + (src / m.group(1)).read_text(encoding="utf-8") + "\n</script>"

html = re.sub(r'<script src="([^"?]+)(?:\?[^"]*)?"></script>', inline_script, html)

def inline_img(m):
    data = base64.b64encode((src / m.group(1)).read_bytes()).decode()
    return f'"data:image/jpeg;base64,{data}"'

html = re.sub(r'"(img/[^"]+\.jpg)"', inline_img, html)
out = root / "学习App原型.html"
out.write_text(html, encoding="utf-8")
print(out, f"{out.stat().st_size // 1024} KB")
