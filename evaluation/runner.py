# -*- coding: utf-8 -*-
"""黑盒 runner：调被测系统的 /api/chat（SSE），跑完所有画像×问题，存完整样例"""
import json
import os
import requests
import config


def call_chat(message, profile, debug=True):
    """调一次 /api/chat，返回 done 事件的 reply + internals（不发切片，让系统自己检索知识库）"""
    resp = requests.post(
        config.SYSTEM_URL + "/api/chat",
        json={
            "message": message,
            "project_id": "eval_test",
            "api_key": config.SYSTEM_API_KEY,
            "settings": {"profile": profile},
            "debug": debug,
        },
        stream=True,
        timeout=180,
    )
    done = None
    for line in resp.iter_lines(decode_unicode=True):
        if line and line.startswith("data: "):
            try:
                d = json.loads(line[6:])
            except Exception:
                continue
            if d.get("type") == "done":
                done = d
                break
    return done or {}


def run(learners, questions):
    results = []
    for learner in learners:
        for q in questions:
            done = call_chat(q["text"], learner)
            results.append({
                "learner": learner,
                "question": q,
                "reply": done.get("reply", ""),
                "internals": done.get("internals", {}),
            })
            print(f"[{learner['name']}] {q['text'][:20]}... -> {len(done.get('reply',''))} 字")
    return results


if __name__ == "__main__":
    learners = json.load(open("datasets/learners/learners.json", encoding="utf-8"))
    questions = json.load(open("datasets/learners/questions.json", encoding="utf-8"))
    results = run(learners, questions)
    json.dump(results, open("datasets/results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"完成 {len(results)} 组，已存 datasets/results.json")
