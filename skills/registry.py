"""Skill 注册中心 — 自动发现 skills/ 下所有文件夹中的 Skill 类"""
import os, importlib
from skills import Skill


class SkillRegistry:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._skills = {}
            cls._instance._auto_discover()
        return cls._instance

    def _auto_discover(self):
        skill_dir = os.path.dirname(os.path.abspath(__file__))
        for folder in os.listdir(skill_dir):
            path = os.path.join(skill_dir, folder)
            if not os.path.isdir(path) or folder.startswith("__"):
                continue
            try:
                mod = importlib.import_module(f"skills.{folder}")
                for attr in dir(mod):
                    obj = getattr(mod, attr)
                    if isinstance(obj, type) and issubclass(obj, Skill) and obj is not Skill:
                        self._skills[obj.name] = obj()
            except Exception as e:
                print(f"[SkillRegistry] 加载 {folder} 失败: {e}")

    def register(self, skill: Skill):
        self._skills[skill.name] = skill

    def unregister(self, name: str):
        self._skills.pop(name, None)

    def list_all(self) -> list[dict]:
        return [{"name": s.name, "description": s.description, "folder": s.__class__.__module__.split(".")[-1]}
                for s in self._skills.values()]

    def list_for_llm(self) -> list[dict]:
        return [s.to_api_desc() for s in self._skills.values()]

    def execute(self, name: str, **kwargs) -> dict:
        skill = self._skills.get(name)
        if not skill:
            return {"error": f"Skill '{name}' 不存在"}
        return skill.execute(**kwargs)


registry = SkillRegistry()
