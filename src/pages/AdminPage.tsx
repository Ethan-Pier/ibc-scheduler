import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Calendar, Wand2,
  Plus, Trash2, Check, X, Shield, Lock, Languages, LogOut, Edit2, Phone, FileText,
  ChevronsLeft, ChevronsRight, History, Search, UserPlus, Eye, Copy, Download,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import {
  PERIODS,
  type AutoScheduleConfig,
  type ScheduleExplanation,
  type ScheduleExplanationBadgeCode,
  type ScheduleExplanationNoteCode,
  type ScheduleExplanationReasonCode,
  type ScheduleExplanationRuleCode,
  type User,
  type Availability,
  type Schedule,
  type UserProfile,
} from '../types';
import {
  getUsers, 
  saveUser, 
  deleteUser, 
  getSchedule,
  autoSchedule,
  clearSchedule,
  getAvailability,
  assignScheduleWithExplanation,
  subscribeToSchedule,
  subscribeToAvailability,
  subscribeToUsers,
  getAllUserProfiles,
  getAutoScheduleConfig,
  saveUserProfile,
  getSubsidyProfileSchemaHealth,
  saveAutoScheduleConfig,
  refreshScheduleExplanations,
  unassignSchedule,
  getScheduleHistory,
  saveScheduleToHistory,
  getActiveSubsidyDraft,
  saveSubsidyDraft,
  exportSubsidyDraft,
  getExportedSubsidyRecords,
  cloneSubsidyRecordToDraft,
  deleteSubsidyRecord,
  type ScheduleHistory,
  type SubsidyProfileSchemaHealth,
  subscribeToSubsidyRecords,
} from '../lib/storage';
import { createManualScheduleExplanation } from '../lib/autoSchedule';
import { exportScheduleToCSV, cn, calculateHoursPerUser } from '../lib/utils';
import {
  calculateMonthlySubsidyRows,
  calculateSubsidyAmount,
  calculateSubsidyTotals,
  createEditableSubsidyRow,
  createManualEditableSubsidyRow,
  updateEditableSubsidyRowHours,
  validateApprovedHours,
  exportSubsidyDetailsToExcel,
  getDefaultPreparedDate,
  mergeUserProfileWithSeed,
  getMissingSubsidyFields,
  getDefaultSubsidyFilename,
  getSubsidyRecordPeriod,
  HOURLY_RATE,
  MAX_STANDARD_HOURS,
  type EditableSubsidyRow,
  type SubsidyRecord,
  type SubsidyRecordSourceType,
} from '../lib/subsidy';

const ADMIN_PASSWORD = 'IBCprincipal';
const SUBSIDY_EXPORT_CONFIG_KEY = 'ibc-subsidy-export-config';
const ADMIN_SIDEBAR_COLLAPSED_KEY = 'ibc-admin-sidebar-collapsed';

const RULE_LABEL_KEYS: Record<ScheduleExplanationRuleCode, string> = {
  single_candidate: 'explanation.rule.singleCandidate',
  hours_priority: 'explanation.rule.hoursPriority',
  continuity_priority: 'explanation.rule.continuityPriority',
  stable_tiebreak: 'explanation.rule.stableTiebreak',
  manual_assignment: 'explanation.rule.manualAssignment',
};

const BADGE_LABEL_KEYS: Record<ScheduleExplanationBadgeCode, string> = {
  single_candidate: 'explanation.badge.singleCandidate',
  hours_priority: 'explanation.badge.hoursPriority',
  continuity_priority: 'explanation.badge.continuityPriority',
  stable_tiebreak: 'explanation.badge.stableTiebreak',
  manual_assignment: 'explanation.badge.manualAssignment',
  soft_limit_warning: 'explanation.badge.softLimitWarning',
};

const REASON_LABEL_KEYS: Record<ScheduleExplanationReasonCode, string> = {
  soft_limit_reached: 'explanation.reason.softLimitReached',
  higher_weekly_hours: 'explanation.reason.higherWeeklyHours',
  lower_continuity_same_hours: 'explanation.reason.lowerContinuitySameHours',
  lower_continuity_close_hours: 'explanation.reason.lowerContinuityCloseHours',
  stable_tiebreak: 'explanation.reason.stableTiebreak',
};

const NOTE_LABEL_KEYS: Record<ScheduleExplanationNoteCode, string> = {
  soft_limit_warning: 'explanation.note.softLimitWarning',
  manual_override: 'explanation.note.manualOverride',
};

interface EditableUserProfile extends UserProfile {
  name: string;
}

interface SubsidyExportForm {
  preparerName: string;
  preparerPhone: string;
  preparedDate: string;
  overLimitNotes: Record<string, string>;
}

function loadSubsidyExportForm(): SubsidyExportForm {
  const fallback: SubsidyExportForm = {
    preparerName: '',
    preparerPhone: '',
    preparedDate: getDefaultPreparedDate(),
    overLimitNotes: {},
  };

  const raw = localStorage.getItem(SUBSIDY_EXPORT_CONFIG_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SubsidyExportForm>;
    return {
      preparerName: parsed.preparerName || '',
      preparerPhone: parsed.preparerPhone || '',
      preparedDate: parsed.preparedDate || fallback.preparedDate,
      overLimitNotes: parsed.overLimitNotes || {},
    };
  } catch {
    return fallback;
  }
}

function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY) === 'true';
}

