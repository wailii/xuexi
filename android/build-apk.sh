#!/bin/zsh
# 把 web/ 拷进 assets/www（换本地字体），带上模型和搜索的默认配置，打 APK
set -e
cd "$(dirname "$0")"
python3 ../tools/gen.py > /dev/null
WWW=app/src/main/assets/www
rm -rf $WWW && mkdir -p $WWW/img $WWW/fonts
cp ../web/*.js $WWW/
cp ../web/img/*.jpg $WWW/img/
cp fonts/*.woff2 $WWW/fonts/ && cp fonts/fonts.css $WWW/
cp -R ../web/fonts/. $WWW/fonts/
mkdir -p $WWW/vendor && cp ../web/vendor/*.js $WWW/vendor/
python3 - "$WWW" <<'PY'
import re, sys, pathlib
www = pathlib.Path(sys.argv[1])
s = pathlib.Path('../web/index.html').read_text()
s = re.sub(r'\s*<link rel="preconnect"[^>]*>', '', s)
s = re.sub(r'\s*<link href="https://fonts.googleapis.com[^>]*>', '\n<link rel="stylesheet" href="fonts.css">', s)
s = s.replace('<html lang="zh-CN">', '<html lang="zh-CN" class="app">')
(www / 'index.html').write_text(s)
PY
# 模型和搜索的默认配置：从听会的 secrets 里带过来（不进代码）。这个 APK 里有 Key，别外传
# SHARE=1 ./build-apk.sh 打分享版：地址、模型名、Key 全空，装上的人自己在设置里填
# 分享版另带一把试用 Key（secrets-share.properties），混淆后放进 "t"，新用户不填 Key 也能建 1 门课、聊 10 次（Trial.kt 解开）
python3 - <<'PY'
import base64, json, os, pathlib
rd = lambda p: dict(l.strip().split('=', 1) for l in p.read_text().splitlines() if '=' in l and not l.startswith('#')) if p.exists() else {}
mine = rd(pathlib.Path.home() / '随便聊聊/meeting-recorder/secrets.properties')
kv = {} if os.environ.get('SHARE') else mine
d = {'llmUrl': kv.get('LLM_URL', ''), 'llmModel': kv.get('LLM_MODEL', ''), 'llmKey': kv.get('LLM_KEY', ''), 'dsKey': kv.get('DASHSCOPE_API_KEY', '')}
share = rd(pathlib.Path('../secrets-share.properties'))
if os.environ.get('SHARE') and share.get('LLM_KEY'):
    raw = json.dumps({'u': mine['LLM_URL'], 'm': mine['LLM_MODEL'], 'k': share['LLM_KEY'], 'd': share.get('DASHSCOPE_API_KEY', '')}).encode()
    salt = b'xuexi-bianlitie-2026'
    d['t'] = base64.b64encode(bytes(c ^ salt[i % len(salt)] for i, c in enumerate(raw))).decode()
pathlib.Path('app/src/main/assets/defaults.json').write_text(json.dumps(d))
print('defaults:', ', '.join(k for k, v in d.items() if v) or 'none')
PY
V=$(grep versionName app/build.gradle.kts | sed -E 's/.*"(.*)".*/\1/')
OUT="学习-v$V${SHARE:+-分享版}${TEST:+-测试}.apk"
if [ -n "$SHARE" ] && [ -z "$TEST" ]; then
  # 分享版：正式签名
  SP=$(grep '^STORE_PASS=' ../secrets-share.properties | cut -d= -f2)
  ./gradlew --offline -q assembleRelease -PstorePass="$SP" "$@"
  cp app/build/outputs/apk/release/app-release.apk "../$OUT"
else
  ./gradlew --offline -q assembleDebug ${TEST:+-Ptest=1} "$@"
  cp app/build/outputs/apk/debug/app-debug.apk "../$OUT"
fi
echo "APK: $(cd .. && pwd)/$OUT"
