# -*- coding: utf-8 *-* 
"""R-D S3：辅助链收敛守卫。
①vision 吞没（owner 拍板「无反馈直接吞没」）：_describe_image_main 任何失败→log.warning+空描述，
  不抛异常（仅此点吞没，其余收敛点照常上报）；成功路径不受吞没影响（行为层钉住）。
②resource_gen 注册表决策：base_url/model 前端传参降级为忽略，实参由注册表 main 格给出
  （standard=dsv4f+DEEPSEEK 端点）——对外契约微变的守卫面。
T33：main/pipeline 一律执行期导入；FakeLLM 替身沿用 test_resource_gen_skills.py 手法。"""
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


class _BoomLLM:
    """构造即抛（缺 key 场景替身）。"""

    def __init__(self, *a, **k):
        raise RuntimeError("no key")


class _OkLLM:
    """正常返回描述文本的替身。"""

    def __init__(self, *a, **k):
        pass

    def chat(self, messages, temperature=0.2, max_tokens=None):
        return "图片描述文本"


def test_rd_s3_vision_describe_swallow(monkeypatch):
    """吞没语义：失败→空描述不抛；成功→描述原样（变异②靶点：except 改 raise 则前半恰红）。"""
    import routers.knowledge as kmod
    monkeypatch.setattr("core.base_llm.DeepSeekLLM", _BoomLLM)
    assert kmod._describe_image_main("b64", "p", "image/png", "") == ""
    monkeypatch.setattr("core.base_llm.DeepSeekLLM", _OkLLM)
    assert kmod._describe_image_main("b64", "p", "image/png", "sk-fake") == "图片描述文本"


def test_rd_s3_resource_gen_registry_decision(monkeypatch):
    """resource_gen 的 base_url/model 由注册表决策：传入的前端硬编码值被忽略，
    DeepSeekLLM 实参收到注册表 main/standard 格（dsv4f + DEEPSEEK 端点 + 调用方 key 前序）。"""
    from services.resource_gen import generate_resource

    captured = {}

    class _RecLLM:
        def __init__(self, api_key="", model=None, base_url=None, thinking=None, effort=None):
            captured.update({"api_key": api_key, "model": model, "base_url": base_url})

        def chat(self, messages, temperature=0.5, max_tokens=None):
            return "# 报告\n正文"

    monkeypatch.setattr("core.base_llm.DeepSeekLLM", _RecLLM)
    # 前端风格入参：硬编码 base_url/model（二值二选一的旧契约）——应被忽略
    r = generate_resource("sk-caller", "report", "内容",
                          base_url="https://open.bigmodel.cn/api/paas/v4", model="glm-4-flash")
    assert r["status"] == "ok"
    from core.model_provider import resolve_model
    spec = resolve_model("main", "standard")
    assert captured["model"] == spec.model == "deepseek-v4-flash-vision-exp"
    assert captured["base_url"] == spec.base_url
    assert captured["api_key"] == "sk-caller"   # standard 格 key 前序「调用方 or DEEPSEEK」
