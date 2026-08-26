# -*- coding: utf-8 -*-
"""用 Ragas 框架评估：Faithfulness（忠实度=幻觉率）/ ContextRecall（覆盖率）"""
import json
import os
from ragas import evaluate
from ragas.metrics import Faithfulness, ContextRecall
from ragas.llms import LangchainLLMWrapper
from langchain_openai import ChatOpenAI
from ragas.dataset_schema import SingleTurnSample, EvaluationDataset
import config


def load_slice(kb_key):
    p = os.path.join("datasets", "kb_slice", kb_key + ".txt")
    if os.path.exists(p):
        return open(p, encoding="utf-8").read()
    return ""


def main():
    results = json.load(open("datasets/results.json", encoding="utf-8"))
    annotations = json.load(open("datasets/annotations/annotations.json", encoding="utf-8"))

    llm = LangchainLLMWrapper(ChatOpenAI(
        model="deepseek-chat",
        api_key=config.SYSTEM_API_KEY,
        base_url="https://api.deepseek.com/v1",
        temperature=0,
    ))

    samples = []
    for r in results:
        kb_key = r["question"].get("kb_key", "")
        ann = annotations.get(kb_key, {})
        # reference = ground truth（标注的核心事实清单）
        reference = "；".join(ann.get("核心事实清单", []))
        samples.append(SingleTurnSample(
            user_input=r["question"]["text"],
            response=r["reply"],
            retrieved_contexts=[load_slice(kb_key)],
            reference=reference,
        ))

    dataset = EvaluationDataset(samples)

    print(f"评估 {len(samples)} 组（Faithfulness + ContextRecall）...")
    result = evaluate(
        dataset,
        metrics=[Faithfulness(), ContextRecall()],
        llm=llm,
    )
    df = result.to_pandas()
    print(df[["faithfulness", "context_recall"]].to_string())
    df.to_csv("ragas_result.csv", index=False)
    print("\n已存 ragas_result.csv")
    print("\nFaithfulness 平均:", df["faithfulness"].mean())
    print("ContextRecall 平均:", df["context_recall"].mean())


if __name__ == "__main__":
    main()
