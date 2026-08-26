# -*- coding: utf-8 -*-
import os
import json
import requests
import config


def prelabel(content: str) -> dict:
    """LLM 预标：读一段知识切片，自动生成 事实清单/陷阱/知识点/难度档（草稿，需人工复核）"""
    prompt = (
        "你是一位领域专家。请为下面这段知识内容生成评测标注，严格输出 JSON：\n\n"
        "知识内容：\n" + content + "\n\n"
        "输出 JSON 结构：\n"
        '{\n'
        '  "核心事实清单": ["该内容中的正确事实1", "正确事实2", ...],\n'
        '  "陷阱事实": ["该领域易被模型编错的表述1", ...],\n'
        '  "知识点清单": ["核心知识点1", "知识点2", ...],\n'
        '  "难度档": "初级 或 中级 或 高级"\n'
        '}\n\n'
        "要求：事实清单要全（8-15 条）；陷阱事实 3-5 条（写该领域常见错误认知）；知识点清单 8-15 个；"
        "只输出 JSON，不要额外文字。"
    )
    resp = requests.post(
        "https://api.deepseek.com/v1/chat/completions",
        json={"model": "deepseek-chat", "messages": [{"role": "user", "content": prompt}],
              "response_format": {"type": "json_object"}},
        headers={"Authorization": "Bearer " + config.SYSTEM_API_KEY},
        timeout=180,
        proxies={"http": None, "https": None},
    )
    d = resp.json()
    raw = d["choices"][0]["message"]["content"]
    try:
        return json.loads(raw)
    except Exception:
        s, e = raw.find("{"), raw.rfind("}")
        return json.loads(raw[s:e+1])


def main():
    slice_dir = "datasets/kb_slice"
    result = {}
    for fn in os.listdir(slice_dir):
        if not fn.endswith(".txt"):
            continue
        key = fn[:-4]  # 文件名去掉 .txt 作为切片 key
        content = open(os.path.join(slice_dir, fn), encoding="utf-8").read()
        print(f"预标 [{key}] ...")
        try:
            result[key] = prelabel(content)
        except Exception as e:
            print(f"  [失败] {key}: {str(e)[:100]}")

    os.makedirs("datasets/annotations", exist_ok=True)
    out = "datasets/annotations/annotations.json"
    json.dump(result, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\n已生成标注草稿（{len(result)} 个切片）→ {out}")
    print("⚠️ 这是 LLM 草稿，请人工复核后再作为评测金标准！")


if __name__ == "__main__":
    main()
