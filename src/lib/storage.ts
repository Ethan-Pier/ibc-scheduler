import { createClient } from '@supabase/supabase-js';
import {
  buildExplainableAutoSchedule,
  DEFAULT_AUTO_SCHEDULE_CONFIG,
  normalizeAutoScheduleConfig,
  rebuildScheduleExplanations,
} from './autoSchedule';
import {
  restoreEditableSubsidyRows,
  type EditableSubsidyRow,
  type SubsidyRecord,
  type SubsidyRecordSourceType,
  type SubsidyRecordStatus,
} from './subsidy';
import type {
  AutoScheduleConfig,
  ScheduleExplanation,
  User,
  Availability,
  Schedule,
  UserProfile,
} from '../types';

// ⚠️ 配置你的 Supabase 项目
// 1. 在 Supabase 创建项目
// 2. 执行 setup.sql 初始化数据库
// 3. 在 Project Settings > API 中获取以下信息

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gwohqnrjsshxqvgpdxkj.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3b2hxbnJqc3NoeHF2Z3BkeGtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjY5MzMsImV4cCI6MjA4NjMwMjkzM30.TBAyDjYmjyVxfiY95vyNUj4DxML_JNvg5YZV-lrMyCI';

// 检查配置
if (SUPABASE_URL.includes('your-project') || SUPABASE_KEY.includes('your-key')) {
  console.warn('⚠️ 请配置 Supabase：编辑 src/lib/storage.ts 或设置环境变量');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Local cache for offline support
const LOCAL_STORAGE_KEYS = {
  USERS: 'ibc-users',
  AVAILABILITY: 'ibc-availability',
  SCHEDULE: 'ibc-schedule',
  SCHEDULE_EXPLANATIONS: 'ibc-schedule-explanations-v2',
  AUTO_SCHEDULE_CONFIG: 'ibc-auto-schedule-config',
  CURRENT_USER: 'ibc-current-user',
  USER_PROFILES: 'ibc-user-profiles',
  SCHEDULE_HISTORY: 'ibc-schedule-history',
  SUBSIDY_RECORDS: 'ibc-subsidy-records',
};

const REQUIRED_SUBSIDY_PROFILE_DB_COLUMNS = [
  'student_id',
  'department',
  'major',
  'student_type',
  'grade',
] as const;

export interface SubsidyProfileSchemaHealth {
  healthy: boolean;
  missingColumns: string[];
  checkedAt: string;
  errorMessage?: string;
}

export interface UserProfileSaveResult {
  localCached: boolean;
  remoteSynced: boolean;
  schemaHealthy: boolean;
  missingColumns: string[];
  errorMessage?: string;
}

function getScheduleSlotKey(dayOfWeek: number, period: number): string {
  return `${dayOfWeek}-${period}`;
}

function normalizeProfileValue(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeSubsidyNoteMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, item]) => {
    const text = typeof item === 'string' ? item.trim() : '';
    if (text) {
      acc[key] = text;
    }
    return acc;
  }, {});
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'unknown_error';
}

function mapDbProfile(data: Record<string, unknown>): UserProfile {
  return {
    id: String(data.id),
    phone: normalizeProfileValue(data.phone as string | undefined),
    studentId: normalizeProfileValue(data.student_id as string | undefined),
    department: normalizeProfileValue(data.department as string | undefined),
    major: normalizeProfileValue(data.major as string | undefined),
    studentType: normalizeProfileValue(data.student_type as string | undefined),
    grade: normalizeProfileValue(data.grade as string | undefined),
    updatedAt: (data.updated_at as string | undefined) || undefined,
  };
}

function toDbProfile(profile: UserProfile) {
  return {
    id: profile.id,
    phone: normalizeProfileValue(profile.phone) || null,
    student_id: normalizeProfileValue(profile.studentId) || null,
    department: normalizeProfileValue(profile.department) || null,
    major: normalizeProfileValue(profile.major) || null,
    student_type: normalizeProfileValue(profile.studentType) || null,
    grade: normalizeProfileValue(profile.grade) || null,
    updated_at: new Date().toISOString(),
  };
}

function readLocalProfileCache(): Map<string, UserProfile> {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_PROFILES);
  if (!raw) {
    return new Map();
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, UserProfile>;
    return new Map(Object.entries(parsed));
  } catch (error) {
    console.error('Error reading cached user profiles:', error);
    return new Map();
  }
}

