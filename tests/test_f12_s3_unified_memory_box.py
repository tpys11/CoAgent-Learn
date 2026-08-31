# -*- coding: utf-8 * -*-
"""F12-S3 守卫：课程记忆三处（记忆界面 / 项目配置弹窗 / 对话左栏）统一由 MemoryBox 单框渲染。

背景：对话左栏（KnowledgeView）此前自拼文本渲染且 textarea 无保存调用（假编辑），
字段名还停留在课程概述/水平等旧键——S3 换装 MemoryBox 后与记忆界面同一条
「键值合并保存」写路径。守卫钉死「三处引用同一组件」防再次漂移。读盘 utf-8-sig。
"""
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend" / "src" / "components"
MEMORY_VIEW = FRONTEND / "MemoryView.tsx"
KNOWLEDGE_VIEW = FRONTEND / "KnowledgeView.tsx"
PROJECT_CONFIG = FRONTEND / "ProjectConfigModal.tsx"


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8-sig")


def test_memory_view_uses_memory_box():
    src = _read(MEMORY_VIEW)
    assert "from './memoryView/MemoryBox'" in src, "记忆界面必须复用 MemoryBox 单框组件"


def test_knowledge_view_sidebar_uses_memory_box():
    src = _read(KNOWLEDGE_VIEW)
    assert "from './memoryView/MemoryBox'" in src, "对话左栏课程记忆必须复用 MemoryBox（S3 统一）"
    assert "<MemoryBox" in src, "对话左栏必须实际挂载 MemoryBox"
    # 写路径统一：保存必须走与记忆界面相同的 api.saveProjectMemory 键值合并
    assert "api.saveProjectMemory" in src, "对话左栏记忆编辑必须落库（此前是无保存调用的假编辑）"


def test_project_config_modal_routes_memory_tab_through_memory_view():
    src = _read(PROJECT_CONFIG)
    assert "import MemoryView from './MemoryView'" in src, "项目配置弹窗的记忆页签必须经 MemoryView（内含 MemoryBox）"
