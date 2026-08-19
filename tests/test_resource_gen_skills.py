# -*- coding: utf-8 -*-
"""resource_gen 解耦后的纯逻辑测试：skills/gen_* 契约 + resource_gen 转调层。

mock 手法：gen_* 技能 execute 内是延迟 import（from core.base_llm import DeepSeekLLM），
monkeypatch.setattr("core.base_llm.DeepSeekLLM", FakeLLM) 即可拦截；registry 转调链随之生效。
"""
import json

import pytest

from services.resource_gen import CAPABILITIES, generate_resource, list_capabilities
from skills.registry import registry
from skills.gen_quiz import GenQuiz, _validate_quiz
from skills.gen_report import GenReport
from skills.gen_flow import GenFlow
from skills.gen_tree import GenTree
from skills.gen_guide import GenGuide
from skills.gen_diagnosis import GenDiagnosis
from skills.gen_image import GenImage, _parse_wikimedia, _parse_openverse, _dedupe, search_images


class FakeLLM:
    """可配置的 DeepSeekLLM 替身：类属性即行为配置（测试中经 monkeypatch 修改）。"""

    chat_result = "mock text"
    json_result = {}
    chat_error = None
    json_error = None

    def __init__(self, *args, **kwargs):
        pass

    def chat(self, messages, temperature=0.7, max_tokens=None):
        if FakeLLM.chat_error:
            raise FakeLLM.chat_error
        return FakeLLM.chat_result

    def chat_with_json(self, messages, output_schema, temperature=0.3):
        if FakeLLM.json_error:
            raise FakeLLM.json_error
        return FakeLLM.json_result


@pytest.fixture(autouse=True)
def _fake_llm(monkeypatch):
    monkeypatch.setattr("core.base_llm.DeepSeekLLM", FakeLLM)
    FakeLLM.chat_result = "mock text"
    FakeLLM.json_result = {}
    FakeLLM.chat_error = None
    FakeLLM.json_error = None
    yield


# ---------- registry 自动发现 ----------

def test_registry_discovers_gen_skills():
    names = {s["name"] for s in registry.list_all()}
    assert {"gen_report", "gen_flow", "gen_tree", "gen_quiz", "gen_guide", "gen_diagnosis", "gen_image"} <= names
    assert GenQuiz.category == "resource"
    assert GenReport.category == "resource"
    assert GenFlow.category == "resource"
    assert GenTree.category == "resource"
    assert GenGuide.category == "resource"
    assert GenDiagnosis.category == "resource"
    assert GenImage.category == "resource"


# ---------- _validate_quiz ----------

def _valid_quiz():
    return {
        "quizTitle": "牛顿三定律测验",
        "quizSynopsis": "共5题，基础题3道(point=10)进阶题2道(point=20)",
        "questions": [
            {
                "question": "惯性大小与什么有关？",
                "questionType": "text",
                "answerSelectionType": "single",
                "answers": ["质量", "速度", "力", "位移"],
                "correctAnswer": "1",
                "messageForCorrectAnswer": "正确",
                "messageForIncorrectAnswer": "再想想",
                "explanation": "质量是惯性大小的量度",
                "point": 10,
            }
        ],
    }


def test_validate_quiz_ok():
    assert _validate_quiz(_valid_quiz()) is None


def test_validate_quiz_not_dict():
    assert _validate_quiz("x") == "生成的测验结构不完整，请重试"


def test_validate_quiz_missing_title():
    d = _valid_quiz()
    d.pop("quizTitle")
    assert _validate_quiz(d) == "生成的测验结构不完整，请重试"


def test_validate_quiz_empty_questions():
    d = _valid_quiz()
    d["questions"] = []
    assert _validate_quiz(d) == "生成的测验结构不完整，请重试"


def test_validate_quiz_correct_answer_out_of_range():
    d = _valid_quiz()
    d["questions"][0]["correctAnswer"] = "9"
    assert _validate_quiz(d) == "生成的测验结构不完整，请重试"


def test_validate_quiz_correct_answer_list_ok():
    d = _valid_quiz()
    d["questions"][0]["correctAnswer"] = ["1", "2"]
    assert _validate_quiz(d) is None


# ---------- generate_resource 转调层 ----------

def test_generate_unknown_key():
    r = generate_resource("k", "nonsense", "x")
    assert r == {"status": "error", "msg": "未知能力: nonsense"}


def test_generate_empty_content():
    r = generate_resource("k", "report", "  ")
    assert r == {"status": "error", "msg": "源内容为空"}


def test_generate_report_ok(monkeypatch):
    monkeypatch.setattr(FakeLLM, "chat_result", "# 报告\n正文内容")
    r = generate_resource("k", "report", "内容")
    assert r["status"] == "ok"
    assert r["key"] == "report"
    assert r["label"] == "报告"
    assert r["output"] == "markdown"
    assert r["content"] == "# 报告\n正文内容"


