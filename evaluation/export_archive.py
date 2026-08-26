# -*- coding: utf-8 -*-
"""导出"多智能体协同决策中间数据"交付文档（官方要求提交）

runner 已把 debug=1 回传的 internals（profile/knowledge/reviewed）存进 results.json。
本脚本把每组的 input（画像+问题）/ events（检索到的知识库+学情+审核）/ output（回答）
整理成官方要的交付结构，导出到 archive/。
"""
import json
import os


def main():
    results = json.load(open("datasets/results.json", encoding="utf-8"))
    os.makedirs("archive", exist_ok=True)
    archive = []
    for i, r in enumerate(results):
        internals = r.get("internals") or {}
        item = {
            "组号": i + 1,
            "input": {
                "学习者画像": r["learner"],
                "问题": r["question"]["text"],
                "关联切片标识": r["question"].get("kb_key", ""),
            },
            "events": {
                "学情画像": internals.get("profile"),
                "系统检索到的知识库": internals.get("knowledge"),
                "审核结果": internals.get("reviewed"),
            },
            "output": {
                "回答": r["reply"],
            },
        }
        archive.append(item)
    out = "archive/中间数据.json"
    json.dump(archive, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"已导出 {len(archive)} 组中间数据 → {out}")


if __name__ == "__main__":
    main()