function writeLocalProfileCache(profileMap: Map<string, UserProfile>) {
  const payload = Object.fromEntries(profileMap.entries());
  localStorage.setItem(LOCAL_STORAGE_KEYS.USER_PROFILES, JSON.stringify(payload));
}

export async function getSubsidyProfileSchemaHealth(): Promise<SubsidyProfileSchemaHealth> {
  const missingColumns: string[] = [];
  let firstErrorMessage: string | undefined;

  for (const column of REQUIRED_SUBSIDY_PROFILE_DB_COLUMNS) {
    const { error } = await supabase
      .from('user_profiles')
      .select(`id,${column}`)
      .limit(1);

    if (error) {
      missingColumns.push(column);
      firstErrorMessage ||= error.message;
    }
  }

  return {
    healthy: missingColumns.length === 0,
    missingColumns,
    checkedAt: new Date().toISOString(),
    errorMessage: firstErrorMessage,
  };
}

function readScheduleExplanationCache(): Record<string, ScheduleExplanation> {
  // Keep explanation data additive so the existing schedule table can stay unchanged.
  const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.SCHEDULE_EXPLANATIONS);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, ScheduleExplanation>;
  } catch (error) {
    console.error('Error reading cached schedule explanations:', error);
    return {};
  }
}

function writeScheduleExplanationCache(explanations: Record<string, ScheduleExplanation>) {
  localStorage.setItem(LOCAL_STORAGE_KEYS.SCHEDULE_EXPLANATIONS, JSON.stringify(explanations));
}

type ScheduleHistoryGenerationMode = 'auto' | 'manual';

interface SerializedScheduleHistoryNote {
  __ibcScheduleHistory: true;
  text: string;
  generationMode: ScheduleHistoryGenerationMode;
  createdBy: string;
}

function createScheduleHistoryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function serializeScheduleHistoryNote(
  text: string,
  generationMode: ScheduleHistoryGenerationMode,
  createdBy: string,
): string {
  const payload: SerializedScheduleHistoryNote = {
    __ibcScheduleHistory: true,
    text,
    generationMode,
    createdBy,
  };

  return JSON.stringify(payload);
}

function parseScheduleHistoryNote(note: string): {
  text: string;
  generationMode: ScheduleHistoryGenerationMode;
  createdBy: string;
} {
  try {
    const parsed = JSON.parse(note) as Partial<SerializedScheduleHistoryNote>;
    if (parsed.__ibcScheduleHistory) {
      return {
        text: parsed.text || '',
        generationMode: parsed.generationMode === 'manual' ? 'manual' : 'auto',
        createdBy: parsed.createdBy || 'Admin',
      };
    }
  } catch {
    // Legacy plain-text note support.
  }

  return {
    text: note || '',
    generationMode: 'auto',
    createdBy: 'Admin',
  };
}

function normalizeScheduleHistoryEntry(data: {
  id?: string;
  schedule_data?: unknown;
  generated_at?: string;
  note?: string;
}): ScheduleHistory {
  const parsedNote = parseScheduleHistoryNote(data.note || '');
  return {
    id: data.id || createScheduleHistoryId(),
    schedule_data: Array.isArray(data.schedule_data) ? (data.schedule_data as Schedule[]) : [],
    generated_at: data.generated_at || new Date().toISOString(),
    note: parsedNote.text,
    generationMode: parsedNote.generationMode,
    createdBy: parsedNote.createdBy,
  };
}

function readLocalScheduleHistory(): ScheduleHistory[] {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.SCHEDULE_HISTORY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<{
      id?: string;
      schedule_data?: unknown;
      generated_at?: string;
      note?: string;
      generationMode?: ScheduleHistoryGenerationMode;
      createdBy?: string;
    }>;
    return parsed.map((item) =>
      normalizeScheduleHistoryEntry({
        id: item.id,
        schedule_data: item.schedule_data,
        generated_at: item.generated_at,
        note: serializeScheduleHistoryNote(
          item.note || '',
          item.generationMode === 'manual' ? 'manual' : 'auto',
          item.createdBy || 'Admin',
        ),
      }),
    );
  } catch (error) {
    console.error('Error reading local schedule history:', error);
    return [];
  }
}

function writeLocalScheduleHistory(entries: ScheduleHistory[]) {
  localStorage.setItem(
    LOCAL_STORAGE_KEYS.SCHEDULE_HISTORY,
    JSON.stringify(
      entries
        .slice(0, 20)
        .map((entry) => ({
          id: entry.id,
          schedule_data: entry.schedule_data,
          generated_at: entry.generated_at,
          note: entry.note,
          generationMode: entry.generationMode,
          createdBy: entry.createdBy,
        })),
    ),
  );
}