def test_generate_report_empty(monkeypatch):
    monkeypatch.setattr(FakeLLM, "chat_result", "   ")
    r = generate_resource("k", "report", "内容")
    assert r == {"status": "error", "msg": "模型未返回内容"}


def test_generate_flow_keeps_fence(monkeypatch):
    md = "```mermaid\ngraph TD\nA-->B\n```"
    monkeypatch.setattr(FakeLLM, "chat_result", md)
    r = generate_resource("k", "flow", "内容")
    assert r["status"] == "ok"
    assert r["output"] == "mermaid"
    assert r["content"] == md  # 保留 fence（与 form_flowchart 不同，资源面板直接渲染）


def test_generate_tree_keeps_fence(monkeypatch):
    md = "```mermaid\nmindmap\n  A\n    B\n```"
    monkeypatch.setattr(FakeLLM, "chat_result", md)
    r = generate_resource("k", "tree", "内容")
    assert r["status"] == "ok"
    assert r["output"] == "mermaid"
    assert r["content"] == md


def test_generate_quiz_ok(monkeypatch):
    quiz = _valid_quiz()
    monkeypatch.setattr(FakeLLM, "json_result", quiz)
    r = generate_resource("k", "quiz", "内容")
    assert r["status"] == "ok"
    assert r["key"] == "quiz"
    assert r["output"] == "markdown"
    assert json.loads(r["content"]) == quiz  # content 为 JSON 字符串（QuizViewer 可解析）


def test_generate_quiz_invalid(monkeypatch):
    monkeypatch.setattr(FakeLLM, "json_result", {"quizTitle": "t", "quizSynopsis": "s", "questions": []})
    r = generate_resource("k", "quiz", "内容")
    assert r == {"status": "error", "msg": "生成的测验结构不完整，请重试"}


def test_generate_skill_error(monkeypatch):
    monkeypatch.setattr(FakeLLM, "chat_error", RuntimeError("boom"))
    r = generate_resource("k", "report", "内容")
    assert r["status"] == "error"
    assert "boom" in r["msg"]


def test_generate_guide_ok(monkeypatch):
    monkeypatch.setattr(FakeLLM, "chat_result", "# 实操指南\n1. 第一步")
    r = generate_resource("k", "guide", "内容")
    assert r["status"] == "ok"
    assert r["key"] == "guide"
    assert r["label"] == "实操指南"
    assert r["output"] == "markdown"
    assert r["content"] == "# 实操指南\n1. 第一步"


def test_generate_guide_empty(monkeypatch):
    monkeypatch.setattr(FakeLLM, "chat_result", "")
    r = generate_resource("k", "guide", "内容")
    assert r == {"status": "error", "msg": "模型未返回内容"}


def test_generate_diagnosis_ok(monkeypatch):
    monkeypatch.setattr(FakeLLM, "chat_result", "# 学情诊断\n- 已掌握：…")
    r = generate_resource("k", "diagnosis", "内容")
    assert r["status"] == "ok"
    assert r["key"] == "diagnosis"
    assert r["label"] == "课程学情诊断"
    assert r["output"] == "markdown"
    assert r["content"] == "# 学情诊断\n- 已掌握：…"


def test_generate_diagnosis_empty(monkeypatch):
    monkeypatch.setattr(FakeLLM, "chat_result", "  ")
    r = generate_resource("k", "diagnosis", "内容")
    assert r == {"status": "error", "msg": "模型未返回内容"}


# ---------- gen_image ----------

def _wm_page(pid, title, url, width):
    return {pid: {"title": title, "imageinfo": [{"thumburl": url, "thumbwidth": width}]}}


def test_parse_wikimedia_filters_small_width():
    data = {"query": {"pages": _wm_page("1", "File:Big.jpg", "http://x/big.jpg", 800)}}
    out = _parse_wikimedia(data)
    assert len(out) == 1
    assert out[0]["url"] == "http://x/big.jpg"
    assert out[0]["title"] == "Big.jpg"  # File: 前缀剥离
    assert out[0]["source"] == "wikimedia"


def test_parse_wikimedia_skips_width_lt_400():
    data = {"query": {"pages": _wm_page("1", "File:Small.jpg", "http://x/small.jpg", 300)}}
    assert _parse_wikimedia(data) == []


def test_parse_wikimedia_malformed_returns_empty():
    assert _parse_wikimedia(None) == []
    assert _parse_wikimedia({"query": {}}) == []
    assert _parse_wikimedia({"query": {"pages": {"1": {"imageinfo": []}}}}) == []


def test_parse_openverse_ok():
    data = {"results": [{"url": "http://y/img.jpg", "title": "Pic"}, {"url": "http://y/img2.jpg", "title": "Pic2"}]}
    out = _parse_openverse(data)
    assert len(out) == 2
    assert out[0]["source"] == "openverse"
    assert out[1]["url"] == "http://y/img2.jpg"


