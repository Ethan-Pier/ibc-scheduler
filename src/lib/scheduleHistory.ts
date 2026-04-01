import type { Schedule } from '../types';

export type ScheduleHistoryGenerationMode = 'auto' | 'manual';

export function inferScheduleHistoryGenerationMode(
  schedule: Schedule[],
): ScheduleHistoryGenerationMode {
  return schedule.some((item) => item.explanation?.source === 'manual') ? 'manual' : 'auto';
}

export function resolveScheduleHistoryGenerationMode(
  schedule: Schedule[],
  draftMode?: ScheduleHistoryGenerationMode | null,
): ScheduleHistoryGenerationMode {
  if (draftMode === 'manual' || draftMode === 'auto') {
    return draftMode;
  }

  return inferScheduleHistoryGenerationMode(schedule);
}
