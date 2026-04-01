import type {
  AutoScheduleConfig,
  Availability,
  Schedule,
  ScheduleCandidateExplanation,
  ScheduleExplanation,
  ScheduleExplanationBadgeCode,
  ScheduleExplanationReasonCode,
  ScheduleExplanationRuleCode,
  User,
} from '../types';

export const DEFAULT_AUTO_SCHEDULE_CONFIG: AutoScheduleConfig = {
  weeklySoftLimitHours: 8,
  closeHoursThreshold: 1,
};

interface Slot {
  dayOfWeek: number;
  period: number;
  key: string;
}

interface EvaluatedCandidate {
  user: User;
  hoursBefore: number;
  hoursAfter: number;
  continuityScore: number;
  continuityWithPrevious: boolean;
  continuityWithNext: boolean;
  withinSoftLimit: boolean;
}

interface CandidateSelection {
  selected: EvaluatedCandidate;
  ruleHits: ScheduleExplanationRuleCode[];
  badges: ScheduleExplanationBadgeCode[];
  hasWithinSoftLimit: boolean;
}

function getSlotKey(dayOfWeek: number, period: number): string {
  return `${dayOfWeek}-${period}`;
}

export function normalizeAutoScheduleConfig(
  config?: Partial<AutoScheduleConfig>,
): AutoScheduleConfig {
  const weeklySoftLimitHours = Number(config?.weeklySoftLimitHours);
  const closeHoursThreshold = Number(config?.closeHoursThreshold);

  return {
    weeklySoftLimitHours:
      Number.isFinite(weeklySoftLimitHours) && weeklySoftLimitHours >= 0
        ? weeklySoftLimitHours
        : DEFAULT_AUTO_SCHEDULE_CONFIG.weeklySoftLimitHours,
    closeHoursThreshold:
      Number.isFinite(closeHoursThreshold) && closeHoursThreshold >= 0
        ? closeHoursThreshold
        : DEFAULT_AUTO_SCHEDULE_CONFIG.closeHoursThreshold,
  };
}

function getSlots(): Slot[] {
  const slots: Slot[] = [];

  for (let dayOfWeek = 0; dayOfWeek < 5; dayOfWeek += 1) {
    for (let period = 1; period <= 8; period += 1) {
      slots.push({
        dayOfWeek,
        period,
        key: getSlotKey(dayOfWeek, period),
      });
    }
  }

  return slots;
}

function buildAvailabilityIndex(users: User[], availability: Availability[]) {
  const userById = new Map(users.map((user) => [user.id, user]));
  const availabilityBySlot = new Map<string, User[]>();

  availability.forEach((item) => {
    const user = userById.get(item.userId);
    if (!user) {
      return;
    }

    const key = getSlotKey(item.dayOfWeek, item.period);
    const existing = availabilityBySlot.get(key) || [];
    existing.push(user);
    availabilityBySlot.set(key, existing);
  });

  return availabilityBySlot;
}

function stableUserCompare(a: User, b: User): number {
  const nameCompare = a.name.localeCompare(b.name, 'zh-CN');
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return a.id.localeCompare(b.id);
}

function isCandidateAtSoftLimit(candidate: EvaluatedCandidate, config: AutoScheduleConfig): boolean {
  return !candidate.withinSoftLimit || candidate.hoursAfter > config.weeklySoftLimitHours;
}

function evaluateCandidate(
  candidate: User,
  slot: Slot,
  assignedBySlot: Map<string, Schedule>,
  assignedHours: Map<string, number>,
  config: AutoScheduleConfig,
): EvaluatedCandidate {
  const hoursBefore = assignedHours.get(candidate.id) || 0;
  const previousSlot = assignedBySlot.get(getSlotKey(slot.dayOfWeek, slot.period - 1));
  const nextSlot = assignedBySlot.get(getSlotKey(slot.dayOfWeek, slot.period + 1));
  const continuityWithPrevious = previousSlot?.userId === candidate.id;
  const continuityWithNext = nextSlot?.userId === candidate.id;

  return {
    user: candidate,
    hoursBefore,
    hoursAfter: hoursBefore + 1,
    continuityScore: Number(continuityWithPrevious) + Number(continuityWithNext),
    continuityWithPrevious,
    continuityWithNext,
    withinSoftLimit: hoursBefore < config.weeklySoftLimitHours,
  };
}

