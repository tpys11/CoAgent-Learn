# -*- coding: utf-8 -*-
"""F9 反向迁移：剥离 kb_tree 节点的 F9 增量字段（id/parent/level/page/category），
还原 pre-F9 形状 {"name","children"[,"content"]}（D4 先例：迁移必附回退路径）。
无表/空库幂等通过；坏 JSON 行跳过（保留原样，交人工）。

用法（先停 backend 再执行，防写入竞争——D4 同款纪律）：
  docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml stop backend
  python backend/core/db/rollback_f9_kb_tree.py [db_path]   # 缺省 backend/core/db 同款 SQLITE_DIR/app.db
  docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml start backend
回退应用代码时配套执行（旧代码忽略未知字段本可兼容，本脚本保证字节级还原）。
"""
import json
import os
import sqlite3
import sys

STRIP_FIELDS = ("id", "parent", "level", "page", "category")


def rollback_kb_tree_hierarchical(db) -> int:
    """剥离全部 kb_tree 行的 F9 增量字段（repo/客户端/裸 sqlite3 连接均可注入）。
    返回改写行数。"""
    rows = db.execute("SELECT project_id, source, tree FROM kb_tree")
    changed = 0
    for r in rows or []:
        raw = r["tree"]  # dict 与 sqlite3.Row 均按名取值
        if not raw:
            continue
        try:
            t = json.loads(raw)
            if not isinstance(t, list):
                continue
        except Exception:
            continue  # 坏行原样保留（与正向迁移同一纪律）

        def strip(nodes):
            out = []
            for n in nodes:
                if not isinstance(n, dict):
                    continue
                keep = {k: v for k, v in n.items() if k not in STRIP_FIELDS}
                keep["children"] = strip(n.get("children"))
                out.append(keep)
            return out

        new = json.dumps(strip(t), ensure_ascii=False)
        if new != raw:
            db.execute("UPDATE kb_tree SET tree=? WHERE project_id=? AND source=?",
                       (new, r["project_id"], r["source"]))
            changed += 1
    return changed


def _default_db_path() -> str:
    """SQLITE_DIR 环境变量优先；缺省按仓库约定 <repo>/data/app.db（脚本位于 backend/core/db/）。"""
    base = os.environ.get("SQLITE_DIR") or os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data"))
    return os.path.join(base, "app.db")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else _default_db_path()
    if not os.path.exists(path):
        print(f"[rollback_f9] 库不存在：{path}")
        sys.exit(1)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        n = rollback_kb_tree_hierarchical(conn)
        conn.commit()
        print(f"[rollback_f9] kb_tree 已还原 pre-F9 形状：改写 {n} 行（{path}）")
    finally:
        conn.close()
