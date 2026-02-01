-- 创建rooms表
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 创建索引以优化查询
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);

-- 查看表结构（验证用）
PRAGMA table_info(rooms);