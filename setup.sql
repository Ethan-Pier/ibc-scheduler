-- IBC 排班系统 - Supabase 数据库初始化 / 对齐脚本
-- 可重复执行，适用于首次初始化和线上结构补齐。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- 用户表
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 用户可排班时间
CREATE TABLE IF NOT EXISTS public.availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  period INTEGER NOT NULL CHECK (period >= 1 AND period <= 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, day_of_week, period)
);

-- 管理员最终排班
CREATE TABLE IF NOT EXISTS public.schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  period INTEGER NOT NULL CHECK (period >= 1 AND period <= 8),
  assigned BOOLEAN NOT NULL DEFAULT true,
  explanation JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(day_of_week, period)
);

ALTER TABLE public.schedule ADD COLUMN IF NOT EXISTS assigned BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.schedule ADD COLUMN IF NOT EXISTS explanation JSONB;
ALTER TABLE public.schedule ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.schedule ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 用户资料 / 补贴资料
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  phone TEXT,
  student_id TEXT,
  department TEXT,
  major TEXT,
  student_type TEXT,
  grade TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS major TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS student_type TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 请假记录
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  period INTEGER NOT NULL CHECK (period >= 1 AND period <= 8),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 排班历史
CREATE TABLE IF NOT EXISTS public.schedule_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 补贴导出记录 / 草稿
CREATE TABLE IF NOT EXISTS public.subsidy_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('draft', 'exported')),
  source_type TEXT NOT NULL CHECK (source_type IN ('schedule', 'record_copy')),
  record_month TEXT NOT NULL,
  month_start DATE NOT NULL,
  month_end DATE NOT NULL,
  preparer_name TEXT,
  preparer_phone TEXT,
  prepared_date DATE NOT NULL,
  rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  over_limit_notes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_hours NUMERIC(10, 1) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  exported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS record_month TEXT;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS month_start DATE;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS month_end DATE;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS preparer_name TEXT;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS preparer_phone TEXT;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS prepared_date DATE;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS rows_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS over_limit_notes_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS total_hours NUMERIC(10, 1) NOT NULL DEFAULT 0;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ;
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.subsidy_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_availability_user_slot
  ON public.availability (user_id, day_of_week, period);
CREATE INDEX IF NOT EXISTS idx_schedule_user_id
  ON public.schedule (user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status_created_at
  ON public.leave_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_history_generated_at
  ON public.schedule_history (generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_subsidy_records_status_updated_at
  ON public.subsidy_records (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_subsidy_records_record_month
  ON public.subsidy_records (record_month);

DROP TRIGGER IF EXISTS set_schedule_updated_at ON public.schedule;
CREATE TRIGGER set_schedule_updated_at
BEFORE UPDATE ON public.schedule
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER set_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER set_leave_requests_updated_at
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_subsidy_records_updated_at ON public.subsidy_records;
CREATE TRIGGER set_subsidy_records_updated_at
BEFORE UPDATE ON public.subsidy_records
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.availability REPLICA IDENTITY FULL;
ALTER TABLE public.schedule REPLICA IDENTITY FULL;
ALTER TABLE public.user_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.leave_requests REPLICA IDENTITY FULL;
ALTER TABLE public.schedule_history REPLICA IDENTITY FULL;
ALTER TABLE public.subsidy_records REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'availability'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.availability;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'schedule'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'leave_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'schedule_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_history;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'subsidy_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subsidy_records;
  END IF;
END
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subsidy_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON public.users FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'availability' AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON public.availability FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'schedule' AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON public.schedule FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles' AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'leave_requests' AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON public.leave_requests FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'schedule_history' AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON public.schedule_history FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subsidy_records' AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON public.subsidy_records FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
