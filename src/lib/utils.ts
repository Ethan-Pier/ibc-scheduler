import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Schedule, User } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function exportToCSV(data: string[][]): string {
  return data.map(row => 
    row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

export interface ConflictWarning {
  day: number;
  periods: number[];
  userName: string;
}

export function detectConflicts(
  schedule: Schedule[],
  users: User[]
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  
  // Group by user + day
  const userDayMap = new Map<string, number[]>();
  
  schedule.forEach(item => {
    const key = `${item.userId}-${item.dayOfWeek}`;
    const existing = userDayMap.get(key) || [];
    existing.push(item.period);
    userDayMap.set(key, existing);
  });
  
  // Detect conflicts (more than 1 period per day)
  userDayMap.forEach((periods, key) => {
    if (periods.length > 1) {
      const [userId, dayStr] = key.split('-');
      const day = parseInt(dayStr);
      const user = users.find(u => u.id === userId);
      warnings.push({
        day,
        periods: periods.sort((a, b) => a - b),
        userName: user?.name || 'Unknown',
      });
    }
  });
  
  return warnings;
}

export interface HoursStats {
  userId: string;
  name: string;
  hours: number;
}

export function calculateHoursPerUser(
  schedule: Schedule[],
  users: User[]
): HoursStats[] {
  const hoursMap = new Map<string, number>();
  
  schedule.forEach(item => {
    const current = hoursMap.get(item.userId) || 0;
    hoursMap.set(item.userId, current + 1);
  });
  
  return users.map(user => ({
    userId: user.id,
    name: user.name,
    hours: hoursMap.get(user.id) || 0,
  })).sort((a, b) => b.hours - a.hours);
}

export interface UpcomingShift {
  userName: string;
  day: number;
  dayName: string;
  period: number;
  timeUntil: string;
}

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

export function getUpcomingShifts(
  schedule: Schedule[],
  users: User[],
  hoursAhead: number = 24
): UpcomingShift[] {
  const now = new Date();
  const upcoming: UpcomingShift[] = [];
  
  schedule.forEach(item => {
    const nextShiftDate = getNextShiftDate(item.dayOfWeek, item.period);
    const hoursUntil = (nextShiftDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntil > 0 && hoursUntil <= hoursAhead) {
      const user = users.find(u => u.id === item.userId);
      upcoming.push({
        userName: user?.name || 'Unknown',
        day: item.dayOfWeek,
        dayName: DAYS[item.dayOfWeek] || 'Unknown',
        period: item.period,
        timeUntil: formatTimeUntil(hoursUntil),
      });
    }
  });
  
  return upcoming.sort((a, b) => {
    const dateA = getNextShiftDate(a.day, a.period);
    const dateB = getNextShiftDate(b.day, b.period);
    return dateA.getTime() - dateB.getTime();
  });
}

function getNextShiftDate(dayOfWeek: number, period: number): Date {
  const now = new Date();
  const result = new Date(now);
  
  // Adjust for Monday = 0 in our system, Sunday = 0 in Date
  const currentDay = now.getDay();
  const adjustedCurrent = currentDay === 0 ? 7 : currentDay; // Convert Sunday=0 to Sunday=7
  const daysUntil = (dayOfWeek - adjustedCurrent + 7) % 7 || 7;
  
  result.setDate(now.getDate() + daysUntil);
  result.setHours(8 + period, 0, 0, 0);
  
  return result;
}

function formatTimeUntil(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}

// Enhanced CSV Export with statistics
export function exportScheduleToCSV(
  schedule: Schedule[],
  users: User[],
  filename: string = 'schedule.csv'
) {
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.name || '未知';
  };

  const days = ['周一', '周二', '周三', '周四', '周五'];
  const periods = [
    { num: 1, label: '第一節', time: '08:00-09:00' },
    { num: 2, label: '第二節', time: '09:00-10:00' },
    { num: 3, label: '第三節', time: '10:00-11:00' },
    { num: 4, label: '第四節', time: '11:00-12:00' },
    { num: 5, label: '第五節', time: '13:00-14:00' },
    { num: 6, label: '第六節', time: '14:00-15:00' },
    { num: 7, label: '第七節', time: '15:00-16:00' },
    { num: 8, label: '第八節', time: '16:00-17:00' },
  ];

  // Build CSV content
  const header = ['時段', ...days, '備註'];
  const rows: string[][] = [header];

  periods.forEach((period) => {
    const row: string[] = [`${period.label} (${period.time})`];
    
    [0, 1, 2, 3, 4].forEach(day => {
      const assignment = schedule.find(
        s => s.dayOfWeek === day && s.period === period.num
      );
      row.push(assignment ? getUserName(assignment.userId) : '-');
    });
    
    row.push('');
    rows.push(row);
  });

  // Add statistics at the bottom
  rows.push([]);
  rows.push(['=== 統計 ===']);
  rows.push(['姓名', '值班時段數']);
  
  const hoursMap = new Map<string, number>();
  schedule.forEach(item => {
    const current = hoursMap.get(item.userId) || 0;
    hoursMap.set(item.userId, current + 1);
  });
  
  users.forEach(user => {
    const hours = hoursMap.get(user.id) || 0;
    if (hours > 0) {
      rows.push([user.name, hours.toString()]);
    }
  });

  const csvContent = rows.map(row => 
    row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  // Download
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
