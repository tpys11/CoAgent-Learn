# -*- coding: utf-8 -*-
"""Step F8-S1 守卫：解析引擎配置往返 + 引擎健康检查（缺凭据可见 WARNING，不硬失败）。

背景（派发单 §三 S1）：
1. settings 表（设置界面）优先于 .env——保存后 _apply_dynamic_settings() 即时生效；
   启动同步已由 main.py lifespan 调用（本轮核实既有行为，守卫钉住不回归）。
2. 选了 mineru 但无 token / 选了 mathpix 但无 key：启动时与解析调用时各打一条
   WARNING（优雅降级 + 可见日志，CONVENTIONS §6），文案含「怎么办」。

测试纪律（T49）：settings 往返用 tmp_path SQLiteClient + SettingsRepo(db=…)，
monkeypatch core.db.get_settings_repo——绝不触真实库 data/app.db。
"""
import logging
from pathlib import Path

import pytest

import core.db as core_db
from core.config import config as _cfg
from core.db.base import SQLiteClient
from core.db.settings_repo import SettingsRepo
from routers.settings import _apply_dynamic_settings

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MAIN_PY = PROJECT_ROOT / "backend" / "main.py"


@pytest.fixture()
def tmp_settings(tmp_path, monkeypatch):
    """tmp 库设置仓 + config 恢复保护：_apply_dynamic_settings 直接改 config 单例属性，
    monkeypatch.setattr 以现值注册 → teardown 恢复，测试间不串味。"""
    c = SQLiteClient(str(tmp_path / "f8s1.db"))
    c.init_tables()
    repo = SettingsRepo(db=c)
    monkeypatch.setattr(core_db, "get_settings_repo", lambda: repo)
    # 注册恢复点（以当前值回写，teardown 时还原）
    for k in ("PARSE_ENGINE", "MINERU_API_TOKEN", "MATHPIX_APP_ID", "MATHPIX_APP_KEY"):
        monkeypatch.setattr(_cfg, k, getattr(_cfg, k, ""))
    return repo


def test_config_roundtrip_parse_engine(tmp_settings):
    """【核心往返】set_setting(PARSE_ENGINE) → _apply_dynamic_settings →
    configured_engine() 三者一致（settings 表优先于 .env 的生效链）。"""
    from core import parse_service
    tmp_settings.set_setting("PARSE_ENGINE", "mineru")
    _apply_dynamic_settings()
    assert getattr(_cfg, "PARSE_ENGINE") == "mineru"
    assert parse_service.configured_engine() == "mineru"
    # 非法值回退 pymupdf4llm（引擎名白名单）
    tmp_settings.set_setting("PARSE_ENGINE", "no-such-engine")
    _apply_dynamic_settings()
    assert parse_service.configured_engine() == "pymupdf4llm"
    # 空值删除该键（恢复 .env 默认）
    tmp_settings.set_setting("PARSE_ENGINE", "")
    _apply_dynamic_settings()
    assert parse_service.configured_engine() in ("pymupdf4llm", "mineru", "mathpix")


def test_startup_calls_apply_dynamic_settings():
    """存在性守卫：启动同步不得回归——lifespan 必须调用 _apply_dynamic_settings()。"""
    src = MAIN_PY.read_text(encoding="utf-8-sig")
    assert "_apply_dynamic_settings()" in src, (
        "main.py lifespan 不再调用 _apply_dynamic_settings()——"
        "settings 表优先于 .env 的启动同步被撤销（S1 前提失效）"
    )


def test_mineru_without_token_warns_with_howto(tmp_settings, caplog):
    """选 mineru 无 token：健康检查必须打 WARNING（含申请指引 mineru.net），不硬失败。"""
    from core import parse_service
    _cfg.PARSE_ENGINE = "mineru"
    _cfg.MINERU_API_TOKEN = ""
    with caplog.at_level(logging.WARNING, logger="coagent.parse"):
        parse_service.check_engine_health("startup")
    assert any(r.levelno == logging.WARNING and "mineru.net" in r.getMessage()
               for r in caplog.records), "缺 token 必须有含申请指引的 WARNING"
    # 调用时同款（stage=parse）
    caplog.clear()
    with caplog.at_level(logging.WARNING, logger="coagent.parse"):
        parse_service.check_engine_health("parse")
    assert any("[parse]" in r.getMessage() for r in caplog.records)


def test_mineru_with_token_no_warning(tmp_settings, caplog):
    """凭据齐备：健康检查静默（不发无关告警）。"""
    from core import parse_service
    _cfg.PARSE_ENGINE = "mineru"
    _cfg.MINERU_API_TOKEN = "tok-fake"
    with caplog.at_level(logging.WARNING, logger="coagent.parse"):
        parse_service.check_engine_health("startup")
    assert not [r for r in caplog.records if "引擎健康" in r.getMessage()]


def test_mathpix_without_keys_warns_with_howto(tmp_settings, caplog):
    """选 mathpix 缺任一 key：同款 WARNING 含 mathpix.com 指引；齐备则静默。"""
    from core import parse_service
    _cfg.PARSE_ENGINE = "mathpix"
    _cfg.MATHPIX_APP_ID = ""
    _cfg.MATHPIX_APP_KEY = ""
    with caplog.at_level(logging.WARNING, logger="coagent.parse"):
        parse_service.check_engine_health("startup")
    assert any(r.levelno == logging.WARNING and "mathpix.com" in r.getMessage()
               for r in caplog.records)
    _cfg.MATHPIX_APP_ID = "id-fake"
    _cfg.MATHPIX_APP_KEY = "key-fake"
    caplog.clear()
    with caplog.at_level(logging.WARNING, logger="coagent.parse"):
        parse_service.check_engine_health("startup")
    assert not [r for r in caplog.records if "引擎健康" in r.getMessage()]


def test_pymupdf4llm_never_warns(tmp_settings, caplog):
    """本地引擎无需凭据：健康检查零告警（最高频路径不受日志噪声污染）。"""
    from core import parse_service
    _cfg.PARSE_ENGINE = "pymupdf4llm"
    with caplog.at_level(logging.WARNING, logger="coagent.parse"):
        parse_service.check_engine_health("startup")
    assert not [r for r in caplog.records if "引擎健康" in r.getMessage()]


def test_parse_document_reports_call_stage(tmp_settings, caplog, monkeypatch):
    """调用时告警真的挂在 parse_document 链上：mock 引擎（不真调云），
    断言 caplog 出现 [parse] 阶段告警且降级语义不变（engine_used 仍返回）。"""
    from core import parse_service
    _cfg.PARSE_ENGINE = "mineru"
    _cfg.MINERU_API_TOKEN = ""
    fake = {"mineru": lambda data, fn: (_ for _ in ()).throw(RuntimeError("no token")),
            "pymupdf4llm": lambda data, fn: "引擎健康检查探针文本"}
    monkeypatch.setattr(parse_service, "_ENGINES", fake)
    with caplog.at_level(logging.WARNING, logger="coagent.parse"):
        text, engine = parse_service.parse_document("probe.pdf", b"fake")
    assert text == "引擎健康检查探针文本" and engine == "pymupdf4llm"
    assert any("[parse]" in r.getMessage() for r in caplog.records), (
        "parse_document 调用前未触发调用时引擎健康告警"
    )
