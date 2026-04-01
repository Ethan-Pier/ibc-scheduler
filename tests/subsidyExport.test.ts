import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  MAX_STANDARD_HOURS,
  calculateSubsidyAmount,
  calculateSubsidyTotals,
  createEditableSubsidyRow,
  createManualEditableSubsidyRow,
  exportSubsidyDetailsToExcel,
  formatSubsidyAmount,
  getSubsidyRecordPeriod,
  rebuildSubsidyFooterLayout,
  restoreEditableSubsidyRows,
  updateEditableSubsidyRowHours,
  validateApprovedHours,
  type SubsidyRow,
} from '../src/lib/subsidy';
import type { User, UserProfile } from '../src/types';

const baseRow: SubsidyRow = {
  userId: 'user-1',
  name: '曾心越',
  studentId: '20233637045',
  department: '国际商学院',
  major: '金融学',
  studentType: '本科',
  grade: '2023',
  hours: 12,
  amount: calculateSubsidyAmount(12),
  requiresNote: false,
  missingFields: [],
};

describe('subsidy export helpers', () => {
  it('validates approved hours against numeric, negative, and max limits', () => {
    expect(validateApprovedHours(Number.NaN)).toBe('invalid');
    expect(validateApprovedHours(-1)).toBe('negative');
    expect(validateApprovedHours(MAX_STANDARD_HOURS + 0.1)).toBe('over_limit');
    expect(validateApprovedHours(18.5)).toBeNull();
  });

  it('creates editable rows while preserving system hours', () => {
    const editable = createEditableSubsidyRow(baseRow);

    expect(editable.systemHours).toBe(12);
    expect(editable.hours).toBe(12);
    expect(editable.source).toBe('schedule');
  });

  it('updates editable rows with recalculated amount and keeps original system hours', () => {
    const editable = createEditableSubsidyRow(baseRow);
    const updated = updateEditableSubsidyRowHours(editable, 10.5);

    expect(updated.systemHours).toBe(12);
    expect(updated.hours).toBe(10.5);
    expect(updated.amount).toBe(calculateSubsidyAmount(10.5));
  });

  it('creates manual rows for existing users with zero default hours', () => {
    const user: User = {
      id: 'user-2',
      name: '李贤',
      createdAt: '2026-03-23T00:00:00.000Z',
    };
    const profiles = new Map<string, UserProfile>([
      [
        user.id,
        {
          id: user.id,
          studentId: '20233501037',
          department: '国际商学院',
          major: '文化产业管理',
          studentType: '本科',
          grade: '2023',
        },
      ],
    ]);

    const row = createManualEditableSubsidyRow(user, profiles);

    expect(row.source).toBe('manual');
    expect(row.systemHours).toBe(0);
    expect(row.hours).toBe(0);
    expect(row.amount).toBe(0);
    expect(row.missingFields).toEqual([]);
  });

  it('calculates totals from editable rows', () => {
    const total = calculateSubsidyTotals([
      createEditableSubsidyRow(baseRow),
      updateEditableSubsidyRowHours(createEditableSubsidyRow(baseRow), 5.5),
    ]);

    expect(total.totalHours).toBe(17.5);
    expect(total.totalAmount).toBe(calculateSubsidyAmount(12) + calculateSubsidyAmount(5.5));
  });

  it('restores persisted rows with normalized amount and note state', () => {
    const restored = restoreEditableSubsidyRows([
      {
        ...createEditableSubsidyRow(baseRow),
        hours: 30.05,
        amount: 1,
        requiresNote: false,
      },
    ]);

    expect(restored[0].hours).toBe(30.1);
    expect(restored[0].amount).toBe(calculateSubsidyAmount(30.1));
    expect(restored[0].requiresNote).toBe(true);
  });

  it('rounds subsidy amounts up to integers and formats them without decimals', () => {
    expect(calculateSubsidyAmount(15)).toBe(356);
    expect(calculateSubsidyAmount(16.5)).toBe(392);
    expect(calculateSubsidyAmount(7)).toBe(166);
    expect(calculateSubsidyAmount(28)).toBe(664);
    expect(calculateSubsidyAmount(22)).toBe(522);
    expect(formatSubsidyAmount(392)).toBe('392');
  });

  it('derives a stable subsidy record period from a reference date', () => {
    expect(getSubsidyRecordPeriod(new Date('2026-03-26T08:00:00.000Z'))).toEqual({
      recordMonth: '2026-03',
      monthStart: '2026-03-01',
      monthEnd: '2026-03-31',
    });
  });

  it('rebuilds merged footer rows after the data area grows beyond template capacity', () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('补助明细');

    for (let col = 1; col <= 10; col += 1) {
      worksheet.getCell(13, col).value = `模板-${col}`;
    }
    worksheet.getRow(14).height = 24;
    worksheet.getRow(15).height = 32;
    worksheet.getCell('A14').value = `${' '.repeat(88)}合计：`;
    worksheet.getCell('A15').value =
      '设岗单位负责人签字：                制表人签字：测试人                制表人电话：12345678901              制表日期：2026年3月26日';
    worksheet.getCell('I14').numFmt = '0.0';
    worksheet.getCell('A14').font = { name: '宋体', size: 12 };
    worksheet.getCell('A15').font = { name: '宋体', size: 12 };
    worksheet.mergeCells('A14:H14');
    worksheet.mergeCells('A15:J15');

    worksheet.duplicateRow(13, 2, true);

    rebuildSubsidyFooterLayout(
      worksheet,
      14,
      16,
      '设岗单位负责人签字：                制表人签字：测试人                制表人电话：12345678901              制表日期：2026年3月26日',
    );
    worksheet.getCell('I16').value = { formula: 'SUM(I6:I15)' };

    expect([...worksheet.model.merges]).toContain('A16:H16');
    expect([...worksheet.model.merges]).toContain('A17:J17');
    expect(worksheet.getCell('A16').value).toBe(`${' '.repeat(88)}合计：`);
    expect(worksheet.getCell('A17').value).toBe(
      '设岗单位负责人签字：                制表人签字：测试人                制表人电话：12345678901              制表日期：2026年3月26日',
    );
    expect(worksheet.getCell('I16').value).toEqual({ formula: 'SUM(I6:I15)' });
    expect(worksheet.getRow(16).height).toBe(24);
    expect(worksheet.getRow(17).height).toBe(32);
    expect(worksheet.getCell('A16').font).toMatchObject({ name: '宋体', size: 12 });
    expect(worksheet.getCell('A17').font).toMatchObject({ name: '宋体', size: 12 });
  });

  it('exports subsidy workbook with integer amount formatting', async () => {
    const templateBuffer = await readFile(
      fileURLToPath(new URL('../public/subsidy-template.xlsx', import.meta.url)),
    );

    const captured: { blob: Blob | null; clicked: boolean } = {
      blob: null,
      clicked: false,
    };

    const originalFetch = globalThis.fetch;
    const originalCreateObjectURL = globalThis.URL.createObjectURL;
    const originalDocument = globalThis.document;

    globalThis.fetch = async () =>
      new Response(templateBuffer, {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      });

    globalThis.URL.createObjectURL = ((blob: Blob) => {
      captured.blob = blob;
      return 'blob:test-subsidy-export';
    }) as typeof URL.createObjectURL;

    globalThis.document = {
      createElement: () => ({
        href: '',
        download: '',
        click: () => {
          captured.clicked = true;
        },
      }),
    } as unknown as Document;

    try {
      await exportSubsidyDetailsToExcel(
        [
          createEditableSubsidyRow(baseRow),
          updateEditableSubsidyRowHours(createEditableSubsidyRow(baseRow), 16.5),
        ],
        {
          preparerName: '测试人',
          preparerPhone: '12345678901',
          preparedDate: '2026-03-26',
          overLimitNotes: {},
          filename: '2026-03_补助明细表.xlsx',
        },
        new Date('2026-03-26T08:00:00.000Z'),
      );
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.document = originalDocument;
    }

    expect(captured.clicked).toBe(true);
    expect(captured.blob).not.toBeNull();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await captured.blob!.arrayBuffer());
    const worksheet = workbook.worksheets[0];

    expect(worksheet.getCell('I6').value).toBe(285);
    expect(worksheet.getCell('I6').numFmt).toBe('0');
    expect(worksheet.getCell('I7').value).toBe(392);
    expect(worksheet.getCell('I7').numFmt).toBe('0');
    expect(worksheet.getCell('I14').value).toEqual({ formula: 'SUM(I6:I13)' });
    expect(worksheet.getCell('I14').numFmt).toBe('0');
  });
});
