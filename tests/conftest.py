# pytest 配置：test_base_llm.py 是需真实 API Key 的手动验证脚本（无 Key 时 sys.exit），
# 不作为单元测试收集；只跑纯逻辑测试 test_graph_logic.py。
collect_ignore = ["test_base_llm.py"]