function upsertLocalScheduleHistory(entry: ScheduleHistory) {
  const existing = readLocalScheduleHistory().filter((item) => item.id !== entry.id);
  const next = [entry, ...existing].sort(
    (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime(),
  );
  writeLocalScheduleHistory(next);
}

function normalizeSubsidyRecordEntry(data: Record<string, unknown>): SubsidyRecord {
  return {
    id: String(data.id),
    status: data.status === 'exported' ? 'exported' : 'draft',
    sourceType: data.source_type === 'record_copy' ? 'record_copy' : 'schedule',
    recordMonth: String(data.record_month || ''),
    monthStart: String(data.month_start || ''),
    monthEnd: String(data.month_end || ''),
    preparerName: typeof data.preparer_name === 'string' ? data.preparer_name : '',
    preparerPhone: typeof data.preparer_phone === 'string' ? data.preparer_phone : '',
    preparedDate: typeof data.prepared_date === 'string' ? data.prepared_date : '',
    rows: restoreEditableSubsidyRows(
      Array.isArray(data.rows_json) ? (data.rows_json as EditableSubsidyRow[]) : [],
    ),
    overLimitNotes: normalizeSubsidyNoteMap(data.over_limit_notes_json),
    totalHours: Number(data.total_hours || 0),
    totalAmount: Number(data.total_amount || 0),
    exportedAt: typeof data.exported_at === 'string' ? data.exported_at : undefined,
    createdAt: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
  };
}

function serializeSubsidyRecord(record: SubsidyRecord) {
  return {
    id: record.id,
    status: record.status,
    source_type: record.sourceType,
    record_month: record.recordMonth,
    month_start: record.monthStart,
    month_end: record.monthEnd,
    preparer_name: record.preparerName,
    preparer_phone: record.preparerPhone,
    prepared_date: record.preparedDate,
    rows_json: restoreEditableSubsidyRows(record.rows),
    over_limit_notes_json: normalizeSubsidyNoteMap(record.overLimitNotes),
    total_hours: Number(record.totalHours.toFixed(1)),
    total_amount: Number(record.totalAmount.toFixed(2)),
    exported_at: record.exportedAt || null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function readLocalSubsidyRecords(): SubsidyRecord[] {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.SUBSIDY_RECORDS);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    return parsed.map((item) => normalizeSubsidyRecordEntry(item));
  } catch (error) {
    console.error('Error reading local subsidy records:', error);
    return [];
  }
}

function writeLocalSubsidyRecords(records: SubsidyRecord[]) {
  const ordered = [...records].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  localStorage.setItem(
    LOCAL_STORAGE_KEYS.SUBSIDY_RECORDS,
    JSON.stringify(ordered.map((record) => serializeSubsidyRecord(record))),
  );
}

function upsertLocalSubsidyRecord(record: SubsidyRecord) {
  const existing = readLocalSubsidyRecords().filter((item) => item.id !== record.id);
  writeLocalSubsidyRecords([record, ...existing]);
}

function removeLocalSubsidyRecord(id: string) {
  writeLocalSubsidyRecords(readLocalSubsidyRecords().filter((item) => item.id !== id));
}

function dropOtherLocalDrafts(preserveId?: string) {
  writeLocalSubsidyRecords(
    readLocalSubsidyRecords().filter(
      (item) => item.status !== 'draft' || (preserveId ? item.id === preserveId : false),
    ),
  );
}

async function clearOtherRemoteDrafts(preserveId?: string) {
  let query = supabase.from('subsidy_records').delete().eq('status', 'draft');
  if (preserveId) {
    query = query.neq('id', preserveId);
  }

  const { error } = await query;
  if (error) {
    console.error('Error clearing other subsidy drafts:', error);
  }
}

function setScheduleExplanation(
  dayOfWeek: number,
  period: number,
  explanation?: ScheduleExplanation,
) {
  const cache = readScheduleExplanationCache();
  const key = getScheduleSlotKey(dayOfWeek, period);

  if (explanation) {
    cache[key] = explanation;
  } else {
    delete cache[key];
  }

  writeScheduleExplanationCache(cache);
}

export function getAutoScheduleConfig(): AutoScheduleConfig {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.AUTO_SCHEDULE_CONFIG);
  if (!raw) {
    return DEFAULT_AUTO_SCHEDULE_CONFIG;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AutoScheduleConfig>;
    return normalizeAutoScheduleConfig(parsed);
  } catch (error) {
    console.error('Error reading auto schedule config:', error);
    return DEFAULT_AUTO_SCHEDULE_CONFIG;
  }
}

