export interface User {
  id: string;
  name: string;
  createdAt: string;
  phone?: string; // from user_profiles table
}

export interface UserProfile {
  id: string;
  phone?: string;
  studentId?: string;
  department?: string;
  major?: string;
  studentType?: string;
  grade?: string;
  updatedAt?: string;
}

export interface Availability {
  userId: string;
  dayOfWeek: number; // 0 = Monday, 6 = Sunday
  period: number; // 1-8
  isAvailable: boolean;
}

export interface AvailabilitySlot {
  dayOfWeek: number;
  period: number;
}

export interface AvailabilityDraft {
  userId: string;
  slots: AvailabilitySlot[];
  updatedAt: string;
}

export interface AvailabilityChangeSummary {
  addedSlots: AvailabilitySlot[];
  removedSlots: AvailabilitySlot[];
  totalSelected: number;
  hasChanges: boolean;
}

export interface ConfirmAvailabilitySubmissionResult {
  success: boolean;
  savedSlots: AvailabilitySlot[];
  changeSummary: AvailabilityChangeSummary;
  submittedAt: string;
}

export interface AutoScheduleConfig {
  weeklySoftLimitHours: number;
  closeHoursThreshold: number;
}

export type ScheduleExplanationRuleCode =
  | 'single_candidate'
  | 'hours_priority'
  | 'continuity_priority'
  | 'stable_tiebreak'
  | 'manual_assignment';

export type ScheduleExplanationBadgeCode = ScheduleExplanationRuleCode | 'soft_limit_warning';

export type ScheduleExplanationReasonCode =
  | 'soft_limit_reached'
  | 'higher_weekly_hours'
  | 'lower_continuity_same_hours'
  | 'lower_continuity_close_hours'
  | 'stable_tiebreak';

export type ScheduleExplanationNoteCode = 'soft_limit_warning' | 'manual_override';

export interface ScheduleCandidateExplanation {
  userId: string;
  userName: string;
  hoursBefore: number;
  hoursAfter: number;
  continuityScore: number;
  continuityWithPrevious: boolean;
  continuityWithNext: boolean;
  withinSoftLimit: boolean;
  selected: boolean;
  rejectionReasonCodes: ScheduleExplanationReasonCode[];
}

export interface ScheduleRejectionExplanation {
  userId: string;
  userName: string;
  reasonCodes: ScheduleExplanationReasonCode[];
}

export interface ScheduleExplanation {
  source: 'auto' | 'manual';
  assignedUserId: string;
  assignedUserName: string;
  config: AutoScheduleConfig;
  badges: ScheduleExplanationBadgeCode[];
  ruleHits: ScheduleExplanationRuleCode[];
  noteCode?: ScheduleExplanationNoteCode;
  candidates: ScheduleCandidateExplanation[];
  rejectionReasons: ScheduleRejectionExplanation[];
}

export interface Schedule {
  userId: string;
  dayOfWeek: number;
  period: number;
  assigned: boolean;
  explanation?: ScheduleExplanation;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4;
export type Period = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const DAYS = ['周一', '周二', '周三', '周四', '周五'] as const;
export const PERIODS = [
  { num: 1, label: '第1节', time: '08:00-09:00' },
  { num: 2, label: '第2节', time: '09:00-10:00' },
  { num: 3, label: '第3节', time: '10:00-11:00' },
  { num: 4, label: '第4节', time: '11:00-12:00' },
  { num: 5, label: '第5节', time: '13:00-14:00' },
  { num: 6, label: '第6节', time: '14:00-15:00' },
  { num: 7, label: '第7节', time: '15:00-16:00' },
  { num: 8, label: '第8节', time: '16:00-17:00' },
] as const;

export type ViewMode = 'home' | 'schedule' | 'admin';