function pickCandidate(
  candidates: EvaluatedCandidate[],
  config: AutoScheduleConfig,
): CandidateSelection {
  const hasWithinSoftLimit = candidates.some((candidate) => candidate.withinSoftLimit);
  const limitPool = hasWithinSoftLimit
    ? candidates.filter((candidate) => candidate.withinSoftLimit)
    : candidates;

  const minHours = Math.min(...limitPool.map((candidate) => candidate.hoursBefore));
  const closeHoursPool = limitPool.filter(
    (candidate) => candidate.hoursBefore <= minHours + config.closeHoursThreshold,
  );
  const maxContinuity = Math.max(...closeHoursPool.map((candidate) => candidate.continuityScore));
  const continuityPool = closeHoursPool.filter(
    (candidate) => candidate.continuityScore === maxContinuity,
  );
  const sortedPool = [...continuityPool].sort((a, b) => stableUserCompare(a.user, b.user));
  const selected = sortedPool[0];

  const ruleHits: ScheduleExplanationRuleCode[] = [];

  if (
    selected.hoursBefore === minHours
    && (candidates.some((candidate) => candidate.hoursBefore > minHours)
      || (hasWithinSoftLimit && candidates.some((candidate) => !candidate.withinSoftLimit)))
  ) {
    ruleHits.push('hours_priority');
  }

  if (
    closeHoursPool.length > 1
    && maxContinuity > 0
    && closeHoursPool.some((candidate) => candidate.continuityScore !== maxContinuity)
  ) {
    ruleHits.push('continuity_priority');
  }

  if (sortedPool.length > 1) {
    ruleHits.push('stable_tiebreak');
  }

  const badges: ScheduleExplanationBadgeCode[] = [...ruleHits];

  if (isCandidateAtSoftLimit(selected, config)) {
    badges.push('soft_limit_warning');
  }

  return {
    selected,
    ruleHits,
    badges,
    hasWithinSoftLimit,
  };
}

function buildAssignedCandidateSelection(
  selected: EvaluatedCandidate,
  candidates: EvaluatedCandidate[],
  config: AutoScheduleConfig,
): CandidateSelection {
  const hasWithinSoftLimit = candidates.some((candidate) => candidate.withinSoftLimit);
  const limitPool = hasWithinSoftLimit
    ? candidates.filter((candidate) => candidate.withinSoftLimit)
    : candidates;

  const minHours = Math.min(...limitPool.map((candidate) => candidate.hoursBefore));
  const closeHoursPool = limitPool.filter(
    (candidate) => candidate.hoursBefore <= minHours + config.closeHoursThreshold,
  );
  const maxContinuity = Math.max(...closeHoursPool.map((candidate) => candidate.continuityScore));
  const continuityPool = closeHoursPool.filter(
    (candidate) => candidate.continuityScore === maxContinuity,
  );
  const sortedPool = [...continuityPool].sort((a, b) => stableUserCompare(a.user, b.user));

  const ruleHits: ScheduleExplanationRuleCode[] = [];

  if (
    selected.hoursBefore === minHours
    && (candidates.some((candidate) => candidate.hoursBefore > minHours)
      || (hasWithinSoftLimit && candidates.some((candidate) => !candidate.withinSoftLimit)))
  ) {
    ruleHits.push('hours_priority');
  }

  if (
    closeHoursPool.some((candidate) => candidate.user.id === selected.user.id)
    && maxContinuity > 0
    && closeHoursPool.length > 1
    && closeHoursPool.some((candidate) => candidate.continuityScore !== maxContinuity)
    && continuityPool.some((candidate) => candidate.user.id === selected.user.id)
  ) {
    ruleHits.push('continuity_priority');
  }

  if (sortedPool.length > 1 && sortedPool[0]?.user.id === selected.user.id) {
    ruleHits.push('stable_tiebreak');
  }

  const badges: ScheduleExplanationBadgeCode[] = [...ruleHits];

  if (isCandidateAtSoftLimit(selected, config)) {
    badges.push('soft_limit_warning');
  }

  return {
    selected,
    ruleHits,
    badges,
    hasWithinSoftLimit,
  };
}

