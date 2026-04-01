import { describe, expect, it } from 'vitest';
import {
  inferScheduleHistoryGenerationMode,
  resolveScheduleHistoryGenerationMode,
} from '../src/lib/scheduleHistory';
import { createManualScheduleExplanation } from '../src/lib/autoSchedule';
import type { Schedule, User } from '../src/types';

function createUser(id: string, name: string): User {
  return {
    id,
    name,
    createdAt: '2026-03-26T00:00:00.000Z',
  };
}

describe('schedule history mode helpers', () => {
  it('treats schedules with manual explanations as manual snapshots', () => {
    const user = createUser('user-1', 'Alice');
    const schedule: Schedule[] = [
      {
        userId: user.id,
        dayOfWeek: 0,
        period: 4,
        assigned: true,
        explanation: createManualScheduleExplanation(user),
      },
    ];

    expect(inferScheduleHistoryGenerationMode(schedule)).toBe('manual');
  });

  it('falls back to auto when no manual explanation exists', () => {
    const schedule: Schedule[] = [
      {
        userId: 'user-1',
        dayOfWeek: 0,
        period: 4,
        assigned: true,
        explanation: {
          source: 'auto',
          assignedUserId: 'user-1',
          assignedUserName: 'Alice',
          config: {
            weeklySoftLimitHours: 4,
            closeHoursThreshold: 1,
          },
          badges: ['single_candidate'],
          ruleHits: ['single_candidate'],
          candidates: [],
          rejectionReasons: [],
        },
      },
    ];

    expect(inferScheduleHistoryGenerationMode(schedule)).toBe('auto');
  });

  it('prefers persisted draft mode for manual unassign flows', () => {
    const schedule: Schedule[] = [];

    expect(resolveScheduleHistoryGenerationMode(schedule, 'manual')).toBe('manual');
    expect(resolveScheduleHistoryGenerationMode(schedule, 'auto')).toBe('auto');
  });
});
