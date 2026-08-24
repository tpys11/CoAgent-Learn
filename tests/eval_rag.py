# -*- coding: utf-8 -*-
"""刀2·RAG评测基线：黄金QA集 × 双切块器对比。用法：python eval_rag.py [self|llamaindex|both]"""
import json
import sys

sys.path.insert(0, "/app")
from core.config import config
from core.knowledge_service import add_document, search, delete_project_kb

CORPUS = ("# 高中物理力学要点\n\n"
          "## 牛顿第一定律\n\n一切物体在没有受到外力作用时，总保持静止状态或匀速直线运动状态，这就是惯性定律。\n\n"
          "## 牛顿第三定律\n\n两个物体之间的作用力和反作用力总是大小相等、方向相反，作用在同一条直线上。\n\n"
          "## 动能定理\n\n合外力对物体所做的功等于物体动能的变化，这就是动能定理。\n\n"
          "## 动量守恒定律\n\n系统不受外力或所受合外力为零时，系统动量保持守恒。\n\n"
          "## 角动量\n\n系统所受合外力矩为零时，角动量保持不变，这就是角动量守恒定律。\n")


def run(chunker: str) -> dict:
    config.KB_CHUNKER = chunker
    n = add_document("rag-eval", CORPUS, source="eval-dynamics.md")
    cases = json.load(open("/app/tests/golden_qa.json", encoding="utf-8"))["cases"]
    hits = 0
    recalls = []
    for c in cases:
        res = search("rag-eval", c["q"], top_k=3)
        text = " ".join(r.get("content", "") for r in res)
        got = sum(1 for k in c["expect"] if k in text)
        ok = got == len(c["expect"])
        hits += ok
        recalls.append(got / len(c["expect"]))
        print(f"  [{'PASS' if ok else 'MISS'}] {c['q'][:20]} 召回 {got}/{len(c['expect'])}")
    avg = sum(recalls) / len(recalls)
    print(f"[{chunker}] 切块 {n} | 全召回命中 {hits}/{len(cases)} | 平均关键词召回 {avg:.0%}")
    return {"chunker": chunker, "chunks": n, "hit": hits, "total": len(cases), "recall": round(avg, 3)}


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "both"
    out = [run(m) for m in (["self", "llamaindex"] if mode == "both" else [mode])]
    delete_project_kb("rag-eval")
    json.dump(out, open("/tmp/eval_baseline.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("基线已存 /tmp/eval_baseline.json")