export function saveAutoScheduleConfig(config: Partial<AutoScheduleConfig>): AutoScheduleConfig {
  const normalized = normalizeAutoScheduleConfig(config);
  localStorage.setItem(LOCAL_STORAGE_KEYS.AUTO_SCHEDULE_CONFIG, JSON.stringify(normalized));
  return normalized;
}

function mergeProfiles(base?: UserProfile | null, override?: UserProfile | null): UserProfile | null {
  if (!base && !override) {
    return null;
  }

  const merged: UserProfile = {
    id: override?.id || base?.id || '',
    phone: normalizeProfileValue(override?.phone || base?.phone),
    studentId: normalizeProfileValue(override?.studentId || base?.studentId),
    department: normalizeProfileValue(override?.department || base?.department),
    major: normalizeProfileValue(override?.major || base?.major),
    studentType: normalizeProfileValue(override?.studentType || base?.studentType),
    grade: normalizeProfileValue(override?.grade || base?.grade),
    updatedAt: override?.updatedAt || base?.updatedAt,
  };

  return merged;
}

// Users
export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching users:', error);
    // Fallback to localStorage
    const local = localStorage.getItem(LOCAL_STORAGE_KEYS.USERS);
    return local ? JSON.parse(local) : [];
  }
  
  // Sync to localStorage for offline
  localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(data || []));
  return data || [];
}

export async function saveUser(name: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .insert([{ name }])
    .select()
    .single();
  
  if (error) {
    console.error('Error saving user:', error);
    throw error;
  }
  
  return data;
}
export async function deleteUser(userId: string): Promise<void> {
  // First delete related availability records
  await supabase
    .from('availability')
    .delete()
    .eq('user_id', userId);

  // Then delete related schedule records
  await supabase
    .from('schedule')
    .delete()
    .eq('user_id', userId);

  // Finally delete the user
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);
  
  if (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

// User Profiles (phone numbers)
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const localProfile = readLocalProfileCache().get(userId) || null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return localProfile;
    }
    console.error('Error fetching user profile:', error);
    return localProfile;
  }
  
  return mergeProfiles(mapDbProfile(data), localProfile);
}

export async function getAllUserProfiles(): Promise<Map<string, UserProfile>> {
  const localProfiles = readLocalProfileCache();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*');
  
  if (error) {
    console.error('Error fetching all user profiles:', error);
    return localProfiles;
  }
  
  const profileMap = new Map<string, UserProfile>(localProfiles);
  (data || []).forEach((profile) => {
    const mapped = mapDbProfile(profile);
    const merged = mergeProfiles(mapped, localProfiles.get(mapped.id));
    if (merged) {
      profileMap.set(mapped.id, merged);
    }
  });
  writeLocalProfileCache(profileMap);
  return profileMap;
}

export async function saveUserProfile(profile: UserProfile): Promise<UserProfileSaveResult> {
  const localProfiles = readLocalProfileCache();
  const normalizedProfile: UserProfile = {
    id: profile.id,
    phone: normalizeProfileValue(profile.phone),
    studentId: normalizeProfileValue(profile.studentId),
    department: normalizeProfileValue(profile.department),
    major: normalizeProfileValue(profile.major),
    studentType: normalizeProfileValue(profile.studentType),
    grade: normalizeProfileValue(profile.grade),
    updatedAt: new Date().toISOString(),
  };

  localProfiles.set(profile.id, normalizedProfile);
  writeLocalProfileCache(localProfiles);

  const schemaHealth = await getSubsidyProfileSchemaHealth();
  if (!schemaHealth.healthy) {
    return {
      localCached: true,
      remoteSynced: false,
      schemaHealthy: false,
      missingColumns: schemaHealth.missingColumns,
      errorMessage: schemaHealth.errorMessage || 'subsidy_profile_schema_incomplete',
    };
  }

  const payload = toDbProfile(normalizedProfile);
  const { error } = await supabase
    .from('user_profiles')
    .upsert([payload], { onConflict: 'id' });

  if (error) {
    console.error('Error saving user profile:', error);
    return {
      localCached: true,
      remoteSynced: false,
      schemaHealthy: true,
      missingColumns: [],
      errorMessage: toErrorMessage(error),
    };
  }

  return {
    localCached: true,
    remoteSynced: true,
    schemaHealthy: true,
    missingColumns: [],
  };
}


