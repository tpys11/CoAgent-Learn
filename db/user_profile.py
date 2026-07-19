"""用户画像 & 交互日志 CRUD"""
import json
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from db.models import init_db, SessionLocal, UserProfile, InteractionLog


def _get_db() -> Session:
    init_db()
    return SessionLocal()


# ========== UserProfile ==========

def create_profile(session_id: str, project_name: str = "", background: str = "",
                   knowledge_map: dict | None = None, learning_goal: str = "") -> UserProfile:
    db = _get_db()
    try:
        profile = UserProfile(
            session_id=session_id,
            project_name=project_name,
            background=background,
            knowledge_map=json.dumps(knowledge_map or {}, ensure_ascii=False),
            learning_goal=learning_goal,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile
    finally:
        db.close()


def get_profile(session_id: str) -> UserProfile | None:
    db = _get_db()
    try:
        return db.query(UserProfile).filter_by(session_id=session_id).first()
    finally:
        db.close()


def update_knowledge_map(session_id: str, new_map: dict):
    db = _get_db()
    try:
        profile = db.query(UserProfile).filter_by(session_id=session_id).first()
        if profile:
            profile.knowledge_map = json.dumps(new_map, ensure_ascii=False)
            profile.updated_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def update_learning_goal(session_id: str, goal: str):
    db = _get_db()
    try:
        profile = db.query(UserProfile).filter_by(session_id=session_id).first()
        if profile:
            profile.learning_goal = goal
            profile.updated_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


# ========== InteractionLog ==========

def log_interaction(session_id: str, agent_name: str, input_summary: str,
                    output_summary: str, tokens_used: int = 0):
    db = _get_db()
    try:
        log = InteractionLog(
            session_id=session_id,
            agent_name=agent_name,
            input_summary=input_summary,
            output_summary=output_summary,
            tokens_used=tokens_used,
        )
        db.add(log)
        db.commit()
    finally:
        db.close()
