-- D4 反向迁移：移除 messages.client_msg_id 幂等列与部分唯一索引。
-- 适用版本：本项目 .venv 实测 sqlite3 3.49.1（>= 3.35.0，支持 DROP COLUMN）。
-- ⚠️ 必须在后端停机窗口执行（运行中直改 SQLite 会被 backend 自身页缓存整页回写覆盖）：
--   docker compose -f deploy/docker-compose.yml stop backend
--   sqlite3 data/app.db < backend/core/db/rollback_d4_client_msg_id.sql
--   docker compose -f deploy/docker-compose.yml start backend

DROP INDEX IF EXISTS uq_messages_client_msg_id;
ALTER TABLE messages DROP COLUMN client_msg_id;

-- 若 sqlite3 < 3.35.0（不支持 DROP COLUMN），用重建表替代（按旧 6 列建新表回填后改名）：
--   CREATE TABLE messages_new (
--       id INTEGER PRIMARY KEY AUTOINCREMENT,
--       dialogue_id TEXT NOT NULL REFERENCES dialogues(id),
--       role TEXT NOT NULL,
--       content TEXT NOT NULL,
--       think TEXT DEFAULT '',
--       created_at TEXT DEFAULT (datetime('now'))
--   );
--   INSERT INTO messages_new(id, dialogue_id, role, content, think, created_at)
--       SELECT id, dialogue_id, role, content, think, created_at FROM messages;
--   DROP TABLE messages;
--   ALTER TABLE messages_new RENAME TO messages;
--   CREATE INDEX IF NOT EXISTS idx_messages_dialogue ON messages (dialogue_id, created_at);
