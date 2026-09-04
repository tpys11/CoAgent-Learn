# -*- coding: utf-8 -*-
"""统一评测：5 个指标一次跑完，输出完整报告
① 幻觉率（双通道：引用校验+LLM，官方<5%）
② 画像-难度适配（rubric 双维，官方≥85%）
③ 知识点覆盖率（关键词+语义双通道，官方≥90%）
④ Faithfulness（Ragas 忠实度，参考）
⑤ ContextRecall（Ragas 上下文召回，参考）
判分模型：全部用智谱（异构 judge，与被测系统 DeepSeek 不同源）
"""
import json
import os
import config

from ragas import evaluate as ragas_evaluate
from ragas.metrics import Faithfulness, ContextRecall
from ragas.llms import LangchainLLMWrapper
from langchain_openai import ChatOpenAI
from ragas.dataset_schema import SingleTurnSample, EvaluationDataset

from judges import hallucination, fit, coverage


def load_slice(kb_key):
    p = os.path.join("datasets", "kb_slice", kb_key + ".txt")
    return open(p, encoding="utf-8").read() if os.path.exists(p) else ""


def metric_ragas(results, annotations):
    """Ragas：Faithfulness + ContextRecall，裁判模型用智谱（完全异构）"""
    llm = LangchainLLMWrapper(ChatOpenAI(
        model=config.JUDGE_MODEL, api_key=config.JUDGE_API_KEY,
        base_url=config.JUDGE_BASE_URL, temperature=0,
    ))
    samples = []
    for r in results:
        kb_key = r["question"].get("kb_key", "")
        ann = annotations.get(kb_key, {})
        # retrieved_contexts = 系统真正检索到的知识库片段（debug internals.knowledge）
        knowledge = (r.get("internals") or {}).get("knowledge") or []
        retrieved = [k.get("content", "") for k in knowledge] if knowledge else []
        samples.append(SingleTurnSample(
            user_input=r["question"]["text"],
            response=r["reply"],
            retrieved_contexts=retrieved,
            reference="；".join(ann.get("核心事实清单", [])),
        ))
    result = ragas_evaluate(EvaluationDataset(samples), metrics=[Faithfulness(), ContextRecall()], llm=llm)
    df = result.to_pandas()
    return df["faithfulness"].mean(), df["context_recall"].mean()


def main():
    results = json.load(open("datasets/results.json", encoding="utf-8"))
    annotations = json.load(open("datasets/annotations/annotations.json", encoding="utf-8"))

    print(f"评测 {len(results)} 组...\n")
    print("[1/5] 幻觉率（双通道：引用校验 + LLM，智谱）...")
    h = hallucination.calc(results, annotations)
    print("[2/5] 画像-难度适配（rubric 双维，智谱）...")
    a = fit.calc(results)
    print("[3/5] 知识点覆盖率（关键词+语义双通道，智谱）...")
    c = coverage.calc(results, annotations)
    print("[4/5] Ragas Faithfulness + ContextRecall（智谱）...")
    f, cr = metric_ragas(results, annotations)

    m = {
        "hallucination": round(h, 4),
        "adaptation": round(a, 4),
        "coverage": round(c, 4),
        "faithfulness": round(f, 4),
        "context_recall": round(cr, 4),
    }
    md = f"""# 评测报告

| 指标 | 结果 | 目标 |
|------|------|------|
| 幻觉率（双通道）| {m['hallucination']:.1%} | <5% |
| 画像-难度适配 | {m['adaptation']:.1%} | ≥85% |
| 知识点覆盖率（双通道）| {m['coverage']:.1%} | ≥90% |
| Faithfulness | {m['faithfulness']:.1%} | — |
| ContextRecall | {m['context_recall']:.1%} | — |

- 用例数：{len(results)}
- judge 模型：{config.JUDGE_MODEL}（异构）
"""
    open("report.md", "w", encoding="utf-8").write(md)
    json.dump(m, open("report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(md)


if __name__ == "__main__":
    main()
