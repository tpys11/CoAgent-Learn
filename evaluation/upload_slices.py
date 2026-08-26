# -*- coding: utf-8 -*-
"""把 datasets/kb_slice 的切片上传到项目知识库（project_id=eval_test）"""
import json
import os
import requests
import config

PROJECT_ID = "eval_test"


def main():
    slice_dir = "datasets/kb_slice"
    for fn in sorted(os.listdir(slice_dir)):
        if not fn.endswith(".txt"):
            continue
        name = fn[:-4]
        text = open(os.path.join(slice_dir, fn), encoding="utf-8").read()
        r = requests.post(
            config.SYSTEM_URL + "/api/knowledge/upload",
            json={
                "project_id": PROJECT_ID,
                "text": text,
                "source": name,
                "api_key": config.SYSTEM_API_KEY,
            },
            params={"wait": True},
            timeout=120,
        )
        d = r.json()
        print(f"上传 [{name}] -> {d.get('status')} chunks={d.get('chunks')} {d.get('msg','')}")
    print(f"\n全部上传到项目 {PROJECT_ID} 的知识库")


if __name__ == "__main__":
    main()