// Current User (local only - device specific)
export function getCurrentUser(): User | null {
  const data = localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT_USER);
  return data ? JSON.parse(data) : null;
}

export function setCurrentUser(user: User | null): void {
  if (user) {
    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(LOCAL_STORAGE_KEYS.CURRENT_USER);
  }
}

// Availability
export async function getAvailability(): Promise<Availability[]> {
  const { data, error } = await supabase
    .from('availability')
    .select('*');
  
  if (error) {
    console.error('Error fetching availability:', error);
    const local = localStorage.getItem(LOCAL_STORAGE_KEYS.AVAILABILITY);
    return local ? JSON.parse(local) : [];
  }
  
  // Transform to match our type
  const transformed = (data || []).map(item => ({
    userId: item.user_id,
    dayOfWeek: item.day_of_week,
    period: item.period,
    isAvailable: true,
  }));
  
  localStorage.setItem(LOCAL_STORAGE_KEYS.AVAILABILITY, JSON.stringify(transformed));
  return transformed;
}

export async function getUserAvailability(userId: string): Promise<Availability[]> {
  const all = await getAvailability();
  return all.filter(a => a.userId === userId);
}

export async function toggleAvailability(userId: string, dayOfWeek: number, period: number): Promise<void> {
  // Check if exists
  const { data: existing } = await supabase
    .from('availability')
    .select('*')
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek)
    .eq('period', period)
    .single();
  
  if (existing) {
    // Delete
    await supabase
      .from('availability')
      .delete()
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)
      .eq('period', period);
  } else {
    // Insert
    await supabase
      .from('availability')
      .insert([{ user_id: userId, day_of_week: dayOfWeek, period }]);
  }
}

export function isAvailable(userId: string, dayOfWeek: number, period: number): boolean {
  const availability = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.AVAILABILITY) || '[]');
  return availability.some(
    (a: Availability) => a.userId === userId && a.dayOfWeek === dayOfWeek && a.period === period
  );
}

// Schedule
export async function getSchedule(): Promise<Schedule[]> {
  const explanationCache = readScheduleExplanationCache();
  const { data, error } = await supabase
    .from('schedule')
    .select('*');
  
  if (error) {
    console.error('Error fetching schedule:', error);
    const local = localStorage.getItem(LOCAL_STORAGE_KEYS.SCHEDULE);
    const localSchedule = local ? (JSON.parse(local) as Schedule[]) : [];
    return localSchedule.map((item) => ({
      ...item,
      explanation: explanationCache[getScheduleSlotKey(item.dayOfWeek, item.period)],
    }));
  }
  
  const transformed = (data || []).map(item => ({
    userId: item.user_id,
    dayOfWeek: item.day_of_week,
    period: item.period,
    assigned: true,
    explanation: explanationCache[getScheduleSlotKey(item.day_of_week, item.period)],
  }));
  
  localStorage.setItem(LOCAL_STORAGE_KEYS.SCHEDULE, JSON.stringify(transformed));
  return transformed;
}

export async function getScheduleForSlot(dayOfWeek: number, period: number): Promise<Schedule | undefined> {
  const schedule = await getSchedule();
  return schedule.find(s => s.dayOfWeek === dayOfWeek && s.period === period);
}

export async function assignSchedule(userId: string, dayOfWeek: number, period: number): Promise<void> {
  await assignScheduleWithExplanation(userId, dayOfWeek, period);
}

export async function assignScheduleWithExplanation(
  userId: string,
  dayOfWeek: number,
  period: number,
  explanation?: ScheduleExplanation,
): Promise<void> {
  // Delete existing assignment for this slot
  await supabase
    .from('schedule')
    .delete()
    .eq('day_of_week', dayOfWeek)
    .eq('period', period);
  
  // Insert new assignment
  const { error } = await supabase
    .from('schedule')
    .insert([{ user_id: userId, day_of_week: dayOfWeek, period }]);
  
  if (error) {
    console.error('Error assigning schedule:', error);
    throw error;
  }

  setScheduleExplanation(dayOfWeek, period, explanation);
}

export async function unassignSchedule(dayOfWeek: number, period: number): Promise<void> {
  const { error } = await supabase
    .from('schedule')
    .delete()
    .eq('day_of_week', dayOfWeek)
    .eq('period', period);

  if (error) {
    console.error('Error unassigning schedule:', error);
    throw error;
  }

  setScheduleExplanation(dayOfWeek, period, undefined);
}

