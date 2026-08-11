# -*- coding: utf-8 -*-
"""知识图谱服务：LLM 抽取实体关系 → 存 Neo4j → 查询 nodes/edges（按项目隔离）"""
import json


def _extract_json(text):
    """从 LLM 返回文本中提取 JSON"""
    if not text:
        return []
    s = text.strip()
    if s.startswith("```"):
        lines = s.split(chr(10))
        lines = [l for l in lines if not l.strip().startswith("```")]
        s = chr(10).join(lines).strip()
    start = s.find("[")
    end = s.rfind("]")
    if start >= 0 and end > start:
        s = s[start:end+1]
    try:
        data = json.loads(s)
        if isinstance(data, list):
            return data
        return []
    except Exception:
        return []


def extract_relations(text: str, api_key: str = "") -> list:
    """用 LLM 从文本中抽取实体关系，返回 [{"from":..,"rel":..,"to":..}]"""
    try:
        import requests as _req
        from core.config import config as _cfg
        NL = chr(10)
        prompt = (
            "请从下面的文本中抽取重要的实体关系，输出 JSON 数组。" + NL +
            "每项格式：{\"from\":\"实体A\",\"rel\":\"关系\",\"to\":\"实体B\"}。" + NL +
            "只抽取有意义的关系（人物关系、隶属、属性、因果、创作等），数量 3-20 条。" + NL +
            "只输出 JSON 数组，不要多余文字。" + NL + NL +
            "文本：" + NL + text[:3000]
        )
        h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
        resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
            json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}], "max_tokens": 800},
            headers=h, timeout=60)
        if resp.status_code == 200:
            content = resp.json()["choices"][0]["message"]["content"] or ""
            return _extract_json(content)
        return []
    except Exception:
        return []


def store_relations(project_id: str, relations: list, source: str = "") -> int:
    """把关系写入 Neo4j（按项目隔离），返回写入条数"""
    if not relations:
        return 0
    from core.neo4j_client import neo4j_client
    count = 0
    for r in relations:
        a = str(r.get("from", "")).strip()
        rel = str(r.get("rel", "")).strip()
        b = str(r.get("to", "")).strip()
        if not a or not b or not rel or len(a) > 50 or len(b) > 50:
            continue
        try:
            neo4j_client.run(
                "MERGE (x:Entity {name:$a, project_id:$p}) "
                "MERGE (y:Entity {name:$b, project_id:$p}) "
                "MERGE (x)-[r:REL {type:$rel, project_id:$p, source:$s}]->(y)",
                {"a": a, "b": b, "rel": rel, "p": project_id, "s": source})
            count += 1
        except Exception:
            continue
    return count


def get_graph(project_id: str, limit: int = 200) -> dict:
    """查询项目知识图谱，返回 {nodes, edges}"""
    from core.neo4j_client import neo4j_client
    try:
        rows = neo4j_client.run(
            "MATCH (a:Entity {project_id:$p})-[r:REL {project_id:$p}]->(b:Entity {project_id:$p}) "
            "RETURN a.name AS from, r.type AS rel, b.name AS to LIMIT $limit",
            {"p": project_id, "limit": limit})
    except Exception:
        return {"nodes": [], "edges": []}
    nodes_map = {}
    edges = []
    for row in rows:
        f = row.get("from") or ""
        t = row.get("to") or ""
        rel = row.get("rel") or ""
        if not f or not t:
            continue
        nodes_map[f] = {"id": f, "name": f}
        nodes_map[t] = {"id": t, "name": t}
        edges.append({"source": f, "target": t, "relation": rel})
    return {"nodes": list(nodes_map.values()), "edges": edges}


def delete_relations_by_source(project_id: str, source: str) -> int:
    """删除某来源文档的全部图谱关系，并清理孤立实体，返回删除关系数"""
    from core.neo4j_client import neo4j_client
    try:
        rows = neo4j_client.run(
            "MATCH ()-[r:REL {project_id:$p, source:$s}]->() RETURN count(r) AS c",
            {"p": project_id, "s": source})
        n = rows[0]["c"] if rows else 0
        neo4j_client.run(
            "MATCH ()-[r:REL {project_id:$p, source:$s}]->() DELETE r",
            {"p": project_id, "s": source})
        # 清理该项目的孤立实体（没有关系的节点）
        neo4j_client.run(
            "MATCH (n:Entity {project_id:$p}) WHERE NOT (n)--() DELETE n",
            {"p": project_id})
        return n
    except Exception:
        return 0
