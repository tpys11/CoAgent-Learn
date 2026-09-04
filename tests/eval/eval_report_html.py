# -*- coding: utf-8 -*-
"""评测报告雷达图（evaluation/report_html.py 同款体验平移）：
读 evidence/summary/report-final.json（最新）+ 上一份时间戳存档作 baseline，
输出 evidence/summary/report.html——浏览器打开即可看，ECharts 雷达图 + 对比表。

纯标准库；ECharts 走 CDN（打开时需联网，截图进比赛材料/演示视频）。
用法：python tests/eval/eval_report_html.py [--evidence docs/submission/evidence]
"""
import argparse
import glob
import json
import os
import time

AXES = [
    ("覆盖率", "coverage", "rate", 1.0),
    ("适配一致率", "fit", "rate", 1.0),
    ("忠实代理(1-幻觉率)", "hallucination", "invalid_ratio", -1.0),  # 负号=取 1-x
    ("有效样本占比", None, "valid_ratio", 1.0),                      # rep 顶层键
    ("审核通过率", None, "_review_pass_rate", 1.0),                  # 派生键
]


def _value(rep, section, key, sign):
    if key == "_review_pass_rate":
        gate = rep.get("review_gate") or {}
        tot = (gate.get("review_passed") or 0) + (gate.get("review_failed") or 0)
        return round(gate.get("review_passed") / tot, 4) if tot else None
    val = ((rep.get(section) or {}) if section else rep).get(key)
    if val is None:
        return None
    return round(1.0 - val, 4) if sign < 0 else round(val, 4)


def _series(rep, name):
    vals = []
    for label, section, key, sign in AXES:
        v = _value(rep, section, key, sign)
        vals.append(None if v is None else round(v * 100, 2))
    return {"name": name, "value": vals}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence", default="docs/submission/evidence")
    args = ap.parse_args()
    sdir = os.path.join(args.evidence, "summary")
    cur_path = os.path.join(sdir, "report-final.json")
    if not os.path.exists(cur_path):
        raise SystemExit(f"[html] 未找到 {cur_path}——先跑 eval_judge.py 出分")
    rep = json.load(open(cur_path, encoding="utf-8"))

    base = None
    arch = sorted(f for f in glob.glob(os.path.join(sdir, "report-final-*.json")))
    if len(arch) >= 2:
        base = json.load(open(arch[-2], encoding="utf-8"))  # 倒数第二=上次

    labels = json.dumps([a[0] for a in AXES], ensure_ascii=False)
    series = [_series(rep, "本次")]
    if base:
        series.append(_series(base, "上次"))
    series_json = json.dumps(series, ensure_ascii=False)
    meta = rep.get("meta") or {}
    delta = ""
    if base and series[0]["value"] and series[1]["value"]:
        rows = []
        for (label, _, _, _), cur, prev in zip(AXES, series[0]["value"],
                                               series[1]["value"]):
            if cur is not None and prev is not None:
                rows.append(f"| {label} | {prev:.2f}% | {cur:.2f}% | "
                            f"{cur - prev:+.2f} |")
        delta = ("\n## 与上次对比\n\n| 指标 | 上次 | 本次 | 变化 |\n|---|---|---|---|\n"
                 + "\n".join(rows))

    html = """<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<title>CoAgent-Learn 评测报告</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
body{font-family:system-ui,'Segoe UI','Microsoft YaHei';max-width:960px;margin:24px auto;padding:0 16px;color:#222}
h1{font-size:20px} table{border-collapse:collapse;margin:12px 0} 
td,th{border:1px solid #ccc;padding:4px 10px;font-size:13px}
#radar{width:640px;height:480px} .meta{color:#666;font-size:13px}
</style></head><body>
<h1>CoAgent-Learn 三硬指标评测报告</h1>
<div class="meta">档位：__TIER__　|　被测模型：__MODELS__　|　判卷：__JUDGE__　|　生成时间：__STAMP__</div>
<div id="radar"></div>
<script>
var chart = echarts.init(document.getElementById('radar'));
chart.setOption({
  tooltip: {}, legend: {bottom: 0, data: __NAMES__},
  radar: {indicator: __INDICATORS__, radius: '65%'},
  series: [{type: 'radar', data: __SERIES__}]
});
</script>
__DELTA__
<div class="meta">指标口径详见同目录 report-final.md；分母诚实化/审核门证据/校准表均在其中。</div>
</body></html>"""
    names = json.dumps([s["name"] for s in series], ensure_ascii=False)
    indicators = json.dumps([{"text": a[0], "max": 100} for a in AXES],
                            ensure_ascii=False)
    html = (html.replace("__TIER__", str(meta.get("tier", "?")))
                .replace("__MODELS__", str(meta.get("models", "?")))
                .replace("__JUDGE__", f"{meta.get('judge_provider', '?')}/"
                                      f"{meta.get('judge_model', '?')}")
                .replace("__STAMP__", str(meta.get("generated_at", time.strftime("%Y-%m-%d %H:%M"))))
                .replace("__NAMES__", names)
                .replace("__INDICATORS__", indicators)
                .replace("__SERIES__", series_json)
                .replace("__DELTA__", delta))
    out = os.path.join(sdir, "report.html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"[html] 已生成 {os.path.abspath(out)}（浏览器打开，可截图入材料）")


if __name__ == "__main__":
    main()
