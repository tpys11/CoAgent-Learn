# -*- coding: utf-8 -*-
"""性能反馈回路（对话进入+左栏资源加载慢）：
对运行容器按前端真实调用序计时——红 = 任一关键端点 total >300ms 或非200。
用法: python tests/perf_entry_loop.py [base_url]  (默认 http://localhost:8000)
"""
import json
import sys
import time
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
THRESHOLD_MS = 300


def timed(path: str, runs: int = 3):
    totals, size_last, code_last = [], 0, 0
    for _ in range(runs):
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(BASE + path, timeout=60) as r:
                body = r.read()
                code_last = r.status
        except Exception as e:
            return {"path": path, "error": repr(e)[:80], "red": True}
        totals.append(round((time.perf_counter() - t0) * 1000))
        size_last = len(body)
    avg = sum(totals) // len(totals)
    return {"path": path, "ms": totals, "avg_ms": avg,
            "bytes": size_last, "status": code_last,
            "red": avg > THRESHOLD_MS or code_last != 200 or size_last == 0}


def main():
    # 真实数据锚点：第一个项目与其首个对话
    projects = json.loads(urllib.request.urlopen(BASE + "/api/projects", timeout=30).read())
    plist = projects.get("projects") or projects if isinstance(projects, dict) else projects
    p0 = (plist[0] if isinstance(plist, list) else (plist.get("projects") or [None])[0])
    pid = p0["id"]
    dl = json.loads(urllib.request.urlopen(
        BASE + "/api/projects/%s/dialogues" % pid, timeout=30).read())
    dlist = dl.get("dialogues") if isinstance(dl, dict) else dl
    did = (dlist[0] or {}).get("id") if dlist else None

    targets = [
        "/api/projects",
        "/api/projects/%s/dialogues" % pid,
        "/api/resources?project_id=%s" % pid,
        "/api/stats?project_id=%s" % pid,
        "/api/project-memory/%s" % pid,
        "/api/learning-log?project_id=%s" % pid,
        "/api/memory/progress?project_id=%s" % pid,
    ]
    if did:
        targets += [
            "/api/dialogues/%s/messages" % did,
            "/api/dialogues/%s/followups" % did,
            "/api/dialogues/%s/profile_status" % did,
        ]

    print("BASE=%s  pid=%s did=%s  threshold=%dms\n" % (BASE, pid[:12], (did or '-')[:12], THRESHOLD_MS))
    results = [timed(t) for t in targets]
    red = False
    for r in results:
        flag = "RED " if r.get("red") else "ok  "
        red |= r.get("red", False)
        detail = r.get("error") or ("avg=%sms all=%s bytes=%s http=%s"
                                    % (r["avg_ms"], r["ms"], r["bytes"], r["status"]))
        print("%s %-52s %s" % (flag, r["path"][:52], detail))
    print("\nVERDICT:", "RED — 存在慢/空/错端点，复现用户症状入口" if red else "GREEN — 后端全部达标")
    sys.exit(1 if red else 0)


if __name__ == "__main__":
    main()
