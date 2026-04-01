import type { Schedule, User, UserProfile } from '../types';

const TEMPLATE_URL = `${import.meta.env.BASE_URL}subsidy-template.xlsx?v=20260326-2`;
export const HOURLY_RATE = 23.7;
export const MAX_STANDARD_HOURS = 30;
export const MAX_STANDARD_AMOUNT = Math.round(HOURLY_RATE * MAX_STANDARD_HOURS);
const DATA_START_ROW = 6;
const TOTAL_LABEL = '合计：';

export interface SubsidyRow {
  userId: string;
  name: string;
  studentId: string;
  department: string;
  major: string;
  studentType: string;
  grade: string;
  hours: number;
  amount: number;
  requiresNote: boolean;
  missingFields: string[];
}

export interface EditableSubsidyRow extends SubsidyRow {
  systemHours: number;
  source: 'schedule' | 'manual';
}

export type SubsidyRecordStatus = 'draft' | 'exported';
export type SubsidyRecordSourceType = 'schedule' | 'record_copy';

export interface SubsidyRecord {
  id: string;
  status: SubsidyRecordStatus;
  sourceType: SubsidyRecordSourceType;
  recordMonth: string;
  monthStart: string;
  monthEnd: string;
  preparerName: string;
  preparerPhone: string;
  preparedDate: string;
  rows: EditableSubsidyRow[];
  overLimitNotes: Record<string, string>;
  totalHours: number;
  totalAmount: number;
  exportedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubsidyExportOptions {
  preparerName: string;
  preparerPhone: string;
  preparedDate: string;
  overLimitNotes: Record<string, string>;
  filename?: string;
}

type PartialProfile = Partial<UserProfile>;

const SUBSIDY_PROFILE_SEEDS: Record<string, PartialProfile> = {
  '毛紫薇': {
    studentId: '20233502092',
    department: '国际商学院',
    major: '网络与新媒体',
    studentType: '本科',
    grade: '2023',
  },
  '李贤': {
    studentId: '20233501037',
    department: '国际商学院',
    major: '文化产业管理',
    studentType: '本科',
    grade: '2023',
  },
  '廖诚俊': {
    studentId: '20233503058',
    department: '国际商学院',
    major: '网络与新媒体',
    studentType: '本科',
    grade: '2023',
  },
  '曾心越': {
    studentId: '20233637045',
    department: '国际商学院',
    major: '金融学（中外合作办学）',
    studentType: '本科',
    grade: '2023',
  },
};

const REQUIRED_FIELDS: Array<keyof Pick<
  UserProfile,
  'studentId' | 'department' | 'major' | 'studentType' | 'grade'
>> = ['studentId', 'department', 'major', 'studentType', 'grade'];

function cleanText(value?: string): string {
  return value?.trim() || '';
}

export function calculateSubsidyAmount(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) {
    return 0;
  }

  return Math.ceil(hours * HOURLY_RATE);
}

export function formatSubsidyAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    return '0';
  }

  return String(Math.round(amount));
}

export function validateApprovedHours(hours: number): string | null {
  if (!Number.isFinite(hours)) {
    return 'invalid';
  }

  if (hours < 0) {
    return 'negative';
  }

  if (hours > MAX_STANDARD_HOURS) {
    return 'over_limit';
  }

  return null;
}

export function createEditableSubsidyRow(row: SubsidyRow): EditableSubsidyRow {
  const amount = calculateSubsidyAmount(row.hours);
  return {
    ...row,
    systemHours: row.hours,
    amount,
    requiresNote: amount > MAX_STANDARD_AMOUNT,
    source: 'schedule',
  };
}

export function createManualEditableSubsidyRow(
  user: User,
  profiles: Map<string, UserProfile>,
): EditableSubsidyRow {
  const profile = mergeUserProfileWithSeed(user, profiles.get(user.id));
  return {
    userId: user.id,
    name: user.name,
    studentId: cleanText(profile.studentId),
    department: cleanText(profile.department),
    major: cleanText(profile.major),
    studentType: cleanText(profile.studentType),
    grade: cleanText(profile.grade),
    systemHours: 0,
    hours: 0,
    amount: 0,
    requiresNote: false,
    missingFields: getMissingSubsidyFields(profile),
    source: 'manual',
  };
}

