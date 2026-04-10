-- IBC 补贴资料恢复脚本
-- 执行顺序建议：
-- 1. 先运行 `npm run backup:subsidy`
-- 2. 再在 Supabase SQL Editor 中执行本文件
--
-- 作用：
-- - 确保 user_profiles 具备补贴所需字段
-- - 补齐 realtime / RLS 基础配置
-- - 从 subsidy_records.rows_json 中按最新 updated_at 回填 user_profiles
-- - 回填键严格使用 rows_json.userId，不按姓名模糊匹配

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

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

ALTER TABLE public.user_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

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
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

WITH latest_rows AS (
  SELECT DISTINCT ON (u.id)
    u.id AS user_id,
    NULLIF(BTRIM(COALESCE(row_item->>'phone', '')), '') AS phone,
    NULLIF(BTRIM(COALESCE(row_item->>'studentId', '')), '') AS student_id,
    NULLIF(BTRIM(COALESCE(row_item->>'department', '')), '') AS department,
    NULLIF(BTRIM(COALESCE(row_item->>'major', '')), '') AS major,
    NULLIF(BTRIM(COALESCE(row_item->>'studentType', '')), '') AS student_type,
    NULLIF(BTRIM(COALESCE(row_item->>'grade', '')), '') AS grade,
    sr.updated_at,
    sr.exported_at,
    sr.created_at
  FROM public.subsidy_records sr
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(sr.rows_json) = 'array' THEN sr.rows_json
      ELSE '[]'::jsonb
    END
  ) AS row_item
  JOIN public.users u
    ON u.id::text = row_item->>'userId'
  WHERE COALESCE(row_item->>'userId', '') <> ''
  ORDER BY
    u.id,
    sr.updated_at DESC NULLS LAST,
    sr.exported_at DESC NULLS LAST,
    sr.created_at DESC NULLS LAST,
    sr.id DESC
),
upserted AS (
  INSERT INTO public.user_profiles (
    id,
    phone,
    student_id,
    department,
    major,
    student_type,
    grade,
    updated_at
  )
  SELECT
    user_id,
    phone,
    student_id,
    department,
    major,
    student_type,
    grade,
    NOW()
  FROM latest_rows
  ON CONFLICT (id) DO UPDATE
  SET
    phone = COALESCE(EXCLUDED.phone, public.user_profiles.phone),
    student_id = COALESCE(EXCLUDED.student_id, public.user_profiles.student_id),
    department = COALESCE(EXCLUDED.department, public.user_profiles.department),
    major = COALESCE(EXCLUDED.major, public.user_profiles.major),
    student_type = COALESCE(EXCLUDED.student_type, public.user_profiles.student_type),
    grade = COALESCE(EXCLUDED.grade, public.user_profiles.grade),
    updated_at = NOW()
  RETURNING id
)
SELECT COUNT(*) AS restored_profile_count
FROM upserted;

-- 建议执行后人工验证：
-- SELECT id, phone, student_id, department, major, student_type, grade, updated_at
-- FROM public.user_profiles
-- ORDER BY updated_at DESC, id;
--
-- SELECT name
-- FROM public.users u
-- LEFT JOIN public.user_profiles p ON p.id = u.id
-- WHERE COALESCE(p.student_id, '') = ''
--    OR COALESCE(p.department, '') = ''
--    OR COALESCE(p.major, '') = ''
--    OR COALESCE(p.student_type, '') = ''
--    OR COALESCE(p.grade, '') = '';
