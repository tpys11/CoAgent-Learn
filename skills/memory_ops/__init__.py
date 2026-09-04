from skills import Skill
from core.postgres_client import pg_client


def _as_dict(data):
    """SQLite 存的 JSON 字符串转 dict（兼容已存 dict）"""
    import json as _json
    if isinstance(data, dict):
        return data
    if isinstance(data, str):
        try:
            return _json.loads(data)
        except Exception:
            return {}
    return {}


class MemoryOps(Skill):
    """三层记忆读写：
    L1 事件层：对话消息（messages，最近 N 条）
    L2 事实层：课程记忆（project_memories，按 project_id 聚合）
    L3 画像层：个人全局画像（global_profile，跨课程永久化）
    """
    name = "memory_ops"
    description = "读写用户三层记忆（L1事件/对话、L2事实/课程记忆、L3画像/全局画像）"
    input_schema = {
        "action": {"type": "string", "description": "read/write"},
        "layer": {"type": "string", "description": "L1/L2/L3"},
        "project_id": {"type": "string", "description": "课程ID（L2 按课程读）"},
        "data": {"type": "object", "description": "写入数据（write时）"}
    }

    def execute(self, action="read", layer="L2", project_id="default", data=None, **kwargs):
        if action == "read":
            return self._read(layer, project_id)
        return self._write(layer, project_id, data)

    def _read(self, layer: str, project_id: str) -> dict:
        if layer == "L1":
            # 事件层：该课程最近 30 条对话消息（原子记录，按时间正序）
            rows = pg_client.execute(
                """SELECT m.role, m.content FROM messages m
                   JOIN dialogues d ON m.dialogue_id = d.id
                   WHERE d.project_id = %s ORDER BY m.created_at ASC LIMIT 30""",
                (project_id,)
            )
            msgs = [{"role": r["role"], "content": r["content"]} for r in rows]
            return {"memory": {"L1": msgs}, "layer": "L1"}
        if layer == "L2":
            # 事实层：课程记忆（project_memories.data），按课程取最新一条
            rows = pg_client.execute(
                "SELECT data FROM project_memories WHERE project_id = %s ORDER BY updated_at DESC LIMIT 1",
                (project_id,)
            )
            mem = _as_dict(rows[0]["data"]) if rows and rows[0].get("data") else {}
            return {"memory": {"L2": mem}, "layer": "L2"}
        # L3 画像层：个人全局画像（global_profile），永久化取最新一条
        rows = pg_client.execute("SELECT data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
        mem = _as_dict(rows[0]["data"]) if rows and rows[0].get("data") else {}
        return {"memory": {"L3": mem}, "layer": "L3"}

    def _write(self, layer: str, project_id: str, data: dict) -> dict:
        import json as _json
        data = data or {}
        if layer == "L3":
            # 画像层：合并写 global_profile（单行表，upsert）
            rows = pg_client.execute("SELECT id, data FROM global_profile LIMIT 1")
            if rows:
                old = _as_dict(rows[0]["data"]) if rows[0].get("data") else {}
                old.update(data)
                pg_client.execute(
                    "UPDATE global_profile SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                    (_json.dumps(old, ensure_ascii=False), rows[0]["id"]))
            else:
                pg_client.execute(
                    "INSERT INTO global_profile (session_id, data) VALUES (%s,%s)",
                    ("default", _json.dumps(data, ensure_ascii=False)))
            return {"status": "written", "layer": layer}
        if layer == "L2":
            # 事实层：合并写课程记忆 project_memories（按课程 upsert）
            rows = pg_client.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (project_id,))
            if rows:
                old = _as_dict(rows[0]["data"]) if rows[0].get("data") else {}
                old.update(data)
                pg_client.execute(
                    "UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s",
                    (_json.dumps(old, ensure_ascii=False), project_id))
            else:
                pg_client.execute(
                    "INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)",
                    ("project", project_id, _json.dumps(data, ensure_ascii=False)))
            return {"status": "written", "layer": layer}
        # L1 事件层由对话落库驱动（messages 表），不支持直接写入
        return {"status": "readonly", "layer": layer, "message": "L1 事件层由对话过程自动写入（messages 表）"}