export async function clearSchedule(): Promise<void> {
  const { error } = await supabase
    .from('schedule')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  
  if (error) {
    console.error('Error clearing schedule:', error);
    throw error;
  }

  writeScheduleExplanationCache({});
}

// Auto Schedule
export async function autoSchedule(configOverride?: Partial<AutoScheduleConfig>): Promise<Schedule[]> {
  const users = await getUsers();
  const availability = await getAvailability();
  const config = configOverride ? saveAutoScheduleConfig(configOverride) : getAutoScheduleConfig();
  
  // Clear existing schedule
  await clearSchedule();

  const newSchedule = buildExplainableAutoSchedule(users, availability, config);

  for (const item of newSchedule) {
    await assignScheduleWithExplanation(
      item.userId,
      item.dayOfWeek,
      item.period,
      item.explanation,
    );
  }

  return newSchedule;
}

export async function refreshScheduleExplanations(): Promise<Schedule[]> {
  const [users, availability, schedule] = await Promise.all([
    getUsers(),
    getAvailability(),
    getSchedule(),
  ]);
  const refreshed = rebuildScheduleExplanations(
    users,
    availability,
    schedule,
    getAutoScheduleConfig(),
  );
  const explanationCache = Object.fromEntries(
    refreshed
      .filter((item) => item.explanation)
      .map((item) => [getScheduleSlotKey(item.dayOfWeek, item.period), item.explanation!]),
  );

  writeScheduleExplanationCache(explanationCache);
  return refreshed;
}

// Leave Requests
export interface LeaveRequest {
  id: string;
  user_id: string;
  day_of_week: number;
  period: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export async function getLeaveRequests(): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching leave requests:', error);
    return [];
  }
  return data || [];
}

export async function submitLeaveRequest(
  userId: string,
  dayOfWeek: number,
  period: number,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('leave_requests')
    .insert([{ 
      user_id: userId, 
      day_of_week: dayOfWeek, 
      period, 
      reason,
      status: 'pending' 
    }]);
  
  if (error) {
    console.error('Error submitting leave request:', error);
    throw error;
  }
}

export async function updateLeaveRequestStatus(
  id: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  const { error } = await supabase
    .from('leave_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  
  if (error) {
    console.error('Error updating leave request:', error);
    throw error;
  }
}

// Schedule History
export interface ScheduleHistory {
  id: string;
  schedule_data: Schedule[];
  generated_at: string;
  note: string;
  generationMode: ScheduleHistoryGenerationMode;
  createdBy: string;
}

export async function getScheduleHistory(): Promise<ScheduleHistory[]> {
  const localHistory = readLocalScheduleHistory();
  const { data, error } = await supabase
    .from('schedule_history')
    .select('*')
    .order('generated_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching schedule history:', error);
    return localHistory;
  }

  const normalized = (data || []).map((item) =>
    normalizeScheduleHistoryEntry({
      id: item.id as string | undefined,
      schedule_data: item.schedule_data as unknown,
      generated_at: item.generated_at as string | undefined,
      note: item.note as string | undefined,
    }),
  );

  writeLocalScheduleHistory(normalized);
  return normalized;
}

export async function saveScheduleToHistory(options?: {
  note?: string;
  generationMode?: ScheduleHistoryGenerationMode;
  createdBy?: string;
  scheduleData?: Schedule[];
}): Promise<void> {
  const schedule = options?.scheduleData || (await getSchedule());
  const note = options?.note || '';
  const generationMode = options?.generationMode || 'auto';
  const createdBy = options?.createdBy || 'Admin';
  const serializedNote = serializeScheduleHistoryNote(note, generationMode, createdBy);
  const localEntry = normalizeScheduleHistoryEntry({
    id: createScheduleHistoryId(),
    schedule_data: schedule,
    generated_at: new Date().toISOString(),
    note: serializedNote,
  });

  upsertLocalScheduleHistory(localEntry);

  const { data, error } = await supabase
    .from('schedule_history')
    .insert([{ 
      schedule_data: schedule,
      note: serializedNote,
    }])
    .select()
    .single();
  
  if (error) {
    console.error('Error saving schedule to history:', error);
    return;
  }

  upsertLocalScheduleHistory(
    normalizeScheduleHistoryEntry({
      id: data.id as string | undefined,
      schedule_data: data.schedule_data as unknown,
      generated_at: data.generated_at as string | undefined,
      note: data.note as string | undefined,
    }),
  );
}