function buildRejectionReasonCodes(
  candidate: EvaluatedCandidate,
  selected: EvaluatedCandidate,
  hasWithinSoftLimit: boolean,
  config: AutoScheduleConfig,
): ScheduleExplanationReasonCode[] {
  const reasons: ScheduleExplanationReasonCode[] = [];

  if (hasWithinSoftLimit && !candidate.withinSoftLimit && selected.withinSoftLimit) {
    reasons.push('soft_limit_reached');
  }

  if (candidate.hoursBefore > selected.hoursBefore) {
    reasons.push('higher_weekly_hours');
  } else if (
    candidate.hoursBefore <= selected.hoursBefore + config.closeHoursThreshold
    && selected.continuityScore > candidate.continuityScore
  ) {
    reasons.push(
      candidate.hoursBefore === selected.hoursBefore
        ? 'lower_continuity_same_hours'
        : 'lower_continuity_close_hours',
    );
  }

  if (reasons.length === 0) {
    reasons.push('stable_tiebreak');
  }

  return reasons;
}

function buildCandidateDetails(
  candidates: EvaluatedCandidate[],
  selected: EvaluatedCandidate,
  hasWithinSoftLimit: boolean,
  config: AutoScheduleConfig,
): ScheduleCandidateExplanation[] {
  return candidates.map((candidate) => ({
    userId: candidate.user.id,
    userName: candidate.user.name,
    hoursBefore: candidate.hoursBefore,
    hoursAfter: candidate.hoursAfter,
    continuityScore: candidate.continuityScore,
    continuityWithPrevious: candidate.continuityWithPrevious,
    continuityWithNext: candidate.continuityWithNext,
    withinSoftLimit: candidate.withinSoftLimit,
    selected: candidate.user.id === selected.user.id,
    rejectionReasonCodes:
      candidate.user.id === selected.user.id
        ? []
        : buildRejectionReasonCodes(candidate, selected, hasWithinSoftLimit, config),
  }));
}

function buildExplanation(
  selected: EvaluatedCandidate,
  candidates: EvaluatedCandidate[],
  selection: CandidateSelection,
  config: AutoScheduleConfig,
): ScheduleExplanation {
  const candidateDetails = buildCandidateDetails(
    candidates,
    selected,
    selection.hasWithinSoftLimit,
    config,
  );

  return {
    source: 'auto',
    assignedUserId: selected.user.id,
    assignedUserName: selected.user.name,
    config,
    badges: selection.badges,
    ruleHits: selection.ruleHits,
    noteCode: isCandidateAtSoftLimit(selected, config) ? 'soft_limit_warning' : undefined,
    candidates: candidateDetails,
    rejectionReasons: candidateDetails
      .filter((candidate) => !candidate.selected && candidate.rejectionReasonCodes.length > 0)
      .map((candidate) => ({
        userId: candidate.userId,
        userName: candidate.userName,
        reasonCodes: candidate.rejectionReasonCodes,
      })),
  };
}

function buildSingleCandidateExplanation(
  candidate: EvaluatedCandidate,
  config: AutoScheduleConfig,
): ScheduleExplanation {
  return {
    source: 'auto',
    assignedUserId: candidate.user.id,
    assignedUserName: candidate.user.name,
    config,
    badges: [
      'single_candidate',
      ...(isCandidateAtSoftLimit(candidate, config) ? (['soft_limit_warning'] as const) : []),
    ],
    ruleHits: ['single_candidate'],
    noteCode: isCandidateAtSoftLimit(candidate, config) ? 'soft_limit_warning' : undefined,
    candidates: [
      {
        userId: candidate.user.id,
        userName: candidate.user.name,
        hoursBefore: candidate.hoursBefore,
        hoursAfter: candidate.hoursAfter,
        continuityScore: candidate.continuityScore,
        continuityWithPrevious: candidate.continuityWithPrevious,
        continuityWithNext: candidate.continuityWithNext,
        withinSoftLimit: candidate.withinSoftLimit,
        selected: true,
        rejectionReasonCodes: [],
      },
    ],
    rejectionReasons: [],
  };
}

function buildManualExplanation(
  user: User,
  config: AutoScheduleConfig,
): ScheduleExplanation {
  return {
    source: 'manual',
    assignedUserId: user.id,
    assignedUserName: user.name,
    config,
    badges: ['manual_assignment'],
    ruleHits: ['manual_assignment'],
    noteCode: 'manual_override',
    candidates: [],
    rejectionReasons: [],
  };
}

export function createManualScheduleExplanation(
  user: User,
  config?: Partial<AutoScheduleConfig>,
): ScheduleExplanation {
  return buildManualExplanation(user, normalizeAutoScheduleConfig(config));
}

