import { describe, expect, it } from 'vitest';
import {
  availabilitySetToSlots,
  availabilitySetsEqual,
  availabilitySlotsToKeySet,
  createAvailabilityDraft,
  diffAvailabilitySlots,
  formatAvailabilitySlotLabel,
  normalizeAvailabilitySlots,
} from '../src/lib/availability';

describe('availability draft helpers', () => {
  it('normalizes slot lists by sorting, filtering invalid values, and removing duplicates', () => {
    expect(
      normalizeAvailabilitySlots([
        { dayOfWeek: 4, period: 8 },
        { dayOfWeek: 0, period: 4 },
        { dayOfWeek: 0, period: 4 },
        { dayOfWeek: 6, period: 2 },
      ]),
    ).toEqual([
      { dayOfWeek: 0, period: 4 },
      { dayOfWeek: 4, period: 8 },
    ]);
  });

  it('computes added and removed slots relative to the confirmed baseline', () => {
    const summary = diffAvailabilitySlots(
      [
        { dayOfWeek: 0, period: 4 },
        { dayOfWeek: 2, period: 7 },
      ],
      [
        { dayOfWeek: 2, period: 7 },
        { dayOfWeek: 4, period: 8 },
      ],
    );

    expect(summary.addedSlots).toEqual([{ dayOfWeek: 4, period: 8 }]);
    expect(summary.removedSlots).toEqual([{ dayOfWeek: 0, period: 4 }]);
    expect(summary.totalSelected).toBe(2);
    expect(summary.hasChanges).toBe(true);
  });

  it('round-trips between slot arrays and key sets', () => {
    const set = availabilitySlotsToKeySet([
      { dayOfWeek: 1, period: 3 },
      { dayOfWeek: 3, period: 5 },
    ]);

    expect(availabilitySetToSlots(set)).toEqual([
      { dayOfWeek: 1, period: 3 },
      { dayOfWeek: 3, period: 5 },
    ]);
    expect(availabilitySetsEqual(set, new Set(['1-3', '3-5']))).toBe(true);
  });

  it('creates drafts with normalized slots and a timestamp', () => {
    const draft = createAvailabilityDraft('user-1', [
      { dayOfWeek: 3, period: 5 },
      { dayOfWeek: 1, period: 2 },
    ]);

    expect(draft.userId).toBe('user-1');
    expect(draft.slots).toEqual([
      { dayOfWeek: 1, period: 2 },
      { dayOfWeek: 3, period: 5 },
    ]);
    expect(draft.updatedAt).toMatch(/T/);
  });

  it('formats slot labels using supplied localized labels', () => {
    expect(
      formatAvailabilitySlotLabel(
        { dayOfWeek: 4, period: 8 },
        ['周一', '周二', '周三', '周四', '周五'],
        ['第1节', '第2节', '第3节', '第4节', '第5节', '第6节', '第7节', '第8节'],
      ),
    ).toBe('周五 第8节');
  });
});
