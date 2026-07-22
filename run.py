"""
CoAgent-Learn 开发服务器启动脚本
用法: python run.py
"""
import sys, os

# 确保项目根目录在 sys.path 中
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# 设置默认环境变量（如果缺失）
from dotenv import load_dotenv
load_dotenv()

if not os.getenv("DEEPSEEK_API_KEY"):
    print("[WARN] 未设置 DEEPSEEK_API_KEY，进入界面预览模式（Agent 功能不可用）")
    os.environ["DEEPSEEK_API_KEY"] = "preview-mode"

# 加载应用
print("[OK] 正在启动 CoAgent-Learn ...")
from backend.main import app
import uvicorn

print("[OK] 服务已启动: http://localhost:8000")
print("[INFO] 按 Ctrl+C 停止服务")
uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
