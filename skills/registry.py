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

    def list_all(self) -> list[dict]:
        return [{"name": s.name, "description": s.description, "folder": s.__class__.__module__.split(".")[-1]}
                for s in self._skills.values()]

    def execute(self, name: str, **kwargs) -> dict:
        skill = self._skills.get(name)
        if not skill:
            return {"error": f"Skill '{name}' 不存在"}
        return skill.execute(**kwargs)

    def reload_skill(self, name: str) -> dict:
        """动态加载/重载单个 skill（上传写文件后调用），返回 {status, name 或 msg}"""
        try:
            mod = importlib.import_module(f"skills.{name}")
            importlib.reload(mod)
            for attr in dir(mod):
                obj = getattr(mod, attr)
                if isinstance(obj, type) and issubclass(obj, Skill) and obj is not Skill:
                    self._skills[obj.name] = obj()
                    return {"status": "ok", "name": obj.name}
            return {"status": "error", "msg": "代码中未找到 Skill 子类"}
        except Exception as e:
            return {"status": "error", "msg": str(e)[:200]}

    def remove_skill(self, name: str):
        """从注册中心移除 skill（删文件夹后调用）"""
        self._skills.pop(name, None)


registry = SkillRegistry()
