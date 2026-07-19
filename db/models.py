"""SQLAlchemy 数据库模型"""
from sqlalchemy import Column, Integer, String, Text, DateTime, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timezone
import json
import os

from backend.core.config import config

Base = declarative_base()


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), unique=True, nullable=False, index=True)
    project_name = Column(String(128), default="")
    background = Column(Text, default="")           # 自由文本：学历/专业背景
    knowledge_map = Column(Text, default="{}")       # JSON：诊断结果
    learning_goal = Column(String(256), default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class InteractionLog(Base):
    __tablename__ = "interaction_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), nullable=False, index=True)
    agent_name = Column(String(64), default="")
    input_summary = Column(String(512), default="")
    output_summary = Column(String(512), default="")
    tokens_used = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ---------- 数据库初始化 ----------
_db_path = config.SQLITE_PATH
os.makedirs(os.path.dirname(_db_path) or ".", exist_ok=True)

_engine = create_engine(
    f"sqlite:///{_db_path}",
    connect_args={"check_same_thread": False},
    echo=False,
)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


def init_db():
    """建表（幂等，不覆盖已有数据）"""
    Base.metadata.create_all(bind=_engine)
    return _engine
