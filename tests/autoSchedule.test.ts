import { describe, expect, it } from 'vitest';
import {
  buildExplainableAutoSchedule,
  createManualScheduleExplanation,
  rebuildScheduleExplanations,
} from '../src/lib/autoSchedule';
import type { Availability, AutoScheduleConfig, Schedule, User } from '../src/types';

function createUsers(names: string[]): User[] {
  return names.map((name, index) => ({
    id: `user-${index + 1}`,
    name,
    createdAt: '2026-03-12T00:00:00.000Z',
  }));
}

function createAvailability(userId: string, dayOfWeek: number, period: number): Availability {
  return {
    userId,
    dayOfWeek,
    period,
    isAvailable: true,
  };
}

function findSchedule(
  schedule: Schedule[],
  dayOfWeek: number,
  period: number,
): Schedule | undefined {
  return schedule.find((item) => item.dayOfWeek === dayOfWeek && item.period === period);
}

describe('buildExplainableAutoSchedule', () => {
  it('locks a slot immediately when only one candidate is available', () => {
    const [alice, bob] = createUsers(['Alice', 'Bob']);
    const availability = [createAvailability(alice.id, 0, 1)];

    const schedule = buildExplainableAutoSchedule([alice, bob], availability);
    const slot = findSchedule(schedule, 0, 1);

    expect(slot?.userId).toBe(alice.id);
    expect(slot?.explanation?.ruleHits).toEqual(['single_candidate']);
    expect(slot?.explanation?.badges).toContain('single_candidate');
  });

  it('prefers the candidate with fewer weekly hours when multiple people are available', () => {
    const [alice, bob] = createUsers(['Alice', 'Bob']);
    const availability = [
      createAvailability(alice.id, 0, 1),
      createAvailability(alice.id, 0, 2),
      createAvailability(alice.id, 0, 3),
      createAvailability(bob.id, 0, 2),
    ];

    const schedule = buildExplainableAutoSchedule([alice, bob], availability);
    const slot = findSchedule(schedule, 0, 2);

    expect(slot?.userId).toBe(bob.id);
    expect(slot?.explanation?.ruleHits).toContain('hours_priority');
    expect(slot?.explanation?.rejectionReasons).toEqual([
      {
        userId: alice.id,
        userName: alice.name,
        reasonCodes: ['higher_weekly_hours'],
      },
    ]);
  });

  it('prefers continuity when hours are within the configured close-hours threshold', () => {
    const [alice, bob] = createUsers(['Alice', 'Bob']);
    const availability = [
      createAvailability(alice.id, 0, 1),
      createAvailability(alice.id, 0, 2),
      createAvailability(bob.id, 0, 2),
      createAvailability(alice.id, 0, 3),
      createAvailability(bob.id, 1, 1),
    ];

    const schedule = buildExplainableAutoSchedule([alice, bob], availability);
    const slot = findSchedule(schedule, 0, 2);

    expect(slot?.userId).toBe(alice.id);
    expect(slot?.explanation?.ruleHits).toContain('continuity_priority');
    expect(slot?.explanation?.rejectionReasons).toEqual([
      {
        userId: bob.id,
        userName: bob.name,
        reasonCodes: ['lower_continuity_close_hours'],
      },
    ]);
  });

  it('honors configurable thresholds for continuity comparison and soft-limit warnings', () => {
    const [alice, bob] = createUsers(['Alice', 'Bob']);
    const availability = [
      createAvailability(alice.id, 0, 1),
      createAvailability(alice.id, 0, 2),
      createAvailability(bob.id, 0, 2),
      createAvailability(alice.id, 0, 3),
      createAvailability(bob.id, 1, 1),
    ];
    const config: AutoScheduleConfig = {
      weeklySoftLimitHours: 1,
      closeHoursThreshold: 0,
    };

    const schedule = buildExplainableAutoSchedule([alice, bob], availability, config);
    const continuitySlot = findSchedule(schedule, 0, 2);
    const warningSlot = findSchedule(schedule, 0, 3);

    expect(continuitySlot?.userId).toBe(bob.id);
    expect(continuitySlot?.explanation?.config).toEqual(config);
    expect(warningSlot?.explanation?.noteCode).toBe('soft_limit_warning');
    expect(warningSlot?.explanation?.badges).toContain('soft_limit_warning');
  });

  it('uses a stable tiebreak rule when hours and continuity are identical', () => {
    const [alice, bob] = createUsers(['Alice', 'Bob']);
    const availability = [
      createAvailability(alice.id, 0, 1),
      createAvailability(bob.id, 0, 1),
    ];

    const schedule = buildExplainableAutoSchedule([alice, bob], availability);
    const slot = findSchedule(schedule, 0, 1);

    expect(slot?.userId).toBe(alice.id);
    expect(slot?.explanation?.ruleHits).toEqual(['stable_tiebreak']);
    expect(slot?.explanation?.rejectionReasons).toEqual([
      {
        userId: bob.id,
        userName: bob.name,
        reasonCodes: ['stable_tiebreak'],
      },
    ]);
  });
});

describe('rebuildScheduleExplanations', () => {
  it('keeps manual assignments while refreshing later auto explanations', () => {
    const [alice, bob] = createUsers(['Alice', 'Bob']);
    const availability = [
      createAvailability(alice.id, 0, 1),
      createAvailability(alice.id, 0, 2),
      createAvailability(bob.id, 0, 2),
      createAvailability(alice.id, 0, 3),
      createAvailability(bob.id, 0, 3),
    ];
    const schedule = buildExplainableAutoSchedule([alice, bob], availability).map((item) => {
      if (item.dayOfWeek === 0 && item.period === 2) {
        return {
          ...item,
          userId: bob.id,
          explanation: createManualScheduleExplanation(bob),
        };
      }

      return item;
    });

    const rebuilt = rebuildScheduleExplanations([alice, bob], availability, schedule);
    const manualSlot = findSchedule(rebuilt, 0, 2);
    const laterSlot = findSchedule(rebuilt, 0, 3);
    const bobCandidate = laterSlot?.explanation?.candidates.find((candidate) => candidate.userId === bob.id);

    expect(manualSlot?.explanation?.source).toBe('manual');
    expect(manualSlot?.explanation?.ruleHits).toEqual(['manual_assignment']);
    expect(bobCandidate?.hoursBefore).toBe(1);
    expect(bobCandidate?.continuityWithPrevious).toBe(true);
  });

  it('drops continuity when the middle slot is unassigned', () => {
    const [alice] = createUsers(['Alice']);
    const availability = [
      createAvailability(alice.id, 0, 1),
      createAvailability(alice.id, 0, 2),
      createAvailability(alice.id, 0, 3),
    ];
    const schedule: Schedule[] = [
      {
        userId: alice.id,
        dayOfWeek: 0,
        period: 1,
        assigned: true,
      },
      {
        userId: alice.id,
        dayOfWeek: 0,
        period: 3,
        assigned: true,
      },
    ];

    const rebuilt = rebuildScheduleExplanations([alice], availability, schedule);
    const laterSlot = findSchedule(rebuilt, 0, 3);
    const aliceCandidate = laterSlot?.explanation?.candidates.find((candidate) => candidate.userId === alice.id);

    expect(aliceCandidate?.hoursBefore).toBe(1);
    expect(aliceCandidate?.continuityWithPrevious).toBe(false);
  });
});
