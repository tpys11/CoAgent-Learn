from skills import Skill
from core.postgres_client import pg_client


class MemoryOps(Skill):
    name = "memory_ops"
    description = "读写用户三层记忆（L1事件/L2事实/L3画像）"
    input_schema = {
        "action": {"type": "string", "description": "read/write"},
        "layer": {"type": "string", "description": "L1/L2/L3"},
        "project_id": {"type": "string", "description": "项目ID"},
        "data": {"type": "object", "description": "写入数据（write时）"}
    }

    def execute(self, action="read", layer="L2", project_id="default", data=None, **kwargs):
        if action == "read":
            return self._read(layer, project_id)
        return self._write(layer, project_id, data)

    def _read(self, layer: str, project_id: str) -> dict:
        if layer == "L1":
            rows = pg_client.execute(
                """SELECT m.role, m.content FROM messages m
                   JOIN dialogues d ON m.dialogue_id = d.id
                   WHERE d.project_id = %s ORDER BY m.created_at ASC LIMIT 30""",
                (project_id,)
            )
            return {"memory": {"L1": [{"role": r["role"], "content": r["content"]} for r in rows]}}
        elif layer == "L2":
            rows = pg_client.execute(
                "SELECT profile_data FROM user_profiles WHERE project_id = %s",
                (project_id,)
            )
            profile = rows[0]["profile_data"] if rows else {}
            return {"memory": {"L2": profile}}
        elif layer == "L3":
            rows = pg_client.execute(
                "SELECT profile_data FROM user_profiles WHERE project_id = %s",
                (project_id,)
            )
            profile = rows[0]["profile_data"] if rows else {}
            return {"memory": {"L3": profile}}
        return {"memory": {layer: "暂无数据"}}

    def _write(self, layer: str, project_id: str, data: dict) -> dict:
        if layer == "L3":
            import json
            existing = pg_client.execute(
                "SELECT profile_data FROM user_profiles WHERE project_id = %s",
                (project_id,)
            )
            if existing:
                old = dict(existing[0]["profile_data"] or {})
                old.update(data or {})
                pg_client.execute(
                    "UPDATE user_profiles SET profile_data = %s, updated_at = CURRENT_TIMESTAMP WHERE project_id = %s",
                    (json.dumps(old, ensure_ascii=False), project_id)
                )
            else:
                pg_client.execute(
                    "INSERT INTO user_profiles (project_id, profile_data) VALUES (%s, %s)",
                    (project_id, json.dumps(data or {}, ensure_ascii=False))
                )
            return {"status": "written", "layer": layer}
        return {"status": "written", "layer": layer}