def test_parse_openverse_malformed_returns_empty():
    assert _parse_openverse({}) == []
    assert _parse_openverse({"results": [{"title": "no url"}]}) == []


def test_dedupe_preserves_order():
    images = [{"url": "a"}, {"url": "b"}, {"url": "a"}, {"url": "c"}]
    assert [i["url"] for i in _dedupe(images)] == ["a", "b", "c"]


def test_search_images_wikimedia_happy(monkeypatch):
    data = {"query": {"pages": _wm_page("1", "File:A.jpg", "http://x/a.jpg", 800)}}
    seen_headers = {}

    def fake_get(url, **kwargs):
        seen_headers.update(kwargs.get("headers", {}))
        class R:
            def raise_for_status(self): pass
            def json(self): return data
        return R()

    monkeypatch.setattr("requests.get", fake_get)
    out = search_images("physics", limit=2)
    assert len(out) == 1
    assert out[0]["url"] == "http://x/a.jpg"
    # 403 回归防护：必须带自定义 UA（Wikimedia 拒绝默认 python-requests UA）
    assert "User-Agent" in seen_headers
    assert "python-requests" not in seen_headers["User-Agent"].lower()


def test_search_images_network_error_returns_empty(monkeypatch):
    def fake_get(url, **kwargs):
        raise ConnectionError("boom")

    monkeypatch.setattr("requests.get", fake_get)
    assert search_images("physics", limit=2) == []


def test_search_images_fallback_to_openverse(monkeypatch):
    calls = []

    def fake_get(url, **kwargs):
        calls.append(url)
        class R:
            def raise_for_status(self): pass
            def json(self):
                if "wikimedia" in url:
                    return {"query": {"pages": {}}}  # Wikimedia 空 → 走 fallback
                return {"results": [{"url": "http://y/ov.jpg", "title": "OV"}]}
        return R()

    monkeypatch.setattr("requests.get", fake_get)
    out = search_images("physics", limit=2)
    assert len(calls) == 2  # 先 Wikimedia 后 Openverse
    assert out[0]["source"] == "openverse"


def test_gen_image_short_content_execute(monkeypatch):
    """短内容不走 LLM 关键词提取，直接搜索。"""
    data = {"query": {"pages": _wm_page("1", "File:Newton.jpg", "http://x/n.jpg", 800)}}

    def fake_get(url, **kwargs):
        class R:
            def raise_for_status(self): pass
            def json(self): return data
        return R()

    monkeypatch.setattr("requests.get", fake_get)
    r = GenImage().execute(content="牛顿定律")
    assert r["content"].startswith("![Newton.jpg](http://x/n.jpg)")
    assert "图源：wikimedia" in r["content"]


def test_gen_image_long_content_llm_keywords(monkeypatch):
    """长内容（>40 字）走 LLM 提取关键词路径。"""
    long_text = "这是一段超过四十个字符的讲解内容，用来验证长文本会触发 LLM 关键词提取逻辑，而不是直接用全文。"
    data = {"query": {"pages": _wm_page("1", "File:K.jpg", "http://x/k.jpg", 800)}}

    def fake_get(url, **kwargs):
        class R:
            def raise_for_status(self): pass
            def json(self): return data
        return R()

    monkeypatch.setattr("requests.get", fake_get)
    monkeypatch.setattr(FakeLLM, "chat_result", "关键词甲, 关键词乙")
    r = GenImage().execute(content=long_text)
    assert r["content"].startswith("![K.jpg](http://x/k.jpg)")


def test_gen_image_no_results_error(monkeypatch):
    def fake_get(url, **kwargs):
        class R:
            def raise_for_status(self): pass
            def json(self): return {"query": {"pages": {}}}
        return R()

    monkeypatch.setattr("requests.get", fake_get)
    r = GenImage().execute(content="不存在的东西")
    assert r == {"error": "未找到合适图片，请换个描述重试"}


# ---------- list_capabilities ----------

def test_list_capabilities_order_and_no_prompt():
    caps = list_capabilities()
    assert [c["key"] for c in caps] == ["report", "flow", "tree", "quiz", "guide", "diagnosis", "image"]
    assert all("prompt" not in c for c in caps)


def test_capabilities_skill_mapping():
    assert CAPABILITIES["report"]["skill"] == "gen_report"
    assert CAPABILITIES["flow"]["skill"] == "gen_flow"
    assert CAPABILITIES["tree"]["skill"] == "gen_tree"
    assert CAPABILITIES["quiz"]["skill"] == "gen_quiz"
    assert CAPABILITIES["guide"]["skill"] == "gen_guide"
    assert CAPABILITIES["diagnosis"]["skill"] == "gen_diagnosis"
    assert CAPABILITIES["image"]["skill"] == "gen_image"
    assert "prompt" not in CAPABILITIES["quiz"]