export async function deleteScheduleHistory(id: string): Promise<void> {
  const { error } = await supabase
    .from('schedule_history')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting schedule history:', error);
    throw error;
  }
}

interface SubsidyDraftInput {
  id?: string | null;
  sourceType: SubsidyRecordSourceType;
  recordMonth: string;
  monthStart: string;
  monthEnd: string;
  preparerName: string;
  preparerPhone: string;
  preparedDate: string;
  rows: EditableSubsidyRow[];
  overLimitNotes: Record<string, string>;
  totalHours: number;
  totalAmount: number;
}

function createSubsidyRecordId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `subsidy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSubsidyRecord(
  input: SubsidyDraftInput,
  status: SubsidyRecordStatus,
  exportedAt?: string,
): SubsidyRecord {
  const now = new Date().toISOString();
  return {
    id: input.id || createSubsidyRecordId(),
    status,
    sourceType: input.sourceType,
    recordMonth: input.recordMonth,
    monthStart: input.monthStart,
    monthEnd: input.monthEnd,
    preparerName: input.preparerName.trim(),
    preparerPhone: input.preparerPhone.trim(),
    preparedDate: input.preparedDate,
    rows: restoreEditableSubsidyRows(input.rows),
    overLimitNotes: normalizeSubsidyNoteMap(input.overLimitNotes),
    totalHours: Number(input.totalHours.toFixed(1)),
    totalAmount: Number(input.totalAmount.toFixed(2)),
    exportedAt,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeSubsidyRecordTimestamps(
  base: SubsidyRecord,
  existing?: SubsidyRecord | null,
): SubsidyRecord {
  return {
    ...base,
    createdAt: existing?.createdAt || base.createdAt,
    updatedAt: new Date().toISOString(),
    exportedAt: base.status === 'exported' ? base.exportedAt || new Date().toISOString() : undefined,
  };
}

function mapDbSubsidyRecord(record: SubsidyRecord) {
  return {
    id: record.id,
    status: record.status,
    source_type: record.sourceType,
    record_month: record.recordMonth,
    month_start: record.monthStart,
    month_end: record.monthEnd,
    preparer_name: record.preparerName,
    preparer_phone: record.preparerPhone,
    prepared_date: record.preparedDate,
    rows_json: restoreEditableSubsidyRows(record.rows),
    over_limit_notes_json: normalizeSubsidyNoteMap(record.overLimitNotes),
    total_hours: record.totalHours,
    total_amount: record.totalAmount,
    exported_at: record.exportedAt || null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export async function getActiveSubsidyDraft(): Promise<SubsidyRecord | null> {
  const localDraft = readLocalSubsidyRecords()
    .filter((item) => item.status === 'draft')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] || null;

  const { data, error } = await supabase
    .from('subsidy_records')
    .select('*')
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching active subsidy draft:', error);
    return localDraft;
  }

  if (!data) {
    return localDraft;
  }

  const record = normalizeSubsidyRecordEntry(data as Record<string, unknown>);
  upsertLocalSubsidyRecord(record);
  dropOtherLocalDrafts(record.id);
  return record;
}

export async function saveSubsidyDraft(input: SubsidyDraftInput): Promise<SubsidyRecord> {
  const existing = input.id
    ? readLocalSubsidyRecords().find((item) => item.id === input.id) || null
    : await getActiveSubsidyDraft();
  const draft = mergeSubsidyRecordTimestamps(buildSubsidyRecord(input, 'draft'), existing);
  upsertLocalSubsidyRecord(draft);
  dropOtherLocalDrafts(draft.id);

  await clearOtherRemoteDrafts(draft.id);

  const { data, error } = await supabase
    .from('subsidy_records')
    .upsert([mapDbSubsidyRecord(draft)], { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('Error saving subsidy draft:', error);
    return draft;
  }

  const normalized = normalizeSubsidyRecordEntry(data as Record<string, unknown>);
  upsertLocalSubsidyRecord(normalized);
  dropOtherLocalDrafts(normalized.id);
  return normalized;
}

export async function exportSubsidyDraft(input: SubsidyDraftInput): Promise<SubsidyRecord> {
  const existing = input.id
    ? readLocalSubsidyRecords().find((item) => item.id === input.id) || null
    : await getActiveSubsidyDraft();
  const exportedAt = new Date().toISOString();
  const record = mergeSubsidyRecordTimestamps(
    buildSubsidyRecord(input, 'exported', exportedAt),
    existing,
  );
  upsertLocalSubsidyRecord(record);
  dropOtherLocalDrafts();

  if (record.id !== existing?.id) {
    await clearOtherRemoteDrafts();
  } else {
    await clearOtherRemoteDrafts(record.id);
  }

  const { data, error } = await supabase
    .from('subsidy_records')
    .upsert([mapDbSubsidyRecord(record)], { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('Error exporting subsidy draft:', error);
    return record;
  }

  const normalized = normalizeSubsidyRecordEntry(data as Record<string, unknown>);
  upsertLocalSubsidyRecord(normalized);
  dropOtherLocalDrafts();
  return normalized;
}

export async function getExportedSubsidyRecords(): Promise<SubsidyRecord[]> {
  const localRecords = readLocalSubsidyRecords()
    .filter((item) => item.status === 'exported')
    .sort((a, b) => new Date(b.exportedAt || b.updatedAt).getTime() - new Date(a.exportedAt || a.updatedAt).getTime());

  const { data, error } = await supabase
    .from('subsidy_records')
    .select('*')
    .eq('status', 'exported')
    .order('exported_at', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching subsidy records:', error);
    return localRecords;
  }

  const normalized = (data || []).map((item) => normalizeSubsidyRecordEntry(item as Record<string, unknown>));
  writeLocalSubsidyRecords([
    ...normalized,
    ...readLocalSubsidyRecords().filter((item) => item.status === 'draft'),
  ]);
  return normalized;
}

export async function cloneSubsidyRecordToDraft(recordId: string): Promise<SubsidyRecord> {
  const localRecord = readLocalSubsidyRecords().find((item) => item.id === recordId) || null;
  let sourceRecord = localRecord;

  if (!sourceRecord) {
    const { data, error } = await supabase
      .from('subsidy_records')
      .select('*')
      .eq('id', recordId)
      .maybeSingle();

    if (error) {
      console.error('Error loading subsidy record for cloning:', error);
      throw error;
    }

    if (!data) {
      throw new Error('补贴记录不存在');
    }

    sourceRecord = normalizeSubsidyRecordEntry(data as Record<string, unknown>);
  }

  const now = new Date().toISOString();
  const draft: SubsidyRecord = {
    ...sourceRecord,
    id: createSubsidyRecordId(),
    status: 'draft',
    sourceType: 'record_copy',
    exportedAt: undefined,
    createdAt: now,
    updatedAt: now,
    rows: restoreEditableSubsidyRows(sourceRecord.rows),
  };

  upsertLocalSubsidyRecord(draft);
  dropOtherLocalDrafts(draft.id);
  await clearOtherRemoteDrafts();

  const { data, error } = await supabase
    .from('subsidy_records')
    .insert([mapDbSubsidyRecord(draft)])
    .select()
    .single();

  if (error) {
    console.error('Error cloning subsidy record to draft:', error);
    return draft;
  }

  const normalized = normalizeSubsidyRecordEntry(data as Record<string, unknown>);
  upsertLocalSubsidyRecord(normalized);
  dropOtherLocalDrafts(normalized.id);
  return normalized;
}

export async function deleteSubsidyRecord(id: string): Promise<void> {
  removeLocalSubsidyRecord(id);

  const { error } = await supabase
    .from('subsidy_records')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting subsidy record:', error);
    throw error;
  }
}

// Realtime subscription
export function subscribeToSchedule(callback: (schedule: Schedule[]) => void) {
  return supabase
    .channel('schedule_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule' }, async () => {
      const schedule = await getSchedule();
      callback(schedule);
    })
    .subscribe();
}

export function subscribeToAvailability(callback: (availability: Availability[]) => void) {
  return supabase
    .channel('availability_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'availability' }, async () => {
      const availability = await getAvailability();
      callback(availability);
    })
    .subscribe();
}

export function subscribeToUsers(callback: (users: User[]) => void) {
  return supabase
    .channel('users_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async () => {
      const users = await getUsers();
      callback(users);
    })
    .subscribe();
}

export function subscribeToSubsidyRecords(callback: (records: SubsidyRecord[]) => void) {
  return supabase
    .channel('subsidy_records_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'subsidy_records' }, async () => {
      const records = await getExportedSubsidyRecords();
      callback(records);
    })
    .subscribe();
}
