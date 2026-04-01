import type {
  Availability,
  AvailabilityChangeSummary,
  AvailabilityDraft,
  AvailabilitySlot,
} from '../types';

export function getAvailabilitySlotKey(dayOfWeek: number, period: number): string {
  return `${dayOfWeek}-${period}`;
}

export function isValidAvailabilitySlot(slot: AvailabilitySlot): boolean {
  return Number.isInteger(slot.dayOfWeek)
    && Number.isInteger(slot.period)
    && slot.dayOfWeek >= 0
    && slot.dayOfWeek <= 4
    && slot.period >= 1
    && slot.period <= 8;
}

export function normalizeAvailabilitySlots(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  const seen = new Set<string>();

  return slots
    .filter(isValidAvailabilitySlot)
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period)
    .filter((slot) => {
      const key = getAvailabilitySlotKey(slot.dayOfWeek, slot.period);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function availabilityToSlots(availability: Availability[]): AvailabilitySlot[] {
  return normalizeAvailabilitySlots(
    availability.map((item) => ({
      dayOfWeek: item.dayOfWeek,
      period: item.period,
    })),
  );
}

export function availabilitySlotsToKeySet(slots: AvailabilitySlot[]): Set<string> {
  return new Set(
    normalizeAvailabilitySlots(slots).map((slot) => getAvailabilitySlotKey(slot.dayOfWeek, slot.period)),
  );
}

export function availabilitySetToSlots(availabilitySet: Set<string>): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];

  availabilitySet.forEach((key) => {
    const [dayText, periodText] = key.split('-');
    const dayOfWeek = Number(dayText);
    const period = Number(periodText);
    if (Number.isInteger(dayOfWeek) && Number.isInteger(period)) {
      slots.push({ dayOfWeek, period });
    }
  });

  return normalizeAvailabilitySlots(slots);
}

export function availabilitySetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const key of left) {
    if (!right.has(key)) {
      return false;
    }
  }

  return true;
}

export function diffAvailabilitySlots(
  confirmedSlots: AvailabilitySlot[],
  draftSlots: AvailabilitySlot[],
): AvailabilityChangeSummary {
  const confirmed = availabilitySlotsToKeySet(confirmedSlots);
  const draft = availabilitySlotsToKeySet(draftSlots);

  const addedSlots = availabilitySetToSlots(new Set(
    [...draft].filter((key) => !confirmed.has(key)),
  ));
  const removedSlots = availabilitySetToSlots(new Set(
    [...confirmed].filter((key) => !draft.has(key)),
  ));

  return {
    addedSlots,
    removedSlots,
    totalSelected: draft.size,
    hasChanges: addedSlots.length > 0 || removedSlots.length > 0,
  };
}

export function createAvailabilityDraft(userId: string, slots: AvailabilitySlot[]): AvailabilityDraft {
  return {
    userId,
    slots: normalizeAvailabilitySlots(slots),
    updatedAt: new Date().toISOString(),
  };
}

export function formatAvailabilitySlotLabel(
  slot: AvailabilitySlot,
  dayLabels: string[],
  periodLabels: string[],
): string {
  const dayLabel = dayLabels[slot.dayOfWeek] || `Day ${slot.dayOfWeek + 1}`;
  const periodLabel = periodLabels[slot.period - 1] || `Period ${slot.period}`;
  return `${dayLabel} ${periodLabel}`;
}
