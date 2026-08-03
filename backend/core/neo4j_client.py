"""Neo4j 图数据库连接客户端"""
from neo4j import GraphDatabase
from core.config import config


class Neo4jClient:
    """Neo4j 客户端，管理图数据的读写"""

    def __init__(self):
        self.driver = None

    def connect(self):
        """获取数据库驱动连接"""
        if self.driver is None:
            self.driver = GraphDatabase.driver(
                config.NEO4J_URI,
                auth=(config.NEO4J_USER, config.NEO4J_PASSWORD)
            )
        return self.driver

    def run(self, query: str, params: dict = None) -> list:
        """执行 Cypher 查询"""
        driver = self.connect()
        with driver.session() as session:
            result = session.run(query, params or {})
            return [record.data() for record in result]

    def init_constraints(self):
        """初始化约束和索引"""
        # 兼容旧版本：删除全局 name 唯一约束（阻止跨项目同名实体）
        try:
            rows = self.run("SHOW CONSTRAINTS")
            for row in rows:
                if row.get("name"):
                    self.run("DROP CONSTRAINT " + row["name"] + " IF EXISTS")
        except Exception:
            pass
        # 复合唯一：同项目内 name 唯一，跨项目允许同名（Neo4j 5.9+）
        try:
            self.run("CREATE CONSTRAINT entity_project_unique IF NOT EXISTS FOR (e:Entity) REQUIRE (e.name, e.project_id) IS UNIQUE")
        except Exception:
            pass
        print("[Neo4j] 约束初始化完成")

    def close(self):
        if self.driver:
            self.driver.close()


# 全局单例
neo4j_client = Neo4jClient()
