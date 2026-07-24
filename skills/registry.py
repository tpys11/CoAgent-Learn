"""Skill 注册中心 — 统一管理所有功能模块"""

from skills import Skill


class SkillRegistry:
    """单例注册中心，Agent 通过此获取可用 Skill 列表并调用"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._skills = {}
        return cls._instance

    def register(self, skill: Skill):
        self._skills[skill.name] = skill

    def get(self, name: str) -> Skill | None:
        return self._skills.get(name)

    def list_for_llm(self, agent_type: str = "all") -> list[dict]:
        """返回所有 Skill 的 LLM 可调用描述列表，可按 agent_type 过滤"""
        return [s.to_api_desc() for s in self._skills.values()]

    def execute(self, name: str, **kwargs) -> dict:
        skill = self.get(name)
        if not skill:
            return {"error": f"Skill '{name}' 不存在"}
        return skill.execute(**kwargs)


# 全局单例
registry = SkillRegistry()
