export interface User {
  id: string;
  name: string;
  createdAt: string;
}

export interface Availability {
  userId: string;
  dayOfWeek: number; // 0 = Monday, 6 = Sunday
  period: number; // 1-8
  isAvailable: boolean;
}

export interface Schedule {
  userId: string;
  dayOfWeek: number;
  period: number;
  assigned: boolean;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4;
export type Period = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const DAYS = ['周一', '周二', '周三', '周四', '周五'] as const;
export const PERIODS = [
  { num: 1, label: '第一節', time: '08:00-09:00' },
  { num: 2, label: '第二節', time: '09:00-10:00' },
  { num: 3, label: '第三節', time: '10:00-11:00' },
  { num: 4, label: '第四節', time: '11:00-12:00' },
  { num: 5, label: '第五節', time: '13:00-14:00' },
  { num: 6, label: '第六節', time: '14:00-15:00' },
  { num: 7, label: '第七節', time: '15:00-16:00' },
  { num: 8, label: '第八節', time: '16:00-17:00' },
] as const;

export type ViewMode = 'home' | 'schedule' | 'admin';
