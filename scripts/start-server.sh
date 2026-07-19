#!/bin/bash
# 启动开发服务器
cd "D:/desktop/guashuai-project"
.venv/Scripts/python -c "import sys; sys.path.insert(0, 'D:/desktop/guashuai-project'); from backend.main import app; import uvicorn; uvicorn.run(app, host='127.0.0.1', port=8000)"
