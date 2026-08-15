"""后端冒烟测试：health -> 上传 -> 检索 -> 极速对话。

用法（后端已启动，默认容器端口）：
    python scripts/smoke.py
    python scripts/smoke.py http://127.0.0.1:8000

用途：每次提交前用一条命令确认核心链路没被改坏。
对话段允许 error（例如未配置有效 DEEPSEEK_API_KEY），但连接必须能建立且收到终态事件。
"""
import json
import sys

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (("  " + detail[:200]) if detail else ""))
    if not ok:
        sys.exit(1)


def main() -> None:
    with httpx.Client(base_url=BASE, timeout=120.0) as client:
        r = client.get("/health")
        check("health", r.status_code == 200 and r.json().get("status") == "ok", r.text)

        text = "冒烟测试专用知识：多智能体协同学习中，规划节点负责意图分类与子任务调度。"
        r = client.post("/api/knowledge/upload", params={"wait": "true"},
                        json={"text": text, "source": "smoke-test", "project_id": "default"})
        j = r.json()
        check("upload", r.status_code == 200 and (j.get("chunks", 0) > 0 or j.get("duplicate")), str(j))

        r = client.get("/api/knowledge/query", params={"q": "规划节点负责什么", "top_k": 1})
        check("retrieve", r.status_code == 200, r.text)

        # SSE：逐行读取，直到 done/error 终态事件；只验证连接与协议，不依赖真实模型 key。
        terminal = False
        with client.stream(
            "POST",
            "/api/chat",
            json={
                "message": "你好",
                "project_id": "default",
                "dialogue_id": "smoke-dlg",
                "settings": {"template": "极速"},
            },
        ) as resp:
            check("chat_stream", resp.status_code == 200, str(resp.status_code))
            for line in resp.iter_lines():
                if not line.startswith("data: "):
                    continue
                data = json.loads(line[6:])
                if data.get("type") in ("done", "error"):
                    terminal = True
                    break
        check("chat_terminal_event", terminal, "未收到 done/error 终态事件")

    print("SMOKE OK")


if __name__ == "__main__":
    main()
