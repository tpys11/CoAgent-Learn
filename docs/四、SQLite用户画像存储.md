

## 新建文件

| 文件                      | 职责                                                       |
| ----------------------- | -------------------------------------------------------- |
| `db/models.py`          | SQLAlchemy模型定义（UserProfile + InteractionLog） + 数据库初始化    |
| `db/user_profile.py`    | CRUD封装函数                                                 |
| `backend/ui/sidebar.py` | 修改：新建项目时调用 `create_profile`                              |
| `backend/main.py`       | 修改：诊断完成调用 `update_knowledge_map`，发消息调用 `log_interaction` |
| `data/app.db`           | SQLite数据库文件（自动创建）                                        |

***

## 两个数据表

### UserProfile（用户画像）

| 字段                      | 类型         | 说明                                            |
| ----------------------- | ---------- | --------------------------------------------- |
| id                      | Integer PK | 自增                                            |
| session_id              | String(64) | 项目名（唯一索引）                                     |
| project_name            | String     | 项目名称                                          |
| background              | Text       | 用户自由文本描述背景                                    |
| knowledge_map           | Text       | JSON：诊断结果 `{"概念名": "familiar/heard/unknown"}` |
| learning_goal           | String     | 学习目标                                          |
| created_at / updated_at | DateTime   | 时间戳                                           |

### InteractionLog（交互日志）

| 字段             | 类型         | 说明                                     |
| -------------- | ---------- | -------------------------------------- |
| id             | Integer PK | 自增                                     |
| session_id     | String     | 关联项目                                   |
| agent_name     | String     | user / diagnosis / generation / review |
| input_summary  | String     | 输入摘要（截取前200字）                          |
| output_summary | String     | 输出摘要                                   |
| tokens_used    | Integer    | Token用量                                |
| created_at     | DateTime   | 时间戳                                    |

***

## CRUD函数

| 函数                                                          | 作用         |
| ----------------------------------------------------------- | ---------- |
| `create_profile(session_id, ...)`                           | 新建项目时调用    |
| `get_profile(session_id)`                                   | 读取画像       |
| `update_knowledge_map(session_id, map)`                     | 诊断完成后更新知识图 |
| `update_learning_goal(session_id, goal)`                    | 更新学习目标     |
| `log_interaction(session_id, agent, input, output, tokens)` | 记录每次交互     |

***

## 界面接入点

1. **新建项目**（sidebar.py `confirm()`）：调用 `create_profile(session_id=name, project_name=name)`

2. **诊断完成**（main.py `_on_diagnosis_complete()`）：调用 `update_knowledge_map(current_project, raw_answers)`

3. **发送消息**（main.py `_handle_message()`）：调用 `log_interaction(current_project, "user", text[:200], "", 0)`

所有调用都包在 `try/except` 里，数据库错误不影响界面运行。

***

## 验证

```bash
cd D:/desktop/guashuai-project
.venv/Scripts/python -c "
from db.models import init_db; init_db()
from db.user_profile import create_profile, get_profile
p = create_profile('test-001', '测试项目')
g = get_profile('test-001')
print(g.project_name)
"
```

数据库文件位置由 `.env` 中 `SQLITE_PATH=./data/app.db` 控制。
