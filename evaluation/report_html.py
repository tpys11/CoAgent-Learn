# -*- coding: utf-8 -*-
"""生成 HTML 评测报告：ECharts 雷达图 + 与上次 baseline 对比

读 report.json（本次结果）+ reports/ 历史（上次结果），
输出 report.html —— 浏览器打开可截图，直接贴进比赛材料/演示视频。
"""
import json
import os
import time


def main():
    m = json.load(open("report.json", encoding="utf-8"))
    # 1. 存档本次
    os.makedirs("reports", exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    cur_name = f"report-{ts}.json"
    json.dump(m, open(os.path.join("reports", cur_name), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # 2. 找 baseline（上一次存档）
    hist = sorted(f for f in os.listdir("reports") if f.endswith(".json") and f != cur_name)
    baseline = None
    if hist:
        baseline = json.load(open(os.path.join("reports", hist[-1]), encoding="utf-8"))

    # 指标名（幻觉率越低越好，雷达图里用 1-幻觉率 表示"越好"）
    names = ["幻觉率(越低越好)", "适配准确率", "覆盖率", "Faithfulness", "ContextRecall"]
    keys = ["hallucination", "adaptation", "coverage", "faithfulness", "context_recall"]
    cur_vals = [m.get(k, 0) for k in keys]
    # 雷达图：幻觉率转成"越好"方向（1-幻觉率）
    radar_cur = [1 - cur_vals[0], cur_vals[1], cur_vals[2], cur_vals[3], cur_vals[4]]
    radar_base = None
    if baseline:
        b = [baseline.get(k, 0) for k in keys]
        radar_base = [1 - b[0], b[1], b[2], b[3], b[4]]

    rows = ""
    targets = ["<5%", "≥85%", "≥90%", "—", "—"]
    for i, name in enumerate(names):
        rows += f"<tr><td>{name}</td><td>{cur_vals[i]*100:.1f}%</td><td>{targets[i]}</td></tr>\n"

    base_series = ""
    if radar_base:
        base_series = f""",
        {{ name: 'baseline（上次）', type: 'radar',
          data: [ {{ value: {json.dumps(radar_base)}, lineStyle: {{ color: '#999', type: 'dashed' }} }} ] }}"""

    base_note = f"<p>与上次对比：{'有' if baseline else '无 baseline（首次运行）'}</p>"
    if baseline:
        diff = ""
        for i, name in enumerate(names):
            d = cur_vals[i] - baseline.get(keys[i], 0)
            arrow = "▲" if (d > 0 and i != 0) or (d < 0 and i == 0) else ("▼" if d != 0 else "—")
            diff += f"<li>{name}: {baseline.get(keys[i],0)*100:.1f}% → {cur_vals[i]*100:.1f}%（{arrow}{abs(d)*100:.1f}%）</li>\n"
        base_note = "<p><b>与上次对比：</b></p><ul>\n" + diff + "</ul>"

    html = f"""<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8"><title>评测报告</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
body {{ font-family: "Microsoft YaHei", sans-serif; padding: 24px; background: #fff; }}
h1 {{ font-size: 22px; }} table {{ border-collapse: collapse; margin: 12px 0; }}
td, th {{ border: 1px solid #ddd; padding: 6px 14px; font-size: 14px; }}
th {{ background: #f5f5f5; }}
#radar {{ width: 100%; height: 420px; }}
</style></head><body>
<h1>多智能体个性化学习系统 · 评测报告</h1>
<p>生成时间：{ts} · 用例数：{len(json.load(open('datasets/results.json', encoding='utf-8')))}</p>
<table><tr><th>指标</th><th>本次结果</th><th>官方目标</th></tr>
{rows}</table>
{base_note}
<div id="radar"></div>
<script>
var chart = echarts.init(document.getElementById('radar'));
chart.setOption({{
  title: {{ text: '五项指标雷达图', left: 'center' }},
  tooltip: {{}},
  legend: {{ data: ['本次', 'baseline（上次）'], bottom: 0 }},
  radar: {{
    indicator: {json.dumps([{"name": n, "max": 1} for n in names], ensure_ascii=False)},
    radius: '62%'
  }},
  series: [{{
    type: 'radar',
    data: [
      {{ value: {json.dumps(radar_cur)}, name: '本次',
         areaStyle: {{ color: 'rgba(54,162,235,0.35)' }}, lineStyle: {{ color: '#36a2eb' }} }}
      {base_series}
    ]
  }}]
}});
window.addEventListener('resize', function() {{ chart.resize(); }});
</script>
</body></html>"""
    open("report.html", "w", encoding="utf-8").write(html)
    print(f"HTML 报告已生成 → report.html（浏览器打开可截图）")
    if baseline:
        print("已与上次 baseline 对比")
    else:
        print("首次运行，无 baseline")


if __name__ == "__main__":
    main()