export function buildExplainableAutoSchedule(
  users: User[],
  availability: Availability[],
  config?: Partial<AutoScheduleConfig>,
): Schedule[] {
  const resolvedConfig = normalizeAutoScheduleConfig(config);
  const slots = getSlots();
  const availabilityBySlot = buildAvailabilityIndex(users, availability);
  const assignedBySlot = new Map<string, Schedule>();
  const assignedHours = new Map(users.map((user) => [user.id, 0]));
  const pendingSlots: Slot[] = [];

  // First lock slots that only have one feasible candidate.
  slots.forEach((slot) => {
    const candidates = [...(availabilityBySlot.get(slot.key) || [])].sort(stableUserCompare);

    if (candidates.length === 1) {
      const [candidate] = candidates;
      const evaluated = evaluateCandidate(
        candidate,
        slot,
        assignedBySlot,
        assignedHours,
        resolvedConfig,
      );

      assignedBySlot.set(slot.key, {
        userId: candidate.id,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        assigned: true,
        explanation: buildSingleCandidateExplanation(evaluated, resolvedConfig),
      });

      assignedHours.set(candidate.id, evaluated.hoursAfter);
      return;
    }

    if (candidates.length > 1) {
      pendingSlots.push(slot);
    }
  });

  // Then resolve multi-candidate slots with fairness first, continuity second.
  pendingSlots.forEach((slot) => {
    const candidates = [...(availabilityBySlot.get(slot.key) || [])].sort(stableUserCompare);

    if (candidates.length === 0) {
      return;
    }

    const evaluatedCandidates = candidates.map((candidate) =>
      evaluateCandidate(candidate, slot, assignedBySlot, assignedHours, resolvedConfig),
    );
    const selection = pickCandidate(evaluatedCandidates, resolvedConfig);

    assignedBySlot.set(slot.key, {
      userId: selection.selected.user.id,
      dayOfWeek: slot.dayOfWeek,
      period: slot.period,
      assigned: true,
      explanation: buildExplanation(
        selection.selected,
        evaluatedCandidates,
        selection,
        resolvedConfig,
      ),
    });

    assignedHours.set(selection.selected.user.id, selection.selected.hoursAfter);
  });

  return slots
    .map((slot) => assignedBySlot.get(slot.key))
    .filter((item): item is Schedule => Boolean(item));
}

export function rebuildScheduleExplanations(
  users: User[],
  availability: Availability[],
  schedule: Schedule[],
  config?: Partial<AutoScheduleConfig>,
): Schedule[] {
  const resolvedConfig = normalizeAutoScheduleConfig(config);
  const slots = getSlots();
  const availabilityBySlot = buildAvailabilityIndex(users, availability);
  const userById = new Map(users.map((user) => [user.id, user]));
  const assignedBySlot = new Map(
    schedule.map((item) => [getSlotKey(item.dayOfWeek, item.period), item] as const),
  );
  const assignedHours = new Map(users.map((user) => [user.id, 0]));

  return slots.reduce<Schedule[]>((result, slot) => {
      const current = assignedBySlot.get(slot.key);
      if (!current) {
        return result;
      }

      const assignedUser = userById.get(current.userId);
      if (!assignedUser) {
        return result;
      }

      let explanation: ScheduleExplanation;

      if (current.explanation?.source === 'manual') {
        explanation = buildManualExplanation(assignedUser, resolvedConfig);
      } else {
        const sortedCandidates = [...(availabilityBySlot.get(slot.key) || [])].sort(stableUserCompare);
        const candidates = sortedCandidates.some((candidate) => candidate.id === assignedUser.id)
          ? sortedCandidates
          : [...sortedCandidates, assignedUser].sort(stableUserCompare);
        const evaluatedCandidates = candidates.map((candidate) =>
          evaluateCandidate(candidate, slot, assignedBySlot, assignedHours, resolvedConfig),
        );
        const selected = evaluatedCandidates.find((candidate) => candidate.user.id === assignedUser.id);

        if (!selected || evaluatedCandidates.length === 0) {
          explanation = buildManualExplanation(assignedUser, resolvedConfig);
        } else if (evaluatedCandidates.length === 1) {
          explanation = buildSingleCandidateExplanation(selected, resolvedConfig);
        } else {
          explanation = buildExplanation(
            selected,
            evaluatedCandidates,
            buildAssignedCandidateSelection(selected, evaluatedCandidates, resolvedConfig),
            resolvedConfig,
          );
        }
      }

      assignedHours.set(current.userId, (assignedHours.get(current.userId) || 0) + 1);

      result.push({
        ...current,
        explanation,
      });

      return result;
    }, []);
}
