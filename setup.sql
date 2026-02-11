-- IBC 排班系統 - Supabase 數據庫初始化腳本
-- 在 Supabase SQL Editor 中執行此文件

-- 用戶表
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 給班表（使用者標記的可排班時間）
CREATE TABLE IF NOT EXISTS availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  period INTEGER NOT NULL CHECK (period >= 1 AND period <= 8),
  UNIQUE(user_id, day_of_week, period)
);

-- 排班表（管理員安排的最終排班）
CREATE TABLE IF NOT EXISTS schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  period INTEGER NOT NULL CHECK (period >= 1 AND period <= 8),
  UNIQUE(day_of_week, period)
);

-- 啟用 Realtime 同步
ALTER TABLE schedule REPLICA IDENTITY FULL;
ALTER TABLE availability REPLICA IDENTITY FULL;
ALTER TABLE users REPLICA IDENTITY FULL;

-- 創建 publication（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- 添加表到 publication
ALTER PUBLICATION supabase_realtime ADD TABLE schedule;
ALTER PUBLICATION supabase_realtime ADD TABLE availability;
ALTER PUBLICATION supabase_realtime ADD TABLE users;

-- 創建 RLS 策略（允許匿名訪問）
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule ENABLE ROW LEVEL SECURITY;

-- 允許所有人讀取和寫入
CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON availability FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON schedule FOR ALL USING (true) WITH CHECK (true);

-- 插入測試數據（可選）
-- INSERT INTO users (name) VALUES ('Ethan'), ('Alice'), ('Bob');
