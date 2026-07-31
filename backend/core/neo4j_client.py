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
        self.run("CREATE CONSTRAINT IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE")
        print("[Neo4j] 约束初始化完成")

    def close(self):
        if self.driver:
            self.driver.close()


# 全局单例
neo4j_client = Neo4jClient()
