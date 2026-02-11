import { createClient } from '@supabase/supabase-js';
import type { User, Availability, Schedule } from '../types';

// ⚠️ 配置你的 Supabase 項目
// 1. 在 Supabase 創建項目
// 2. 執行 setup.sql 初始化數據庫
// 3. 在 Project Settings > API 中獲取以下信息

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-url.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

// 檢查配置
if (SUPABASE_URL.includes('your-project') || SUPABASE_KEY.includes('your-key')) {
  console.warn('⚠️ 請配置 Supabase：編輯 src/lib/storage.ts 或設置環境變量');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Local cache for offline support
const LOCAL_STORAGE_KEYS = {
  USERS: 'ibc-users',
  AVAILABILITY: 'ibc-availability',
  SCHEDULE: 'ibc-schedule',
  CURRENT_USER: 'ibc-current-user',
};

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
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);
  
  if (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
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
  const { data, error } = await supabase
    .from('schedule')
    .select('*');
  
  if (error) {
    console.error('Error fetching schedule:', error);
    const local = localStorage.getItem(LOCAL_STORAGE_KEYS.SCHEDULE);
    return local ? JSON.parse(local) : [];
  }
  
  const transformed = (data || []).map(item => ({
    userId: item.user_id,
    dayOfWeek: item.day_of_week,
    period: item.period,
    assigned: true,
  }));
  
  localStorage.setItem(LOCAL_STORAGE_KEYS.SCHEDULE, JSON.stringify(transformed));
  return transformed;
}

export async function getScheduleForSlot(dayOfWeek: number, period: number): Promise<Schedule | undefined> {
  const schedule = await getSchedule();
  return schedule.find(s => s.dayOfWeek === dayOfWeek && s.period === period);
}

export async function assignSchedule(userId: string, dayOfWeek: number, period: number): Promise<void> {
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
}

// Auto Schedule
export async function autoSchedule(): Promise<Schedule[]> {
  const users = await getUsers();
  const availability = await getAvailability();
  
  // Clear existing schedule
  await clearSchedule();
  
  const newSchedule: Schedule[] = [];
  
  for (let day = 0; day < 5; day++) {
    for (let period = 1; period <= 8; period++) {
      const availableUsers = users.filter(user =>
        availability.some(a => 
          a.userId === user.id && 
          a.dayOfWeek === day && 
          a.period === period
        )
      );
      
      if (availableUsers.length > 0) {
        // Pick user with least assignments
        const userAssignmentCount = new Map<string, number>();
        availableUsers.forEach(user => {
          userAssignmentCount.set(user.id, newSchedule.filter(s => s.userId === user.id).length);
        });
        
        const selectedUser = availableUsers.sort((a, b) => 
          (userAssignmentCount.get(a.id) || 0) - (userAssignmentCount.get(b.id) || 0)
        )[0];
        
        await assignSchedule(selectedUser.id, day, period);
        
        newSchedule.push({
          userId: selectedUser.id,
          dayOfWeek: day,
          period,
          assigned: true,
        });
      }
    }
  }
  
  return newSchedule;
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
