"""Skill 注册中心 — 自动发现 skills/ 下所有文件夹中的 Skill 类"""
import os, importlib, re
from skills import Skill


class SkillRegistry:
    _instance = None
    # 输出形式 → 技能名 路由表（3.4 技能路由骨架：用户要求特定输出形式时路由到对应技能）
    _FORM_ROUTES = [
        (re.compile(r"流程图|flowchart|mermaid"), "form_flowchart"),
    ]

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

    def list_all(self) -> list[dict]:
        return [{"name": s.name, "description": s.description, "folder": s.__class__.__module__.split(".")[-1],
                 "output_schema": s.output_schema, "retries": s.retries}
                for s in self._skills.values()]

    def form_router(self, state: dict) -> str | None:
        """输出形式路由：从 state 的 user_input / processed_input 检出输出形式关键词 → 技能名（未命中返回 None）"""
        text = (state.get("user_input") or "") + " " + (state.get("processed_input") or "")
        for pat, skill in self._FORM_ROUTES:
            if pat.search(text):
                return skill
        return None

    def execute(self, name: str, **kwargs) -> dict:
        skill = self._skills.get(name)
        if not skill:
            return {"error": f"Skill '{name}' 不存在"}
        return skill.execute(**kwargs)


registry = SkillRegistry()