export function AdminPage() {
  const { setViewMode, setIsAdmin } = useApp();
  const { t, language, toggleLanguage } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [editingUser, setEditingUser] = useState<EditableUserProfile | null>(null);
  const [schedule, setSchedule] = useState<Map<string, string>>(new Map());
  const [scheduleDetails, setScheduleDetails] = useState<Map<string, Schedule>>(new Map());
  const [scheduleHistory, setScheduleHistory] = useState<ScheduleHistory[]>([]);
  const [subsidyRecords, setSubsidyRecords] = useState<SubsidyRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'schedule' | 'users' | 'history' | 'subsidy-records'>('schedule');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(loadSidebarCollapsed);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<{day: number, period: number} | null>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [autoScheduleConfig, setAutoScheduleConfig] = useState<AutoScheduleConfig>(() => getAutoScheduleConfig());
  const [isSubsidyExportOpen, setIsSubsidyExportOpen] = useState(false);
  const [isSubsidyExportLoading, setIsSubsidyExportLoading] = useState(false);
  const [subsidyExportForm, setSubsidyExportForm] = useState<SubsidyExportForm>(loadSubsidyExportForm);
  const [editableSubsidyRows, setEditableSubsidyRows] = useState<EditableSubsidyRow[]>([]);
  const [subsidyHourErrors, setSubsidyHourErrors] = useState<Record<string, string>>({});
  const [subsidyDraftId, setSubsidyDraftId] = useState<string | null>(null);
  const [subsidyDraftSourceType, setSubsidyDraftSourceType] = useState<SubsidyRecordSourceType>('schedule');
  const [subsidyDraftPeriod, setSubsidyDraftPeriod] = useState(getSubsidyRecordPeriod);
  const [subsidyNotice, setSubsidyNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [adminNotice, setAdminNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [subsidySchemaHealth, setSubsidySchemaHealth] = useState<SubsidyProfileSchemaHealth | null>(null);
  const [subsidyActionBusy, setSubsidyActionBusy] = useState<'save' | 'export' | 'clone' | 'reexport' | 'delete' | null>(null);
  const [isAddAssistantOpen, setIsAddAssistantOpen] = useState(false);
  const [assistantSearch, setAssistantSearch] = useState('');
  const [pendingScrollUserId, setPendingScrollUserId] = useState<string | null>(null);
  const [subsidyRemoveCandidate, setSubsidyRemoveCandidate] = useState<EditableSubsidyRow | null>(null);
  const [selectedSubsidyRecord, setSelectedSubsidyRecord] = useState<SubsidyRecord | null>(null);
  const [subsidyDeleteCandidate, setSubsidyDeleteCandidate] = useState<SubsidyRecord | null>(null);

  const syncScheduleState = (items: Schedule[]) => {
    const scheduleMap = new Map<string, string>();
    const detailsMap = new Map<string, Schedule>();

    items.forEach((item) => {
      const key = `${item.dayOfWeek}-${item.period}`;
      scheduleMap.set(key, item.userId);
      detailsMap.set(key, item);
    });

    setSchedule(scheduleMap);
    setScheduleDetails(detailsMap);
  };

  // Conflict detection and hours stats
  const scheduleArray = useMemo(() => {
    return Array.from(scheduleDetails.values()).map((item) => ({
      userId: item.userId,
      dayOfWeek: item.dayOfWeek,
      period: item.period,
      assigned: item.assigned,
    }));
  }, [scheduleDetails]);

  const mergedUserProfiles = useMemo(() => {
    const merged = new Map<string, UserProfile>();
    users.forEach((user) => {
      merged.set(user.id, mergeUserProfileWithSeed(user, userProfiles.get(user.id)));
    });
    return merged;
  }, [users, userProfiles]);
  const monthlySubsidyRows = useMemo(
    () => calculateMonthlySubsidyRows(scheduleArray, users, mergedUserProfiles),
    [scheduleArray, users, mergedUserProfiles],
  );
  const subsidyMonthRange = useMemo(
    () => `${subsidyDraftPeriod.monthStart} ~ ${subsidyDraftPeriod.monthEnd}`,
    [subsidyDraftPeriod.monthEnd, subsidyDraftPeriod.monthStart],
  );
  const dayLabels = useMemo(
    () => [t('monday'), t('tuesday'), t('wednesday'), t('thursday'), t('friday')],
    [t],
  );
  const periodLabels = useMemo(
    () =>
      PERIODS.map((period, index) => ({
        ...period,
        label: t(`period${index + 1}`),
      })),
    [t],
  );
  const selectedHistoryRecord = useMemo(
    () => scheduleHistory.find((record) => record.id === selectedHistoryId) || null,
    [scheduleHistory, selectedHistoryId],
  );
  const displayedScheduleDetails = useMemo(() => {
    if (!selectedHistoryRecord) {
      return scheduleDetails;
    }

    const historyMap = new Map<string, Schedule>();
    selectedHistoryRecord.schedule_data.forEach((item) => {
      historyMap.set(`${item.dayOfWeek}-${item.period}`, item);
    });
    return historyMap;
  }, [scheduleDetails, selectedHistoryRecord]);
  const displayedSchedule = useMemo(() => {
    if (!selectedHistoryRecord) {
      return schedule;
    }

    const historySchedule = new Map<string, string>();
    displayedScheduleDetails.forEach((item, key) => {
      historySchedule.set(key, item.userId);
    });
    return historySchedule;
  }, [displayedScheduleDetails, schedule, selectedHistoryRecord]);
  const displayedScheduleArray = useMemo(() => {
    return Array.from(displayedScheduleDetails.values()).map((item) => ({
      userId: item.userId,
      dayOfWeek: item.dayOfWeek,
      period: item.period,
      assigned: item.assigned,
    }));
  }, [displayedScheduleDetails]);
  const displayedHoursStats = useMemo(
    () => calculateHoursPerUser(displayedScheduleArray, users),
    [displayedScheduleArray, users],
  );
  const displayedParticipantCount = useMemo(
    () => new Set(displayedScheduleArray.map((item) => item.userId)).size,
    [displayedScheduleArray],
  );
  const isViewingHistory = !!selectedHistoryRecord;
  const selectedSchedule = selectedSlot
    ? displayedScheduleDetails.get(`${selectedSlot.day}-${selectedSlot.period}`)
    : undefined;
  const selectedExplanation = selectedSchedule?.explanation;
  const editableMissingSubsidyRows = useMemo(
    () => editableSubsidyRows.filter((row) => row.missingFields.length > 0),
    [editableSubsidyRows],
  );
  const noteMissingRows = useMemo(
    () =>
      editableSubsidyRows.filter(
        (row) => row.requiresNote && !subsidyExportForm.overLimitNotes[row.userId]?.trim(),
      ),
    [editableSubsidyRows, subsidyExportForm.overLimitNotes],
  );
  const subsidyTotals = useMemo(
    () => calculateSubsidyTotals(editableSubsidyRows),
    [editableSubsidyRows],
  );
  const availableAssistantsToAdd = useMemo(() => {
    const selectedIds = new Set(editableSubsidyRows.map((row) => row.userId));
    const keyword = assistantSearch.trim().toLowerCase();
    return users
      .filter((user) => !selectedIds.has(user.id))
      .filter((user) => !keyword || user.name.toLowerCase().includes(keyword))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }, [assistantSearch, editableSubsidyRows, users]);
  const canExportSubsidy =
    editableSubsidyRows.length > 0
    && editableMissingSubsidyRows.length === 0
    && noteMissingRows.length === 0
    && Object.keys(subsidyHourErrors).length === 0;

  const applySubsidyEditorState = (record: SubsidyRecord) => {
    setSubsidyDraftId(record.status === 'draft' ? record.id : null);
    setSubsidyDraftSourceType(record.sourceType);
    setSubsidyDraftPeriod({
      recordMonth: record.recordMonth,
      monthStart: record.monthStart,
      monthEnd: record.monthEnd,
    });
    setEditableSubsidyRows(record.rows);
    setSubsidyExportForm({
      preparerName: record.preparerName,
      preparerPhone: record.preparerPhone,
      preparedDate: record.preparedDate || getDefaultPreparedDate(),
      overLimitNotes: record.overLimitNotes,
    });
    setSubsidyHourErrors({});
    setAssistantSearch('');
    setIsAddAssistantOpen(false);
    setPendingScrollUserId(null);
    setSubsidyRemoveCandidate(null);
  };

  const resetSubsidyEditorToSeed = () => {
    const period = getSubsidyRecordPeriod();
    setSubsidyDraftId(null);
    setSubsidyDraftSourceType('schedule');
    setSubsidyDraftPeriod(period);
    setEditableSubsidyRows(monthlySubsidyRows.map((row) => createEditableSubsidyRow(row)));
    setSubsidyHourErrors({});
    setAssistantSearch('');
    setIsAddAssistantOpen(false);
    setPendingScrollUserId(null);
    setSubsidyRemoveCandidate(null);
    setSubsidyExportForm((prev) => ({
      ...prev,
      preparedDate: prev.preparedDate || getDefaultPreparedDate(),
      overLimitNotes: {},
    }));
  };

  const buildSubsidyDraftInput = () => ({
    id: subsidyDraftId,
    sourceType: subsidyDraftSourceType,
    recordMonth: subsidyDraftPeriod.recordMonth,
    monthStart: subsidyDraftPeriod.monthStart,
    monthEnd: subsidyDraftPeriod.monthEnd,
    preparerName: subsidyExportForm.preparerName,
    preparerPhone: subsidyExportForm.preparerPhone,
    preparedDate: subsidyExportForm.preparedDate || getDefaultPreparedDate(),
    rows: editableSubsidyRows,
    overLimitNotes: subsidyExportForm.overLimitNotes,
    totalHours: subsidyTotals.totalHours,
    totalAmount: subsidyTotals.totalAmount,
  });

  const refreshSubsidyRecords = async () => {
    const records = await getExportedSubsidyRecords();
    setSubsidyRecords(records);
  };

  const refreshSubsidySchemaHealth = async () => {
    const health = await getSubsidyProfileSchemaHealth();
    setSubsidySchemaHealth(health);
    return health;
  };

  const formatSchemaHealthMessage = (health: SubsidyProfileSchemaHealth | null) => {
    if (!health || health.healthy) {
      return '';
    }

    if (health.missingColumns.length > 0) {
      return `${t('subsidySchemaBlocked')} (${health.missingColumns.join(', ')})`;
    }

    return health.errorMessage
      ? `${t('subsidySchemaWarning')}：${health.errorMessage}`
      : t('subsidySchemaWarning');
  };

  const getRuleLabel = (code: ScheduleExplanationRuleCode) => t(RULE_LABEL_KEYS[code]);
  const getBadgeLabel = (code: ScheduleExplanationBadgeCode) => t(BADGE_LABEL_KEYS[code]);
  const getReasonLabel = (code: ScheduleExplanationReasonCode) => t(REASON_LABEL_KEYS[code]);
  const getNoteLabel = (code?: ScheduleExplanationNoteCode) => (code ? t(NOTE_LABEL_KEYS[code]) : '');

  const formatReasonCodes = (codes: ScheduleExplanationReasonCode[]) =>
    codes.map(getReasonLabel).join(language === 'zh' ? '；' : '; ');

  const formatCandidateSummary = (
    candidate: ScheduleExplanation['candidates'][number],
    explanation: ScheduleExplanation,
  ) => {
    const parts = [
      `${t('explanation.candidate.weeklyHoursPrefix')} ${candidate.hoursBefore} ${t('explanation.candidate.hourUnit')}`,
    ];

    if (candidate.continuityWithPrevious && candidate.continuityWithNext) {
      parts.push(t('explanation.candidate.continuityBoth'));
    } else if (candidate.continuityWithPrevious) {
      parts.push(t('explanation.candidate.continuityPrevious'));
    } else if (candidate.continuityWithNext) {
      parts.push(t('explanation.candidate.continuityNext'));
    }

    if (!candidate.withinSoftLimit || candidate.hoursAfter > explanation.config.weeklySoftLimitHours) {
      parts.push(t('explanation.note.softLimitWarning'));
    }

    return `${candidate.userName}：${parts.join(language === 'zh' ? '，' : ', ')}`;
  };

  useEffect(() => {
    localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
      
      // Subscribe to realtime changes
      const scheduleSubscription = subscribeToSchedule((newSchedule) => {
        syncScheduleState(newSchedule);
      });
      
      const availabilitySubscription = subscribeToAvailability((newAvailability) => {
        setAvailability(newAvailability);
      });
      
      const usersSubscription = subscribeToUsers((newUsers) => {
        setUsers(newUsers);
      });
      const subsidyRecordsSubscription = subscribeToSubsidyRecords((records) => {
        setSubsidyRecords(records);
      });
      return () => {
        scheduleSubscription.unsubscribe();
        availabilitySubscription.unsubscribe();
        usersSubscription.unsubscribe();
        subsidyRecordsSubscription.unsubscribe();
      };
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const { preparerName, preparerPhone, preparedDate } = subsidyExportForm;
    localStorage.setItem(
      SUBSIDY_EXPORT_CONFIG_KEY,
      JSON.stringify({ preparerName, preparerPhone, preparedDate }),
    );
  }, [subsidyExportForm]);

  useEffect(() => {
    if (!pendingScrollUserId || !isSubsidyExportOpen) {
      return;
    }

    requestAnimationFrame(() => {
      document.getElementById(`subsidy-row-${pendingScrollUserId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      setPendingScrollUserId(null);
    });
  }, [editableSubsidyRows, isSubsidyExportOpen, pendingScrollUserId]);

  const refreshData = async () => {
    const usersData = await getUsers();
    setUsers(usersData);
    await refreshSubsidySchemaHealth();
    const profilesData = await getAllUserProfiles();
    setUserProfiles(profilesData);
    const sched = await getSchedule();
    syncScheduleState(sched);
    const availData = await getAvailability();
    setAvailability(availData);
    const historyData = await getScheduleHistory();
    setScheduleHistory(historyData);
    await refreshSubsidyRecords();
  };

  const openUserEditor = (user: User) => {
    setAdminNotice(null);
    const mergedProfile = mergeUserProfileWithSeed(user, mergedUserProfiles.get(user.id));
    setEditingUser({
      id: user.id,
      name: user.name,
      phone: mergedProfile.phone || '',
      studentId: mergedProfile.studentId || '',
      department: mergedProfile.department || '',
      major: mergedProfile.major || '',
      studentType: mergedProfile.studentType || '',
      grade: mergedProfile.grade || '',
      updatedAt: mergedProfile.updatedAt,
    });
  };

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setIsAdmin(true);
      setError('');
    } else {
      setError(t('wrongPassword'));
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsAdmin(false);
    setPassword('');
    setViewMode('home');
  };

  const handleAddUser = async () => {
    if (newUserName.trim()) {
      await saveUser(newUserName.trim());
      setNewUserName('');
      await refreshData();
    }
  };

  const handleDeleteUser = async (userId: string) => {
    await deleteUser(userId);
    await refreshData();
  };

  const handleSaveProfile = async () => {
    if (!editingUser) return;
    const result = await saveUserProfile({
      id: editingUser.id,
      phone: editingUser.phone,
      studentId: editingUser.studentId,
      department: editingUser.department,
      major: editingUser.major,
      studentType: editingUser.studentType,
      grade: editingUser.grade,
    });
    await refreshData();

    if (result.remoteSynced) {
      setAdminNotice({ type: 'success', message: t('profileSyncRemoteSaved') });
      setEditingUser(null);
      return;
    }

    if (!result.schemaHealthy || result.missingColumns.length > 0) {
      setAdminNotice({
        type: 'error',
        message: formatSchemaHealthMessage({
          healthy: false,
          missingColumns: result.missingColumns,
          errorMessage: result.errorMessage,
          checkedAt: new Date().toISOString(),
        }),
      });
      return;
    }

    setAdminNotice({
      type: 'error',
      message: result.errorMessage
        ? `${t('profileSyncLocalOnly')}：${result.errorMessage}`
        : t('profileSyncLocalOnly'),
    });
  };

  const handleAutoSchedule = async () => {
    const newSchedule = await autoSchedule(autoScheduleConfig);
    await saveScheduleToHistory({
      generationMode: 'auto',
      createdBy: 'Admin',
      note: 'Auto schedule generated',
      scheduleData: newSchedule,
    });
    await refreshData();
    setSelectedHistoryId(null);
  };

  const handleClearSchedule = async () => {
    await clearSchedule();
    await refreshData();
  };

  const handleExportCSV = async () => {
    const usersData = await getUsers();
    const scheduleData = await getSchedule();
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;

    exportScheduleToCSV(
      scheduleData,
      usersData,
      `排班表_${localDate}.csv`,
    );
  };

  const handleOpenSubsidyExport = async () => {
    const health = await refreshSubsidySchemaHealth();
    if (!health.healthy) {
      setIsSubsidyExportOpen(false);
      setSubsidyNotice({ type: 'error', message: formatSchemaHealthMessage(health) });
      return;
    }

    setIsSubsidyExportOpen(true);
    setIsSubsidyExportLoading(true);
    setSubsidyNotice(null);
    try {
      const draft = await getActiveSubsidyDraft();
      if (draft) {
        applySubsidyEditorState(draft);
        setSubsidyNotice({ type: 'success', message: t('subsidyDraftLoaded') });
      } else {
        resetSubsidyEditorToSeed();
      }
    } catch (error) {
      console.error('Error opening subsidy export editor:', error);
      resetSubsidyEditorToSeed();
      setSubsidyNotice({ type: 'error', message: t('subsidyDraftLoadFailed') });
    } finally {
      setIsSubsidyExportLoading(false);
    }
  };

  const handleSaveSubsidyDraft = async () => {
    setSubsidyActionBusy('save');
    setSubsidyNotice(null);
    try {
      const draft = await saveSubsidyDraft(buildSubsidyDraftInput());
      applySubsidyEditorState(draft);
      setSubsidyNotice({ type: 'success', message: t('subsidyDraftSaved') });
    } catch (error) {
      console.error('Error saving subsidy draft:', error);
      setSubsidyNotice({ type: 'error', message: t('subsidyDraftSaveFailed') });
    } finally {
      setSubsidyActionBusy(null);
    }
  };

  const handleExportSubsidy = async () => {
    if (!canExportSubsidy) {
      return;
    }

    setSubsidyActionBusy('export');
    setSubsidyNotice(null);
    try {
      const referenceDate = new Date(`${subsidyDraftPeriod.monthStart}T00:00:00`);
      await exportSubsidyDetailsToExcel(
        editableSubsidyRows,
        {
          ...subsidyExportForm,
          filename: getDefaultSubsidyFilename(referenceDate),
        },
        referenceDate,
      );
      await exportSubsidyDraft(buildSubsidyDraftInput());
      await refreshSubsidyRecords();
      setSubsidyDraftId(null);
      setIsSubsidyExportOpen(false);
      setSubsidyNotice({ type: 'success', message: t('subsidyExportArchived') });
    } catch (error) {
      console.error('Error exporting subsidy record:', error);
      setSubsidyNotice({ type: 'error', message: t('subsidyExportFailed') });
    } finally {
      setSubsidyActionBusy(null);
    }
  };

  const handleCloneSubsidyRecord = async (record: SubsidyRecord, openEditor: boolean) => {
    setSubsidyActionBusy('clone');
    setSubsidyNotice(null);
    try {
      const draft = await cloneSubsidyRecordToDraft(record.id);
      if (openEditor) {
        applySubsidyEditorState(draft);
        setSelectedSubsidyRecord(null);
        setIsSubsidyExportOpen(true);
      }
      setSubsidyNotice({
        type: 'success',
        message: openEditor ? t('subsidyRecordReadyToEdit') : t('subsidyRecordCopied'),
      });
    } catch (error) {
      console.error('Error cloning subsidy record:', error);
      setSubsidyNotice({ type: 'error', message: t('subsidyRecordCloneFailed') });
    } finally {
      setSubsidyActionBusy(null);
    }
  };

  const handleReExportSubsidyRecord = async (record: SubsidyRecord) => {
    setSubsidyActionBusy('reexport');
    setSubsidyNotice(null);
    try {
      const referenceDate = new Date(`${record.monthStart}T00:00:00`);
      await exportSubsidyDetailsToExcel(
        record.rows,
        {
          preparerName: record.preparerName,
          preparerPhone: record.preparerPhone,
          preparedDate: record.preparedDate,
          overLimitNotes: record.overLimitNotes,
          filename: getDefaultSubsidyFilename(referenceDate),
        },
        referenceDate,
      );
      setSubsidyNotice({ type: 'success', message: t('subsidyRecordReExported') });
    } catch (error) {
      console.error('Error re-exporting subsidy record:', error);
      setSubsidyNotice({ type: 'error', message: t('subsidyExportFailed') });
    } finally {
      setSubsidyActionBusy(null);
    }
  };

  const handleDeleteSubsidyRecord = async () => {
    if (!subsidyDeleteCandidate) {
      return;
    }

    setSubsidyActionBusy('delete');
    setSubsidyNotice(null);
    try {
      await deleteSubsidyRecord(subsidyDeleteCandidate.id);
      await refreshSubsidyRecords();
      if (selectedSubsidyRecord?.id === subsidyDeleteCandidate.id) {
        setSelectedSubsidyRecord(null);
      }
      setSubsidyDeleteCandidate(null);
      setSubsidyNotice({ type: 'success', message: t('subsidyRecordDeleted') });
    } catch (error) {
      console.error('Error deleting subsidy record:', error);
      setSubsidyNotice({ type: 'error', message: t('subsidyRecordDeleteFailed') });
    } finally {
      setSubsidyActionBusy(null);
    }
  };

  const formatDateRange = (start: string, end: string) => `${start} ~ ${end}`;

  const formatRecordDateTime = (value?: string) => {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  };

  const getSubsidySourceLabel = (sourceType: SubsidyRecordSourceType) =>
    sourceType === 'record_copy' ? t('subsidySourceRecordCopy') : t('subsidySourceSchedule');

  const getUserName = (userId: string) => {
    return users.find(u => u.id === userId)?.name || (language === 'zh' ? '未知' : 'Unknown');
  };

  const getUserColor = (userId: string) => {
    const colors = [
      'from-blue-400 to-cyan-400',
      'from-purple-400 to-pink-400',
      'from-green-400 to-emerald-400',
      'from-orange-400 to-red-400',
      'from-indigo-400 to-blue-400',
      'from-teal-400 to-cyan-400',
    ];
    const index = userId.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getAvailableUsersForSlot = (day: number, period: number): User[] => {
    return users.filter(user => 
      availability.some(a => a.userId === user.id && a.dayOfWeek === day && a.period === period)
    );
  };

  const getHoursErrorMessage = (code: string) => {
    if (code === 'negative') return t('negativeApprovedHours');
    if (code === 'over_limit') return t('hoursLimitExceeded');
    return t('invalidApprovedHours');
  };

  const handleApprovedHoursChange = (userId: string, rawValue: string) => {
    const value = Number(rawValue);
    const validationCode = validateApprovedHours(value);

    if (validationCode) {
      setSubsidyHourErrors((prev) => ({
        ...prev,
        [userId]: getHoursErrorMessage(validationCode),
      }));
      return;
    }

    setSubsidyHourErrors((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setEditableSubsidyRows((prev) =>
      prev.map((row) => (row.userId === userId ? updateEditableSubsidyRowHours(row, value) : row)),
    );
  };

  const handleAddAssistant = (user: User) => {
    const nextRow = createManualEditableSubsidyRow(user, mergedUserProfiles);
    setEditableSubsidyRows((prev) => [...prev, nextRow]);
    setAssistantSearch('');
    setIsAddAssistantOpen(false);
    setPendingScrollUserId(user.id);
  };

  const handleConfirmRemoveAssistant = () => {
    if (!subsidyRemoveCandidate) {
      return;
    }

    const userId = subsidyRemoveCandidate.userId;
    setEditableSubsidyRows((prev) => prev.filter((row) => row.userId !== userId));
    setSubsidyHourErrors((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setSubsidyExportForm((prev) => {
      const nextNotes = { ...prev.overLimitNotes };
      delete nextNotes[userId];
      return {
        ...prev,
        overLimitNotes: nextNotes,
      };
    });
    setSubsidyRemoveCandidate(null);
  };

  const getHistoryModeLabel = (mode: ScheduleHistory['generationMode']) =>
    mode === 'manual' ? t('manualGenerated') : t('autoGenerated');

  const formatHistoryDateTime = (value: string) =>
    new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));

  const getHistoryRangeLabel = (record: ScheduleHistory) => {
    if (record.schedule_data.length === 0) {
      return '-';
    }

    const sorted = [...record.schedule_data].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
      }
      return a.period - b.period;
    });
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const firstPeriod = periodLabels.find((period) => period.num === first.period)?.label || first.period;
    const lastPeriod = periodLabels.find((period) => period.num === last.period)?.label || last.period;
    return `${dayLabels[first.dayOfWeek]} ${firstPeriod} - ${dayLabels[last.dayOfWeek]} ${lastPeriod}`;
  };

  const getHistoryParticipantCount = (record: ScheduleHistory) =>
    new Set(record.schedule_data.map((item) => item.userId)).size;

  const handleViewHistory = (historyId: string) => {
    setSelectedHistoryId(historyId);
    setActiveTab('schedule');
    setSelectedSlot(null);
  };

  const handleBackToLiveSchedule = () => {
    setSelectedHistoryId(null);
  };

  const handleAutoScheduleConfigChange = (
    field: keyof AutoScheduleConfig,
    value: string,
  ) => {
    const parsed = Number(value);
    const nextConfig = saveAutoScheduleConfig({
      ...autoScheduleConfig,
      [field]: Number.isFinite(parsed) ? parsed : 0,
    });
    setAutoScheduleConfig(nextConfig);
  };

  const handleManualAssign = async (userId: string | null) => {
    if (!selectedSlot) return;
    
    if (userId) {
      const selectedUser = users.find((user) => user.id === userId);
      if (!selectedUser) {
        return;
      }

      await assignScheduleWithExplanation(
        userId,
        selectedSlot.day,
        selectedSlot.period,
        createManualScheduleExplanation(selectedUser, autoScheduleConfig),
      );
    } else {
      await unassignSchedule(selectedSlot.day, selectedSlot.period);
    }

    const refreshedSchedule = await refreshScheduleExplanations();
    await saveScheduleToHistory({
      generationMode: 'manual',
      createdBy: 'Admin',
      note: userId
        ? `Manual adjustment for ${dayLabels[selectedSlot.day]} ${periodLabels.find((period) => period.num === selectedSlot.period)?.label}`
        : `Manual unassign for ${dayLabels[selectedSlot.day]} ${periodLabels.find((period) => period.num === selectedSlot.period)?.label}`,
      scheduleData: refreshedSchedule,
    });
    await refreshData();
    setSelectedSlot(null);
  };

  if (!isAuthenticated) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="w-full max-w-sm"
        >
          <div className="glass-card rounded-2xl p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-slate-800 tracking-tight">
                {t('adminTitle')}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {t('adminSubtitle')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder={t('enterPassword')}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-sm text-red-500 text-center"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                onClick={handleLogin}
                className="w-full btn-gradient py-3"
              >
                {t('login')}
              </button>

              <button
                onClick={() => setViewMode('home')}
                className="w-full py-3 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                {t('backToHome')}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex"
    >
      <AnimatePresence initial={false}>
        {!isSidebarCollapsed && (
          <motion.aside
            key="admin-sidebar"
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="floating-sidebar w-64 p-4 overflow-y-auto flex flex-col"
          >
            {/* Header */}
            <div className="mb-6 flex items-start justify-between gap-3 p-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-800">{t('adminTitle')}</h2>
                  <p className="text-xs text-slate-500">{t('loggedIn')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                className="sidebar-toggle-btn"
                aria-label={t('collapseSidebar')}
                title={t('collapseSidebar')}
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Main Menu Content */}
            <div className="flex-1">
              {/* Navigation */}
              <nav className="space-y-2 mb-6">
                <button
                  onClick={() => setActiveTab('schedule')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                    activeTab === 'schedule'
                      ? "bg-blue-50/50 text-blue-600 shadow-sm shadow-blue-500/10"
                      : "text-slate-600 hover:bg-white/40"
                  )}
                >
                  <Calendar className="w-5 h-5" />
                  <span className="font-medium">{t('scheduleOverview')}</span>
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                    activeTab === 'users'
                      ? "bg-blue-50/50 text-blue-600 shadow-sm shadow-blue-500/10"
                      : "text-slate-600 hover:bg-white/40"
                  )}
                >
                  <Users className="w-5 h-5" />
                  <span className="font-medium">{t('userManagement')}</span>
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                    activeTab === 'history'
                      ? "bg-blue-50/50 text-blue-600 shadow-sm shadow-blue-500/10"
                      : "text-slate-600 hover:bg-white/40"
                  )}
                >
                  <History className="w-5 h-5" />
                  <span className="font-medium">{t('scheduleHistory')}</span>
                </button>
                <button
                  onClick={() => setActiveTab('subsidy-records')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                    activeTab === 'subsidy-records'
                      ? "bg-blue-50/50 text-blue-600 shadow-sm shadow-blue-500/10"
                      : "text-slate-600 hover:bg-white/40"
                  )}
                >
                  <FileText className="w-5 h-5" />
                  <span className="font-medium">{t('subsidyRecords')}</span>
                </button>
              </nav>

              {/* Language Toggle */}
              <div className="mb-4 p-3 rounded-xl bg-white/30 border border-white/20">
                <p className="text-xs text-slate-400 mb-2">{t('language')}</p>
                <button
                  onClick={toggleLanguage}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 hover:bg-white/40 transition-colors"
                >
                  <Languages className="w-5 h-5" />
                  <span className="font-medium">{language === 'zh' ? 'English' : '中文'}</span>
                </button>
              </div>
            </div>

            {/* Logout Button - Always at bottom */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50/50 hover:text-red-500 transition-colors border-t border-slate-200/50 pt-4 mt-2"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">{t('logout')}</span>
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isSidebarCollapsed && (
          <motion.button
            key="admin-sidebar-expand"
            type="button"
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsSidebarCollapsed(false)}
            className="sidebar-toggle-fab"
            aria-label={t('expandSidebar')}
            title={t('expandSidebar')}
          >
            <ChevronsRight className="w-4 h-4" />
            <span className="font-medium">{t('expandSidebar')}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 p-8 transition-[margin] duration-300",
          isSidebarCollapsed ? "ml-24" : "ml-80",
        )}
      >
        {subsidySchemaHealth && !subsidySchemaHealth.healthy && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/85 px-4 py-3 text-sm text-amber-800">
            {formatSchemaHealthMessage(subsidySchemaHealth)}
          </div>
        )}

        {adminNotice && (
          <div
            className={cn(
              'mb-4 rounded-2xl border px-4 py-3 text-sm',
              adminNotice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
                : 'border-rose-200 bg-rose-50/80 text-rose-700',
            )}
          >
            {adminNotice.message}
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === 'schedule' && (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">
                    {isViewingHistory ? t('historyViewing') : t('scheduleOverview')}
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    {isViewingHistory
                      ? `${t('historyRange')}：${getHistoryRangeLabel(selectedHistoryRecord)}`
                      : t('viewSchedule')}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                  {isViewingHistory ? (
                    <>
                      <span className="rounded-full bg-white/60 px-3 py-2 text-sm text-slate-500">
                        {t('historyGeneratedAt')}：{formatHistoryDateTime(selectedHistoryRecord.generated_at)}
                      </span>
                      <span className="rounded-full bg-white/60 px-3 py-2 text-sm text-slate-500">
                        {t('historyGenerationMode')}：{getHistoryModeLabel(selectedHistoryRecord.generationMode)}
                      </span>
                      <button
                        onClick={handleBackToLiveSchedule}
                        className="btn-admin flex items-center gap-2"
                      >
                        <History className="w-4 h-4" />
                        {t('historyBackToLive')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleClearSchedule}
                        className="btn-admin flex items-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        {t('clearSchedule')}
                      </button>
                      <button
                        onClick={handleAutoSchedule}
                        className="btn-admin flex items-center gap-2"
                      >
                        <Wand2 className="w-4 h-4" />
                        {t('autoSchedule')}
                      </button>
                      <button
                        onClick={handleExportCSV}
                        className="btn-gradient flex items-center gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        {t('exportCSV')}
                      </button>
                      <button
                        onClick={handleOpenSubsidyExport}
                        className="btn-gradient flex items-center gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        {t('exportSubsidy')}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {subsidyNotice && !isSubsidyExportOpen && (
                <div
                  className={cn(
                    'mb-6 rounded-2xl border px-4 py-3 text-sm',
                    subsidyNotice.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
                      : 'border-rose-200 bg-rose-50/80 text-rose-700',
                  )}
                >
                  {subsidyNotice.message}
                </div>
              )}

              <div className="glass-card rounded-2xl p-4 mb-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-700">{t('autoScheduleSettingsTitle')}</h2>
                    <p className="mt-1 text-sm text-slate-500">{t('autoScheduleSettingsSubtitle')}</p>
                  </div>
                  <div className="grid w-full max-w-xl grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
                        {t('weeklySoftLimitHours')}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={autoScheduleConfig.weeklySoftLimitHours}
                        onChange={(e) =>
                          handleAutoScheduleConfigChange('weeklySoftLimitHours', e.target.value)
                        }
                        className="w-full rounded-xl border border-white/40 bg-white/50 px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
                        {t('closeHoursThreshold')}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={autoScheduleConfig.closeHoursThreshold}
                        onChange={(e) =>
                          handleAutoScheduleConfigChange('closeHoursThreshold', e.target.value)
                        }
                        className="w-full rounded-xl border border-white/40 bg-white/50 px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Hours Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {displayedHoursStats.map(stat => (
                  <div
                    key={stat.userId}
                    className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700"
                  >
                    <div className="text-sm text-gray-500 dark:text-gray-400">{stat.name}</div>
                    <div className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                      {stat.hours}
                    </div>
                    <div className="text-xs text-gray-400">{t('slots')}</div>
                  </div>
                ))}
              </div>

              {/* Schedule Grid */}
              <div className="glass-card rounded-2xl p-6 overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* Header */}
                  <div className="grid grid-cols-[120px_repeat(5,1fr)] gap-3 mb-4">
                    <div className="text-sm font-medium text-slate-400 flex items-end pb-2">
                      {t('periodDay')}
                    </div>
                    {dayLabels.map((day, index) => (
                      <motion.div
                        key={day}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="text-center py-3 rounded-xl bg-white/30 font-medium text-slate-700"
                      >
                        {day}
                      </motion.div>
                    ))}
                  </div>

                  {/* Period Rows */}
                  <div className="space-y-3">
                    {periodLabels.map((period, periodIndex) => (
                      <div key={period.num}>
                        {period.num === 5 && (
                          <div className="my-4 border-t border-dashed border-slate-300/50" />
                        )}
                        <div className="grid grid-cols-[120px_repeat(5,1fr)] gap-3">
                          {/* Period Label */}
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 + periodIndex * 0.03 }}
                            className={cn(
                              "flex flex-col justify-center rounded-xl px-3",
                              period.num <= 4 ? "bg-blue-50/30" : "bg-amber-50/30"
                            )}
                          >
                            <span className="text-sm font-medium text-slate-700">
                              {period.label}
                            </span>
                          </motion.div>
                          
                          {/* Day Cells */}
                          {dayLabels.map((_, dayIndex) => {
                            const key = `${dayIndex}-${period.num}`;
                            const userId = displayedSchedule.get(key);
                            const explanationBadge = displayedScheduleDetails.get(key)?.explanation?.badges[0];
                            const availableUsers = getAvailableUsersForSlot(dayIndex, period.num);
                            const isAssigned = !!userId;
                            
                            return (
                              <motion.button
                                key={key}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ 
                                  delay: 0.2 + periodIndex * 0.02 + dayIndex * 0.01 
                                }}
                                onClick={() => {
                                  if (!isViewingHistory) {
                                    setSelectedSlot({day: dayIndex, period: period.num});
                                  }
                                }}
                                className={cn(
                                  "h-20 rounded-xl flex items-center justify-center relative",
                                  isAssigned 
                                    ? isViewingHistory
                                      ? "bg-white/60 shadow-sm cursor-default"
                                      : "bg-white/60 shadow-sm cursor-pointer hover:bg-white/80"
                                    : !isViewingHistory && availableUsers.length > 0
                                      ? "bg-blue-50/40 border border-blue-200/50 cursor-pointer hover:bg-blue-50/60"
                                      : "bg-white/20 border border-white/20 cursor-not-allowed"
                                )}
                              >
                                {isAssigned ? (
                                  <div className="text-center">
                                    <div className={cn(
                                      "w-8 h-8 mx-auto rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-medium mb-1",
                                      getUserColor(userId)
                                    )}>
                                      {getUserName(userId).charAt(0)}
                                    </div>
                                    <span className="text-xs font-medium text-slate-600 truncate max-w-[80px] block">
                                      {getUserName(userId)}
                                    </span>
                                    {explanationBadge && (
                                      <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                                        {getBadgeLabel(explanationBadge)}
                                      </span>
                                    )}
                                  </div>
                                ) : !isViewingHistory && availableUsers.length > 0 ? (
                                  <div className="text-center">
                                    <div className="w-8 h-8 mx-auto rounded-full bg-slate-300 flex items-center justify-center text-white text-xs font-medium mb-1">
                                      ?
                                    </div>
                                    <span className="text-xs font-medium text-slate-400 truncate max-w-[80px] block">
                                      {availableUsers.length} {t('peopleAvailable')}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 text-xs">{t('unassigned')}</span>
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mt-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="glass-card rounded-xl p-4"
                >
                  <p className="text-sm text-slate-500 mb-1">
                    {isViewingHistory ? t('historyParticipants') : t('totalUsers')}
                  </p>
                  <p className="text-2xl font-semibold text-slate-800">
                    {isViewingHistory ? displayedParticipantCount : users.length}
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="glass-card rounded-xl p-4"
                >
                  <p className="text-sm text-slate-500 mb-1">{t('scheduledSlots')}</p>
                  <p className="text-2xl font-semibold text-slate-800">{displayedSchedule.size}</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="glass-card rounded-xl p-4"
                >
                  <p className="text-sm text-slate-500 mb-1">
                    {isViewingHistory ? t('historyGeneratedAt') : t('totalAvailable')}
                  </p>
                  <p className="text-lg font-semibold text-slate-800">
                    {isViewingHistory
                      ? formatHistoryDateTime(selectedHistoryRecord.generated_at)
                      : availability.length}
                  </p>
                </motion.div>
              </div>
            </motion.div>
          )}

          {activeTab === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-2xl"
            >
              <h1 className="text-2xl font-semibold text-slate-800 tracking-tight mb-6">
                {t('userManagement')}
              </h1>

              {/* Add User */}
              <div className="glass-card rounded-2xl p-6 mb-6">
                <h2 className="text-sm font-medium text-slate-500 mb-4">{t('addNewUser')}</h2>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
                    placeholder={t('enterName')}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                  />
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAddUser}
                    className="btn-gradient flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {t('addUser')}
                  </motion.button>
                </div>
              </div>

              {/* User List */}
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-sm font-medium text-slate-500 mb-4">{t('allUsers')}</h2>
                <div className="space-y-2">
                  <AnimatePresence>
                    {users.map((user, index) => (
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/40 hover:bg-white/60 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => openUserEditor(user)}
                          className="flex items-center gap-3 flex-1 text-left"
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-medium",
                            getUserColor(user.id)
                          )}>
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-700 block">{user.name}</span>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {mergedUserProfiles.get(user.id)?.phone || t('noPhone')}
                            </span>
                            <span
                              className={cn(
                                'text-xs block mt-1',
                                getMissingSubsidyFields(mergedUserProfiles.get(user.id)).length === 0
                                  ? 'text-emerald-600'
                                  : 'text-amber-600',
                              )}
                            >
                              {getMissingSubsidyFields(mergedUserProfiles.get(user.id)).length === 0
                                ? t('subsidyProfileReady')
                                : t('subsidyProfileIncomplete')}
                            </span>
                          </div>
                        </button>
                        <div className="flex items-center gap-1">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => openUserEditor(user)}
                            className="p-2 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50/50 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDeleteUser(user.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50/50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {users.length === 0 && (
                    <p className="text-center text-slate-400 py-8">{t('noUsers')}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-5xl"
            >
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">
                  {t('scheduleHistory')}
                </h1>
                <p className="text-slate-500 text-sm mt-1">
                  {t('scheduleHistorySubtitle')}
                </p>
              </div>

              {scheduleHistory.length === 0 ? (
                <div className="glass-card rounded-2xl p-8 text-center text-slate-500">
                  {t('historyEmpty')}
                </div>
              ) : (
                <div className="space-y-4">
                  {scheduleHistory.slice(0, 5).map((record) => (
                    <div
                      key={record.id}
                      className="glass-card rounded-2xl p-5"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <p className="text-base font-semibold text-slate-800">
                            {t('historyRange')}：{getHistoryRangeLabel(record)}
                          </p>
                          <div className="grid grid-cols-1 gap-1 text-sm text-slate-500 md:grid-cols-2">
                            <p>{t('historyParticipants')}：{getHistoryParticipantCount(record)}</p>
                            <p>{t('historyGenerationMode')}：{getHistoryModeLabel(record.generationMode)}</p>
                            <p>{t('historyCreatedBy')}：{record.createdBy}</p>
                            <p>{t('historyGeneratedAt')}：{formatHistoryDateTime(record.generated_at)}</p>
                          </div>
                          {record.note && (
                            <p className="text-sm text-slate-500">{record.note}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleViewHistory(record.id)}
                          className="btn-admin flex items-center gap-2 self-start"
                        >
                          <Eye className="w-4 h-4" />
                          {t('historyViewDetails')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'subsidy-records' && (
            <motion.div
              key="subsidy-records"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-6xl"
            >
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">
                  {t('subsidyRecords')}
                </h1>
                <p className="text-slate-500 text-sm mt-1">
                  {t('subsidyRecordsSubtitle')}
                </p>
              </div>

              {subsidyNotice && !isSubsidyExportOpen && (
                <div
                  className={cn(
                    'mb-6 rounded-2xl border px-4 py-3 text-sm',
                    subsidyNotice.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
                      : 'border-rose-200 bg-rose-50/80 text-rose-700',
                  )}
                >
                  {subsidyNotice.message}
                </div>
              )}

              {subsidyRecords.length === 0 ? (
                <div className="glass-card rounded-2xl p-8 text-center text-slate-500">
                  {t('subsidyRecordsEmpty')}
                </div>
              ) : (
                <div className="space-y-4">
                  {subsidyRecords.map((record) => (
                    <div
                      key={record.id}
                      className="glass-card rounded-2xl p-5"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-slate-800">
                              {t('subsidyRecordMonth')}：{record.recordMonth}
                            </p>
                            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-slate-500">
                              {getSubsidySourceLabel(record.sourceType)}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-1 text-sm text-slate-500 md:grid-cols-2">
                            <p>{t('naturalMonthRange')}：{formatDateRange(record.monthStart, record.monthEnd)}</p>
                            <p>{t('subsidyRecordExportedAt')}：{formatRecordDateTime(record.exportedAt)}</p>
                            <p>{t('preparerName')}：{record.preparerName || '-'}</p>
                            <p>{t('preparerPhone')}：{record.preparerPhone || '-'}</p>
                            <p>{t('totalApprovedHours')}：{record.totalHours}</p>
                            <p>{t('totalApprovedAmount')}：{record.totalAmount.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 xl:max-w-md xl:justify-end">
                          <button
                            onClick={() => setSelectedSubsidyRecord(record)}
                            className="btn-admin flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" />
                            {t('historyViewDetails')}
                          </button>
                          <button
                            onClick={() => handleCloneSubsidyRecord(record, true)}
                            disabled={subsidyActionBusy !== null}
                            className="btn-admin flex items-center gap-2"
                          >
                            <Edit2 className="w-4 h-4" />
                            {t('subsidyRecordContinueEdit')}
                          </button>
                          <button
                            onClick={() => handleCloneSubsidyRecord(record, false)}
                            disabled={subsidyActionBusy !== null}
                            className="btn-admin flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" />
                            {t('subsidyRecordCopy')}
                          </button>
                          <button
                            onClick={() => handleReExportSubsidyRecord(record)}
                            disabled={subsidyActionBusy !== null}
                            className="btn-admin flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            {t('subsidyRecordReExport')}
                          </button>
                          <button
                            onClick={() => setSubsidyDeleteCandidate(record)}
                            disabled={subsidyActionBusy !== null}
                            className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t('subsidyRecordDelete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <AnimatePresence>
        {selectedSubsidyRecord && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[105] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
            onClick={() => setSelectedSubsidyRecord(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card w-full max-w-5xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-800">{t('subsidyRecordDetails')}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {t('subsidyRecordMonth')}：{selectedSubsidyRecord.recordMonth} · {getSubsidySourceLabel(selectedSubsidyRecord.sourceType)}
                  </p>
                </div>
                <div className="text-sm text-slate-500 md:text-right">
                  <p>{t('naturalMonthRange')}：{formatDateRange(selectedSubsidyRecord.monthStart, selectedSubsidyRecord.monthEnd)}</p>
                  <p>{t('subsidyRecordExportedAt')}：{formatRecordDateTime(selectedSubsidyRecord.exportedAt)}</p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-white/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{t('preparerName')}</p>
                  <p className="mt-2 text-sm font-medium text-slate-700">{selectedSubsidyRecord.preparerName || '-'}</p>
                </div>
                <div className="rounded-2xl bg-white/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{t('preparerPhone')}</p>
                  <p className="mt-2 text-sm font-medium text-slate-700">{selectedSubsidyRecord.preparerPhone || '-'}</p>
                </div>
                <div className="rounded-2xl bg-white/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{t('totalApprovedHours')}</p>
                  <p className="mt-2 text-sm font-medium text-slate-700">{selectedSubsidyRecord.totalHours}</p>
                </div>
                <div className="rounded-2xl bg-white/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{t('totalApprovedAmount')}</p>
                  <p className="mt-2 text-sm font-medium text-slate-700">{selectedSubsidyRecord.totalAmount.toFixed(2)}</p>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-2xl border border-white/40 bg-white/50">
                <table className="min-w-full text-sm text-slate-600">
                  <thead className="bg-white/70 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">{t('assistantName')}</th>
                      <th className="px-4 py-3 font-medium">{t('studentId')}</th>
                      <th className="px-4 py-3 font-medium">{t('major')}</th>
                      <th className="px-4 py-3 font-medium">{t('grade')}</th>
                      <th className="px-4 py-3 font-medium">{t('systemHours')}</th>
                      <th className="px-4 py-3 font-medium">{t('approvedHours')}</th>
                      <th className="px-4 py-3 font-medium">{t('subsidyAmount')}</th>
                      <th className="px-4 py-3 font-medium">{t('overLimitNote')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSubsidyRecord.rows.map((row) => (
                      <tr key={row.userId} className="border-t border-white/40">
                        <td className="px-4 py-4 font-medium text-slate-800">{row.name}</td>
                        <td className="px-4 py-4">{row.studentId || '---'}</td>
                        <td className="px-4 py-4">{row.major || '---'}</td>
                        <td className="px-4 py-4">{row.grade || '---'}</td>
                        <td className="px-4 py-4">{row.systemHours}</td>
                        <td className="px-4 py-4">{row.hours}</td>
                        <td className="px-4 py-4">{row.amount.toFixed(2)}</td>
                        <td className="px-4 py-4">
                          {selectedSubsidyRecord.overLimitNotes[row.userId] || <span className="text-slate-300">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => handleCloneSubsidyRecord(selectedSubsidyRecord, true)}
                  disabled={subsidyActionBusy !== null}
                  className="btn-admin flex items-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  {t('subsidyRecordContinueEdit')}
                </button>
                <button
                  onClick={() => handleCloneSubsidyRecord(selectedSubsidyRecord, false)}
                  disabled={subsidyActionBusy !== null}
                  className="btn-admin flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  {t('subsidyRecordCopy')}
                </button>
                <button
                  onClick={() => handleReExportSubsidyRecord(selectedSubsidyRecord)}
                  disabled={subsidyActionBusy !== null}
                  className="btn-admin flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {t('subsidyRecordReExport')}
                </button>
                <button
                  onClick={() => setSubsidyDeleteCandidate(selectedSubsidyRecord)}
                  disabled={subsidyActionBusy !== null}
                  className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('subsidyRecordDelete')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assignment Modal */}
      <AnimatePresence>
        {selectedSlot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
            onClick={() => setSelectedSlot(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="glass-card rounded-2xl p-6 w-full max-w-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                {t('selectAssignee')}
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                {dayLabels[selectedSlot.day]} · {periodLabels.find((p) => p.num === selectedSlot.period)?.label}
              </p>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {/* Unassign option */}
                <button
                  onClick={() => handleManualAssign(null)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/40 hover:bg-red-50/50 hover:text-red-500 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                    <X className="w-5 h-5 text-slate-400" />
                  </div>
                  <span className="font-medium">
                    {t('unassign')}
                  </span>
                </button>

                {/* Available users */}
                {getAvailableUsersForSlot(selectedSlot.day, selectedSlot.period).map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleManualAssign(user.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left",
                      schedule.get(`${selectedSlot.day}-${selectedSlot.period}`) === user.id
                        ? "bg-blue-50/70 border border-blue-200"
                        : "bg-white/40 hover:bg-white/60"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-medium",
                      getUserColor(user.id)
                    )}>
                      {user.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium text-slate-700 block">{user.name}</span>
                      {schedule.get(`${selectedSlot.day}-${selectedSlot.period}`) === user.id && (
                        <span className="text-xs text-blue-600">
                          {t('selected')}
                        </span>
                      )}
                    </div>
                    {schedule.get(`${selectedSlot.day}-${selectedSlot.period}`) === user.id && (
                      <Check className="w-5 h-5 text-blue-500" />
                    )}
                  </button>
                ))}

                {getAvailableUsersForSlot(selectedSlot.day, selectedSlot.period).length === 0 && (
                  <p className="text-center text-slate-400 py-4">
                    {t('noOneAvailable')}
                  </p>
                )}
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200/70 bg-white/40 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="text-sm font-semibold text-slate-700">{t('explanationInfo')}</h4>
                  {selectedExplanation?.badges && selectedExplanation.badges.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-2">
                      {selectedExplanation.badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600"
                        >
                          {getBadgeLabel(badge)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {selectedExplanation ? (
                  <div className="space-y-4 text-sm text-slate-600">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">{t('assignedResult')}</p>
                      <p className="mt-1 font-medium text-slate-800">{selectedExplanation.assignedUserName}</p>
                      {selectedExplanation.noteCode && (
                        <p className="mt-1 text-xs text-amber-600">{getNoteLabel(selectedExplanation.noteCode)}</p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">{t('matchedRules')}</p>
                      <p className="mt-1">
                        {selectedExplanation.ruleHits.length > 0
                          ? selectedExplanation.ruleHits.map(getRuleLabel).join(language === 'zh' ? '、' : ', ')
                          : '-'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">{t('candidateList')}</p>
                      {selectedExplanation.candidates.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {selectedExplanation.candidates.map((candidate) => (
                            <div
                              key={candidate.userId}
                              className={cn(
                                'rounded-xl border px-3 py-2',
                                candidate.selected
                                  ? 'border-emerald-200 bg-emerald-50/70'
                                  : 'border-slate-200 bg-white/50',
                              )}
                            >
                              <p className="text-slate-700">
                                {formatCandidateSummary(candidate, selectedExplanation)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-slate-500">-</p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">{t('rejectionReasonTitle')}</p>
                      {selectedExplanation.rejectionReasons.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {selectedExplanation.rejectionReasons.map((item) => (
                            <div key={item.userId} className="rounded-xl border border-slate-200 bg-white/50 px-3 py-2">
                              <p className="text-slate-700">
                                {item.userName}：{formatReasonCodes(item.reasonCodes)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-slate-500">-</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t('noExplanation')}</p>
                )}
              </div>

              <button
                onClick={() => setSelectedSlot(null)}
                className="w-full mt-4 py-3 rounded-xl text-slate-500 hover:bg-white/40 transition-colors"
              >
                {t('cancel')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit User Profile Modal */}
      <AnimatePresence>
        {editingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
            onClick={() => setEditingUser(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="glass-card rounded-2xl p-6 w-full max-w-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                {t('editUserProfile')}
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                {editingUser.name}
              </p>

              {adminNotice && (
                <div
                  className={cn(
                    'mb-4 rounded-2xl border px-4 py-3 text-sm',
                    adminNotice.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
                      : 'border-rose-200 bg-rose-50/80 text-rose-700',
                  )}
                >
                  {adminNotice.message}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-500 mb-2 block">{t('phoneNumber')}</label>
                  <input
                    type="tel"
                    value={editingUser.phone}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    placeholder={t('phoneNumber')}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-500 mb-2 block">{t('studentId')}</label>
                  <input
                    type="text"
                    value={editingUser.studentId || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, studentId: e.target.value })}
                    placeholder={t('enterStudentId')}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-500 mb-2 block">{t('department')}</label>
                  <input
                    type="text"
                    value={editingUser.department || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })}
                    placeholder={t('enterDepartment')}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-500 mb-2 block">{t('major')}</label>
                  <input
                    type="text"
                    value={editingUser.major || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, major: e.target.value })}
                    placeholder={t('enterMajor')}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-500 mb-2 block">{t('studentType')}</label>
                  <input
                    type="text"
                    value={editingUser.studentType || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, studentType: e.target.value })}
                    placeholder={t('enterStudentType')}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-500 mb-2 block">{t('grade')}</label>
                  <input
                    type="text"
                    value={editingUser.grade || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, grade: e.target.value })}
                    placeholder={t('enterGrade')}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-3 rounded-xl text-slate-500 hover:bg-white/40 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleSaveProfile}
                  className="flex-1 btn-gradient py-3"
                >
                  {t('save')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subsidy Export Modal */}
      <AnimatePresence>
        {isSubsidyExportOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
            onClick={() => setIsSubsidyExportOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="glass-card rounded-2xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-slate-800">{t('exportSubsidyTitle')}</h3>
                  <p className="text-sm text-slate-500 mt-1">{t('exportSubsidySubtitle')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-slate-500">
                      {subsidyDraftId ? t('subsidyDraftActive') : t('subsidyDraftNew')}
                    </span>
                    <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-slate-500">
                      {getSubsidySourceLabel(subsidyDraftSourceType)}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-slate-500 md:text-right">
                  <p>{t('naturalMonthRange')}：{subsidyMonthRange}</p>
                  <p>{t('hourlyRate')}：{HOURLY_RATE}</p>
                </div>
              </div>
              {subsidyNotice && (
                <div
                  className={cn(
                    'mb-6 rounded-2xl border px-4 py-3 text-sm',
                    subsidyNotice.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
                      : 'border-rose-200 bg-rose-50/80 text-rose-700',
                  )}
                >
                  {subsidyNotice.message}
                </div>
              )}

              {isSubsidyExportLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-white/40 p-10 text-center text-slate-500">
                  {t('subsidyDraftLoading')}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                      <label className="text-sm text-slate-500 mb-2 block">{t('preparerName')}</label>
                      <input
                        type="text"
                        value={subsidyExportForm.preparerName}
                        onChange={(e) =>
                          setSubsidyExportForm((prev) => ({ ...prev, preparerName: e.target.value }))
                        }
                        className="w-full px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-500 mb-2 block">{t('preparerPhone')}</label>
                      <input
                        type="text"
                        value={subsidyExportForm.preparerPhone}
                        onChange={(e) =>
                          setSubsidyExportForm((prev) => ({ ...prev, preparerPhone: e.target.value }))
                        }
                        className="w-full px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-500 mb-2 block">{t('preparedDate')}</label>
                      <input
                        type="date"
                        value={subsidyExportForm.preparedDate}
                        onChange={(e) =>
                          setSubsidyExportForm((prev) => ({ ...prev, preparedDate: e.target.value }))
                        }
                        className="w-full px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                      />
                    </div>
                  </div>

                  {editableMissingSubsidyRows.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 mb-6">
                      <p className="text-sm font-medium text-amber-700 mb-2">{t('missingProfileData')}</p>
                      <div className="space-y-1 text-sm text-amber-700">
                        {editableMissingSubsidyRows.map((row) => (
                          <p key={row.userId}>
                            {row.name}：{row.missingFields.map((field) => t(field)).join(' / ')}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-white/40 bg-white/50 p-4 mb-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{t('addAssistant')}</p>
                        <p className="text-sm text-slate-500 mt-1">{t('addAssistantSubtitle')}</p>
                      </div>
                      <button
                        onClick={() => setIsAddAssistantOpen((prev) => !prev)}
                        className="btn-admin flex items-center gap-2 self-start"
                      >
                        <UserPlus className="w-4 h-4" />
                        {t('addAssistant')}
                      </button>
                    </div>

                    {isAddAssistantOpen && (
                      <div className="mt-4 space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={assistantSearch}
                            onChange={(e) => setAssistantSearch(e.target.value)}
                            placeholder={t('searchAssistantPlaceholder')}
                            className="w-full rounded-xl border border-white/40 bg-white/70 py-2.5 pl-10 pr-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                        <div className="max-h-48 space-y-2 overflow-y-auto">
                          {availableAssistantsToAdd.length === 0 ? (
                            <p className="rounded-xl bg-white/50 px-4 py-3 text-sm text-slate-500">
                              {t('noAssistantsToAdd')}
                            </p>
                          ) : (
                            availableAssistantsToAdd.map((user) => (
                              <button
                                key={user.id}
                                onClick={() => handleAddAssistant(user)}
                                className="w-full rounded-xl bg-white/60 px-4 py-3 text-left text-sm text-slate-600 transition-colors hover:bg-white/80"
                              >
                                {user.name}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {editableSubsidyRows.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white/40 p-6 text-center text-slate-500">
                      {t('exportListEmpty')}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/40 bg-white/50">
                      <table className="min-w-full text-sm text-slate-600">
                        <thead className="bg-white/70 text-left text-slate-500">
                          <tr>
                            <th className="px-4 py-3 font-medium">{t('assistantName')}</th>
                            <th className="px-4 py-3 font-medium">{t('studentId')}</th>
                            <th className="px-4 py-3 font-medium">{t('major')}</th>
                            <th className="px-4 py-3 font-medium">{t('grade')}</th>
                            <th className="px-4 py-3 font-medium">{t('systemHours')}</th>
                            <th className="px-4 py-3 font-medium">{t('approvedHours')}</th>
                            <th className="px-4 py-3 font-medium">{t('subsidyAmount')}</th>
                            <th className="px-4 py-3 font-medium">{t('overLimitNote')}</th>
                            <th className="px-4 py-3 font-medium">{t('delete')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editableSubsidyRows.map((row) => {
                            const status =
                              row.missingFields.length > 0
                                ? t('allowanceMissingData')
                                : row.requiresNote
                                  ? t('allowanceNeedsNote')
                                  : t('allowanceReady');

                            return (
                              <tr
                                key={row.userId}
                                id={`subsidy-row-${row.userId}`}
                                className="border-t border-white/40 align-top"
                              >
                                <td className="px-4 py-4">
                                  <div>
                                    <p className="font-medium text-slate-800">{row.name}</p>
                                    <p className="mt-1 text-xs text-slate-400">{status}</p>
                                  </div>
                                </td>
                                <td className="px-4 py-4">{row.studentId || '---'}</td>
                                <td className="px-4 py-4">{row.major || '---'}</td>
                                <td className="px-4 py-4">{row.grade || '---'}</td>
                                <td className="px-4 py-4">{row.systemHours}</td>
                                <td className="px-4 py-4">
                                  <div className="w-28">
                                    <div className="relative">
                                      <input
                                        type="number"
                                        min="0"
                                        max={MAX_STANDARD_HOURS}
                                        step="0.1"
                                        value={row.hours}
                                        onChange={(e) => handleApprovedHoursChange(row.userId, e.target.value)}
                                        className={cn(
                                          'w-full rounded-xl border bg-white/80 px-3 py-2 pr-8 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30',
                                          subsidyHourErrors[row.userId]
                                            ? 'border-red-300 focus:ring-red-500/20'
                                            : 'border-white/40',
                                        )}
                                      />
                                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                        {t('hoursUnitShort')}
                                      </span>
                                    </div>
                                    {subsidyHourErrors[row.userId] && (
                                      <p className="mt-1 text-xs text-red-500">{subsidyHourErrors[row.userId]}</p>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4">{calculateSubsidyAmount(row.hours).toFixed(2)}</td>
                                <td className="px-4 py-4">
                                  {row.requiresNote ? (
                                    <input
                                      type="text"
                                      value={subsidyExportForm.overLimitNotes[row.userId] || ''}
                                      onChange={(e) =>
                                        setSubsidyExportForm((prev) => ({
                                          ...prev,
                                          overLimitNotes: {
                                            ...prev.overLimitNotes,
                                            [row.userId]: e.target.value,
                                          },
                                        }))
                                      }
                                      placeholder={t('extraDutyPlaceholder')}
                                      className="w-52 rounded-xl border border-white/40 bg-white/80 px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                    />
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-4">
                                  <button
                                    onClick={() => setSubsidyRemoveCandidate(row)}
                                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t border-white/40 bg-white/70 font-medium text-slate-700">
                          <tr>
                            <td className="px-4 py-3" colSpan={5}>
                              {t('totalsLabel')}
                            </td>
                            <td className="px-4 py-3">
                              {t('totalApprovedHours')}：{subsidyTotals.totalHours}
                            </td>
                            <td className="px-4 py-3">
                              {t('totalApprovedAmount')}：{subsidyTotals.totalAmount.toFixed(2)}
                            </td>
                            <td className="px-4 py-3" colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => setIsSubsidyExportOpen(false)}
                      className="flex-1 py-3 rounded-xl text-slate-500 hover:bg-white/40 transition-colors"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      onClick={handleSaveSubsidyDraft}
                      disabled={subsidyActionBusy !== null}
                      className="flex-1 py-3 rounded-xl bg-white/70 text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t('saveDraft')}
                    </button>
                    <button
                      onClick={handleExportSubsidy}
                      disabled={!canExportSubsidy || subsidyActionBusy !== null}
                      className={cn(
                        'flex-1 py-3 rounded-xl text-white transition-colors',
                        canExportSubsidy && subsidyActionBusy === null
                          ? 'btn-gradient'
                          : 'bg-slate-300 cursor-not-allowed',
                      )}
                    >
                      {t('exportAndArchive')}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {subsidyRemoveCandidate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
            onClick={() => setSubsidyRemoveCandidate(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card w-full max-w-md rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-800">{t('confirmRemoveAssistant')}</h3>
              <p className="mt-2 text-sm text-slate-500">
                {t('confirmRemoveAssistantMessage')}
              </p>
              <p className="mt-3 text-sm font-medium text-slate-700">{subsidyRemoveCandidate.name}</p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setSubsidyRemoveCandidate(null)}
                  className="flex-1 rounded-xl py-3 text-slate-500 transition-colors hover:bg-white/40"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleConfirmRemoveAssistant}
                  className="flex-1 rounded-xl bg-red-500 py-3 font-medium text-white transition-colors hover:bg-red-600"
                >
                  {t('confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {subsidyDeleteCandidate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
            onClick={() => setSubsidyDeleteCandidate(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card w-full max-w-md rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-800">{t('subsidyRecordConfirmDelete')}</h3>
              <p className="mt-2 text-sm text-slate-500">
                {t('subsidyRecordConfirmDeleteMessage')}
              </p>
              <p className="mt-3 text-sm font-medium text-slate-700">
                {subsidyDeleteCandidate.recordMonth} · {formatDateRange(subsidyDeleteCandidate.monthStart, subsidyDeleteCandidate.monthEnd)}
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setSubsidyDeleteCandidate(null)}
                  className="flex-1 rounded-xl py-3 text-slate-500 transition-colors hover:bg-white/40"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleDeleteSubsidyRecord}
                  disabled={subsidyActionBusy === 'delete'}
                  className="flex-1 rounded-xl bg-red-500 py-3 font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