export function updateEditableSubsidyRowHours(
  row: EditableSubsidyRow,
  hours: number,
): EditableSubsidyRow {
  const normalizedHours = Number(hours.toFixed(1));
  const amount = calculateSubsidyAmount(normalizedHours);
  return {
    ...row,
    hours: normalizedHours,
    amount,
    requiresNote: amount > MAX_STANDARD_AMOUNT,
  };
}

export function calculateSubsidyTotals(
  rows: Array<Pick<EditableSubsidyRow, 'hours' | 'amount'>>,
): { totalHours: number; totalAmount: number } {
  return {
    totalHours: Number(rows.reduce((sum, row) => sum + row.hours, 0).toFixed(1)),
    totalAmount: rows.reduce((sum, row) => sum + calculateSubsidyAmount(row.hours), 0),
  };
}

export function getRecordMonth(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getSubsidyRecordPeriod(referenceDate: Date = new Date()): {
  recordMonth: string;
  monthStart: string;
  monthEnd: string;
} {
  const { start, end } = getMonthlyRange(referenceDate);
  return {
    recordMonth: getRecordMonth(referenceDate),
    monthStart: formatDateInputValue(start),
    monthEnd: formatDateInputValue(end),
  };
}

export function getMonthlyRange(referenceDate: Date = new Date()) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  return { start, end };
}

