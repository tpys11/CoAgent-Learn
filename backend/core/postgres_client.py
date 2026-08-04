"""PostgreSQL 数据库连接客户端"""
import psycopg2
import psycopg2.extras
from core.config import config


class PostgresClient:
    """PostgreSQL 客户端，管理连接和执行 SQL"""

    def __init__(self):
        self.conn = None

    def connect(self):
        """获取数据库连接（自动重连）"""
        if self.conn is None or self.conn.closed:
            self.conn = psycopg2.connect(
                host=config.POSTGRES_HOST,
                port=config.POSTGRES_PORT,
                dbname=config.POSTGRES_DB,
                user=config.POSTGRES_USER,
                password=config.POSTGRES_PASSWORD,
            )
            self.conn.autocommit = True
        return self.conn

    def execute(self, sql: str, params: tuple = None) -> list:
        """执行 SQL，返回查询结果"""
        conn = self.connect()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            try:
                return cur.fetchall()
            except psycopg2.ProgrammingError:
                return []

    def init_tables(self):
        """初始化基础表结构"""
        self.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL DEFAULT '新项目',
                is_default BOOLEAN DEFAULT FALSE,
                domain VARCHAR(255) DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                archived BOOLEAN DEFAULT FALSE
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS dialogue_memories (
                dialogue_id VARCHAR(255) PRIMARY KEY,
                project_id VARCHAR(255) NOT NULL DEFAULT 'default',
                profile_data JSONB DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id SERIAL PRIMARY KEY,
                dialogue_id VARCHAR(255) NOT NULL DEFAULT '',
                project_id VARCHAR(255) NOT NULL DEFAULT 'default',
                resource_type VARCHAR(50) DEFAULT '',
                feedback VARCHAR(50) DEFAULT '',
                note TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS stats (
                id SERIAL PRIMARY KEY,
                project_id VARCHAR(255) NOT NULL DEFAULT 'default',
                tokens BIGINT DEFAULT 0,
                duration_seconds BIGINT DEFAULT 0,
                metrics JSONB DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS resources (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                content TEXT DEFAULT '',
                project_id VARCHAR(255) NOT NULL DEFAULT 'default',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS dialogues (
                id VARCHAR(255) PRIMARY KEY,
                project_id VARCHAR(255) NOT NULL DEFAULT 'default',
                session_id VARCHAR(255) NOT NULL DEFAULT 'default',
                name VARCHAR(255) NOT NULL DEFAULT '新对话',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                archived BOOLEAN DEFAULT FALSE
            )
        """)
        self.execute("""
            CREATE INDEX IF NOT EXISTS idx_dialogues_project
            ON dialogues (project_id, created_at)
        """)
        self.execute("ALTER TABLE dialogues ADD COLUMN IF NOT EXISTS session_id VARCHAR(255) NOT NULL DEFAULT 'default'")
        # 迁移旧 conversations 表数据（如有）到新表
        self.execute("""DROP TABLE IF EXISTS conversations""")
        self.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                dialogue_id VARCHAR(255) NOT NULL REFERENCES dialogues(id),
                role VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_dialogue
            ON messages (dialogue_id, created_at)
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS global_profile (
                id INTEGER PRIMARY KEY DEFAULT 1,
                data JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS project_memories (
                project_id VARCHAR(255) PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                id SERIAL PRIMARY KEY,
                project_id VARCHAR(255) UNIQUE NOT NULL DEFAULT 'default',
                profile_data JSONB DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS entities (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(100),
                properties JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS relations (
                id SERIAL PRIMARY KEY,
                source_id INTEGER REFERENCES entities(id),
                target_id INTEGER REFERENCES entities(id),
                relation_type VARCHAR(100) NOT NULL,
                properties JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # 为向量搜索预留 pgvector 扩展
        self.execute("CREATE EXTENSION IF NOT EXISTS vector")
        print("[Postgres] 表结构初始化完成")

    def close(self):
        if self.conn and not self.conn.closed:
            self.conn.close()


# 全局单例
pg_client = PostgresClient()

# 启动时自动建表（幂等）
pg_client.init_tables()
