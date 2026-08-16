# -*- coding: utf-8 -*-
"""设置域 repo（动态服务配置）。"""
from core.db.base import get_db


class SettingsRepo:
    def __init__(self, db=None):
        self._db = db or get_db()

    def get_setting(self, key: str) -> str:
        return self._db.get_setting(key)

    def set_setting(self, key: str, value: str):
        self._db.set_setting(key, value)

    def get_all_settings(self) -> dict:
        return self._db.get_all_settings()


_settings_repo = None


def get_settings_repo() -> SettingsRepo:
    global _settings_repo
    if _settings_repo is None:
        _settings_repo = SettingsRepo()
    return _settings_repo
