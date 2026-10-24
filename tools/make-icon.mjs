// 生成启动图标的前景：App 里的便利贴小人（同 sketch.js 的 drawNote，种子 3），白底上歪 6 度
//   node tools/make-icon.mjs <res 目录>…   写 drawable/ic_fg.xml，自适应图标的背景用 @color/bg（白）
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(join(ROOT, "design/vendor/rough.js"), "utf8") + ";this.rough = rough;", ctx);
const gen = ctx.rough.generator();

const INK = "#1d1c1a", s = 3;
const line = (w = 2.4) => ({ seed: s, stroke: INK, strokeWidth: w, roughness: 1.2, bowing: 1.3 });
const dot = { seed: s, stroke: INK, strokeWidth: 0.8, fill: INK, fillStyle: "solid", roughness: 0.4 };
const parts = [
  gen.rectangle(18, 21, 64, 62, { seed: s, stroke: "none", fill: "#ffd84a", fillStyle: "hachure", hachureGap: 3, fillWeight: 2.4, hachureAngle: -42, roughness: 1.5 }),
  gen.path("M16 19 L84 20 L83 70 L69 85 L17 84 Z", line(2.4)),
  gen.path("M83 70 L71 71 L69 85", line(2)),
  gen.rectangle(37, 11, 26, 11, { seed: s, stroke: "#9b978d", strokeWidth: 1.3, fill: "#d9d5ca", fillStyle: "hachure", hachureGap: 2.4, fillWeight: 1.2, roughness: 1.2 }),
  gen.ellipse(40, 46, 9, 10.5, dot), gen.ellipse(60, 46, 9, 10.5, dot),
  gen.path("M41 59 Q50 66 59 59", line(2.4)),
];
const hex = (c) => c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c;
const paths = parts.flatMap((d) => gen.toPaths(d)).map((p) => {
  const a = [`android:pathData="${p.d.trim().replace(/-?\d+\.\d+/g, (n) => String(+(+n).toFixed(2))).replace(/\s+/g, " ")}"`];
  if (p.fill && p.fill !== "none") a.push(`android:fillColor="${hex(p.fill).toUpperCase()}"`);
  if (p.stroke && p.stroke !== "none") a.push(`android:strokeColor="${hex(p.stroke).toUpperCase()}"`, `android:strokeWidth="${p.strokeWidth}"`);
  return `        <path ${a.join(" ")} />`;
});
// 小人画在 100×100 里，中心约 (50,48)；放到 108 画布的 (54,56)，缩到 0.78，左歪 6 度
const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- 由 tools/make-icon.mjs 生成：App 里的便利贴小人 -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <group android:pivotX="50" android:pivotY="48" android:translateX="4" android:translateY="8" android:rotation="-6" android:scaleX="0.78" android:scaleY="0.78">
${paths.join("\n")}
    </group>
</vector>
`;
for (const res of process.argv.slice(2)) {
  writeFileSync(join(res, "drawable/ic_fg.xml"), xml);
  const f = join(res, "mipmap-anydpi-v26/ic_launcher.xml");
  writeFileSync(f, readFileSync(f, "utf8").replace('android:drawable="@color/ink"', 'android:drawable="@color/bg"'));
  console.log("✓", res, paths.length, "条线");
}
