-- IBC Scheduler - 补助资料字段升级
-- 在 Supabase SQL Editor 中执行一次即可

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS major TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS student_type TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS grade TEXT;

COMMENT ON COLUMN user_profiles.student_id IS '补助明细表所需学号';
COMMENT ON COLUMN user_profiles.department IS '补助明细表所需院系';
COMMENT ON COLUMN user_profiles.major IS '补助明细表所需专业';
COMMENT ON COLUMN user_profiles.student_type IS '补助明细表所需本科生/研究生';
COMMENT ON COLUMN user_profiles.grade IS '补助明细表所需年级';