export function getDefaultSubsidyFilename(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}_补助明细表.xlsx`;
}

export function getDefaultPreparedDate(referenceDate: Date = new Date()): string {
  return formatDateInputValue(referenceDate);
}

export function mergeUserProfileWithSeed(user: User, profile?: UserProfile): UserProfile {
  const seed = SUBSIDY_PROFILE_SEEDS[user.name] || {};
  return {
    id: user.id,
    phone: cleanText(profile?.phone || seed.phone),
    studentId: cleanText(profile?.studentId || seed.studentId),
    department: cleanText(profile?.department || seed.department),
    major: cleanText(profile?.major || seed.major),
    studentType: cleanText(profile?.studentType || seed.studentType),
    grade: cleanText(profile?.grade || seed.grade),
    updatedAt: profile?.updatedAt,
  };
}

export function restoreEditableSubsidyRows(rows: EditableSubsidyRow[]): EditableSubsidyRow[] {
  return rows.map((row) => {
    const normalizedHours = Number.isFinite(row.hours) ? Number(row.hours.toFixed(1)) : 0;
    const normalizedSystemHours = Number.isFinite(row.systemHours)
      ? Number(row.systemHours.toFixed(1))
      : 0;
    const amount = calculateSubsidyAmount(normalizedHours);

    return {
      userId: row.userId,
      name: cleanText(row.name),
      studentId: cleanText(row.studentId),
      department: cleanText(row.department),
      major: cleanText(row.major),
      studentType: cleanText(row.studentType),
      grade: cleanText(row.grade),
      hours: normalizedHours,
      systemHours: normalizedSystemHours,
      amount,
      requiresNote: amount > MAX_STANDARD_AMOUNT,
      missingFields: Array.isArray(row.missingFields) ? row.missingFields.filter(Boolean) : [],
      source: row.source === 'manual' ? 'manual' : 'schedule',
    };
  });
}

export function getMissingSubsidyFields(profile?: UserProfile): string[] {
  return REQUIRED_FIELDS.filter((field) => !cleanText(profile?.[field]));
}

function getMonthWeekdayCounts(referenceDate: Date): Map<number, number> {
  const { start, end } = getMonthlyRange(referenceDate);
  const counts = new Map<number, number>([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ]);

  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const weekday = day.getDay();
    if (weekday >= 1 && weekday <= 5) {
      counts.set(weekday - 1, (counts.get(weekday - 1) || 0) + 1);
    }
  }

  return counts;
}

export function calculateMonthlySubsidyRows(
  schedule: Schedule[],
  users: User[],
  profiles: Map<string, UserProfile>,
  referenceDate: Date = new Date(),
): SubsidyRow[] {
  const weekdayCounts = getMonthWeekdayCounts(referenceDate);
  const hoursByUser = new Map<string, number>();

  schedule.forEach((item) => {
    const recurringCount = weekdayCounts.get(item.dayOfWeek) || 0;
    if (!recurringCount) {
      return;
    }

    hoursByUser.set(item.userId, (hoursByUser.get(item.userId) || 0) + recurringCount);
  });

  return users
    .map((user) => {
      const hours = hoursByUser.get(user.id) || 0;
      if (hours <= 0) {
        return null;
      }

      const profile = mergeUserProfileWithSeed(user, profiles.get(user.id));
      const amount = calculateSubsidyAmount(hours);

      return {
        userId: user.id,
        name: user.name,
        studentId: cleanText(profile.studentId),
        department: cleanText(profile.department),
        major: cleanText(profile.major),
        studentType: cleanText(profile.studentType),
        grade: cleanText(profile.grade),
        hours,
        amount,
        requiresNote: amount > MAX_STANDARD_AMOUNT,
        missingFields: getMissingSubsidyFields(profile),
      } satisfies SubsidyRow;
    })
    .filter((row): row is SubsidyRow => row !== null);
}

function formatPreparedDate(preparedDate: string): string {
  const [year, month, day] = preparedDate.split('-');
  if (!year || !month || !day) {
    const fallback = new Date();
    return `${fallback.getFullYear()}年${fallback.getMonth() + 1}月${fallback.getDate()}日`;
  }

  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

type WorksheetCellLike = {
  value: unknown;
  alignment?: unknown;
  border?: unknown;
  fill?: unknown;
  font?: unknown;
  numFmt?: string;
  protection?: unknown;
};

type WorksheetRowLike = {
  height?: number;
};

type WorksheetLike = {
  model: {
    merges?: string[];
  };
  getCell: (ref: string) => WorksheetCellLike;
  getRow: (rowNumber: number) => WorksheetRowLike;
  mergeCells: (range: string) => void;
  unMergeCells: (range: string) => void;
};

type RowTemplate = {
  height?: number;
  cells: Array<{
    alignment?: unknown;
    border?: unknown;
    fill?: unknown;
    font?: unknown;
    numFmt?: string;
    protection?: unknown;
  }>;
};

function buildReasonValue(referenceDate: Date): string {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  return (
    `发放事由：${year}年${month}月 ☑管理工作助理 ¨学生兼职辅导员 ¨教学助理 ¨科研助理   ` +
    '¨临时岗位（名称）：                                                                      '
  );
}

function findTotalRow(worksheet: { rowCount: number; getCell: (ref: string) => { value: unknown } }): number {
  for (let row = DATA_START_ROW; row <= worksheet.rowCount + 5; row += 1) {
    const value = worksheet.getCell(`A${row}`).value?.toString() || '';
    if (value.includes(TOTAL_LABEL)) {
      return row;
    }
  }

  throw new Error('未找到补助模板中的合计行');
}

function clearDataRow(
  worksheet: { getCell: (row: number, col: number) => { value: unknown } },
  rowNumber: number,
) {
  for (let col = 1; col <= 10; col += 1) {
    worksheet.getCell(rowNumber, col).value = col === 10 ? '' : null;
  }
}

function getCellRef(rowNumber: number, colNumber: number): string {
  return `${String.fromCharCode(64 + colNumber)}${rowNumber}`;
}

function cloneStylePart<T>(value: T): T {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneStylePart(item)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, cloneStylePart(entry)]),
  ) as T;
}

function captureRowTemplate(worksheet: WorksheetLike, rowNumber: number, columnCount = 10): RowTemplate {
  return {
    height: worksheet.getRow(rowNumber).height,
    cells: Array.from({ length: columnCount }, (_, index) => {
      const cell = worksheet.getCell(getCellRef(rowNumber, index + 1));
      return {
        alignment: cloneStylePart(cell.alignment),
        border: cloneStylePart(cell.border),
        fill: cloneStylePart(cell.fill),
        font: cloneStylePart(cell.font),
        numFmt: cell.numFmt,
        protection: cloneStylePart(cell.protection),
      };
    }),
  };
}

function applyRowTemplate(
  worksheet: WorksheetLike,
  rowNumber: number,
  template: RowTemplate,
  columnCount = 10,
) {
  worksheet.getRow(rowNumber).height = template.height;

  for (let col = 1; col <= columnCount; col += 1) {
    const cell = worksheet.getCell(getCellRef(rowNumber, col));
    const source = template.cells[col - 1];
    cell.alignment = cloneStylePart(source.alignment);
    cell.border = cloneStylePart(source.border);
    cell.fill = cloneStylePart(source.fill);
    cell.font = cloneStylePart(source.font);
    cell.numFmt = source.numFmt;
    cell.protection = cloneStylePart(source.protection);
  }
}

function parseMergeRangeRows(range: string): { startRow: number; endRow: number } | null {
  const parts = range.split(':');
  if (parts.length === 0) {
    return null;
  }

  const start = parts[0]?.match(/\d+/)?.[0];
  const end = (parts[1] || parts[0])?.match(/\d+/)?.[0];
  if (!start || !end) {
    return null;
  }

  return {
    startRow: Number(start),
    endRow: Number(end),
  };
}

function clearMergedFooterRanges(worksheet: WorksheetLike, footerStartRow: number) {
  const merges = [...(worksheet.model.merges || [])];
  merges.forEach((range) => {
    const rows = parseMergeRangeRows(range);
    if (!rows) {
      return;
    }

    if (rows.startRow >= footerStartRow || rows.endRow >= footerStartRow) {
      worksheet.unMergeCells(range);
    }
  });
}

export function rebuildSubsidyFooterLayout(
  worksheet: WorksheetLike,
  templateTotalRow: number,
  totalRow: number,
  footerText: string,
) {
  const footerRow = totalRow + 1;
  const totalTemplate = captureRowTemplate(worksheet, totalRow);
  const footerTemplate = captureRowTemplate(worksheet, footerRow);

  clearMergedFooterRanges(worksheet, Math.min(templateTotalRow, totalRow));
  applyRowTemplate(worksheet, totalRow, totalTemplate);
  applyRowTemplate(worksheet, footerRow, footerTemplate);

  for (let col = 1; col <= 10; col += 1) {
    worksheet.getCell(getCellRef(totalRow, col)).value = null;
    worksheet.getCell(getCellRef(footerRow, col)).value = null;
  }

  worksheet.mergeCells(`A${totalRow}:H${totalRow}`);
  worksheet.mergeCells(`A${footerRow}:J${footerRow}`);
  worksheet.getCell(`A${totalRow}`).value = `${' '.repeat(88)}${TOTAL_LABEL}`;
  worksheet.getCell(`A${footerRow}`).value = footerText;
}

export async function exportSubsidyDetailsToExcel(
  rows: SubsidyRow[],
  options: SubsidyExportOptions,
  referenceDate: Date = new Date(),
) {
  const ExcelJS = await import('exceljs');
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error('无法加载补助明细模板');
  }

  const workbook = new ExcelJS.Workbook();
  const buffer = await response.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('补助明细模板缺少工作表');
  }

  let totalRow = findTotalRow(worksheet);
  const templateTotalRow = totalRow;
  const baseCapacity = totalRow - DATA_START_ROW;
  if (rows.length > baseCapacity) {
    const extraRows = rows.length - baseCapacity;
    worksheet.duplicateRow(totalRow - 1, extraRows, true);
    totalRow += extraRows;
  }

  const reasonCell = worksheet.getCell('A4');
  reasonCell.value = buildReasonValue(referenceDate);

  for (let rowNumber = DATA_START_ROW; rowNumber < totalRow; rowNumber += 1) {
    clearDataRow(worksheet, rowNumber);
  }

  rows.forEach((row, index) => {
    const rowNumber = DATA_START_ROW + index;
    worksheet.getCell(`A${rowNumber}`).value = index + 1;
    worksheet.getCell(`B${rowNumber}`).value = row.studentId;
    worksheet.getCell(`C${rowNumber}`).value = row.name;
    worksheet.getCell(`D${rowNumber}`).value = row.hours;
    worksheet.getCell(`E${rowNumber}`).value = row.department;
    worksheet.getCell(`F${rowNumber}`).value = row.major;
    worksheet.getCell(`G${rowNumber}`).value = row.studentType;
    worksheet.getCell(`H${rowNumber}`).value = row.grade;
    worksheet.getCell(`I${rowNumber}`).value = row.amount;
    worksheet.getCell(`I${rowNumber}`).numFmt = '0';
    worksheet.getCell(`J${rowNumber}`).value = options.overLimitNotes[row.userId] || '';
  });

  rebuildSubsidyFooterLayout(
    worksheet,
    templateTotalRow,
    totalRow,
    `设岗单位负责人签字：                制表人签字：${options.preparerName || ''}` +
      `                制表人电话：${options.preparerPhone || ''}` +
      `              制表日期：${formatPreparedDate(options.preparedDate)}`,
  );
  worksheet.getCell(`I${totalRow}`).value = { formula: `SUM(I${DATA_START_ROW}:I${totalRow - 1})` };
  worksheet.getCell(`I${totalRow}`).numFmt = '0';

  const output = await workbook.xlsx.writeBuffer();
  const blob = new Blob([output], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = options.filename || getDefaultSubsidyFilename(referenceDate);
  link.click();
}
