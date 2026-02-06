import { describe, it, expect } from 'vitest';
import { calculateScheduleDates, addDays, validateScheduleItems } from '../electron/scheduler';
import type { ProjectScheduleItem } from '../shared/types';

// Helper to create a schedule item with defaults
function makeItem(overrides: Partial<ProjectScheduleItem> & { id: number; name: string }): ProjectScheduleItem {
  return {
    projectActivityId: 1,
    templateItemId: null,
    kind: 'TASK',
    anchorType: 'FIXED_DATE',
    anchorRefId: null,
    offsetDays: null,
    fixedDate: null,
    overrideDate: null,
    overrideEnabled: false,
    projectMilestoneId: null,
    sortOrder: 0,
    createdAt: '2025-01-01',
    ...overrides,
  };
}

// ============================================================
// addDays
// ============================================================
describe('addDays', () => {
  it('adds calendar days', () => {
    expect(addDays('2025-03-10', 5, false)).toBe('2025-03-15');
  });

  it('subtracts calendar days with negative offset', () => {
    expect(addDays('2025-03-10', -3, false)).toBe('2025-03-07');
  });

  it('returns same date for zero offset', () => {
    expect(addDays('2025-06-15', 0, false)).toBe('2025-06-15');
  });

  it('returns same date for zero offset with business days', () => {
    expect(addDays('2025-06-15', 0, true)).toBe('2025-06-15');
  });

  it('skips weekends with business days (positive)', () => {
    // 2025-03-07 is Friday. +1 business day = Monday 2025-03-10
    expect(addDays('2025-03-07', 1, true)).toBe('2025-03-10');
  });

  it('skips weekends with business days (multiple)', () => {
    // 2025-03-07 is Friday. +3 business days = Wednesday 2025-03-12
    expect(addDays('2025-03-07', 3, true)).toBe('2025-03-12');
  });

  it('skips weekends with business days (negative)', () => {
    // 2025-03-10 is Monday. -1 business day = Friday 2025-03-07
    expect(addDays('2025-03-10', -1, true)).toBe('2025-03-07');
  });

  it('handles crossing month boundary', () => {
    expect(addDays('2025-01-30', 3, false)).toBe('2025-02-02');
  });

  it('handles crossing year boundary', () => {
    expect(addDays('2025-12-30', 5, false)).toBe('2026-01-04');
  });

  it('handles two weeks of business days', () => {
    // 2025-03-03 is Monday. +10 business days skips 2 weekends = Monday 2025-03-17
    expect(addDays('2025-03-03', 10, true)).toBe('2025-03-17');
  });
});

// ============================================================
// calculateScheduleDates
// ============================================================
describe('calculateScheduleDates', () => {
  it('returns empty array for empty input', () => {
    const result = calculateScheduleDates([]);
    expect(result).toEqual([]);
  });

  it('resolves FIXED_DATE items', () => {
    const items = [
      makeItem({ id: 1, name: 'Item A', anchorType: 'FIXED_DATE', fixedDate: '2025-06-01' }),
    ];
    const result = calculateScheduleDates(items);
    expect(result[0].plannedDate).toBe('2025-06-01');
    expect(result[0].error).toBeUndefined();
  });

  it('resolves PROJECT_MILESTONE with offset', () => {
    const items = [
      makeItem({
        id: 1,
        name: 'Before PA3',
        anchorType: 'PROJECT_MILESTONE',
        projectMilestoneId: 100,
        offsetDays: -14,
      }),
    ];
    const milestoneDates = new Map([[100, '2025-06-01']]);
    const result = calculateScheduleDates(items, false, undefined, milestoneDates);
    expect(result[0].plannedDate).toBe('2025-05-18');
  });

  it('resolves PROJECT_MILESTONE with zero offset', () => {
    const items = [
      makeItem({
        id: 1,
        name: 'At PA3',
        anchorType: 'PROJECT_MILESTONE',
        projectMilestoneId: 100,
        offsetDays: 0,
      }),
    ];
    const milestoneDates = new Map([[100, '2025-06-01']]);
    const result = calculateScheduleDates(items, false, undefined, milestoneDates);
    expect(result[0].plannedDate).toBe('2025-06-01');
  });

  it('resolves SCHEDULE_ITEM chain (multi-wave)', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-01-01' }),
      makeItem({ id: 2, name: 'B', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 10 }),
      makeItem({ id: 3, name: 'C', anchorType: 'SCHEDULE_ITEM', anchorRefId: 2, offsetDays: 5 }),
    ];
    const result = calculateScheduleDates(items);
    expect(result[0].plannedDate).toBe('2025-01-01');
    expect(result[1].plannedDate).toBe('2025-01-11');
    expect(result[2].plannedDate).toBe('2025-01-16');
  });

  it('resolves deep dependency chain (5 levels)', () => {
    const items = [
      makeItem({ id: 1, name: 'L1', anchorType: 'FIXED_DATE', fixedDate: '2025-01-01' }),
      makeItem({ id: 2, name: 'L2', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 1 }),
      makeItem({ id: 3, name: 'L3', anchorType: 'SCHEDULE_ITEM', anchorRefId: 2, offsetDays: 1 }),
      makeItem({ id: 4, name: 'L4', anchorType: 'SCHEDULE_ITEM', anchorRefId: 3, offsetDays: 1 }),
      makeItem({ id: 5, name: 'L5', anchorType: 'SCHEDULE_ITEM', anchorRefId: 4, offsetDays: 1 }),
    ];
    const result = calculateScheduleDates(items);
    expect(result[4].plannedDate).toBe('2025-01-05');
  });

  it('resolves COMPLETION with actual date', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-01-01' }),
      makeItem({ id: 2, name: 'B', anchorType: 'COMPLETION', anchorRefId: 1, offsetDays: 5 }),
    ];
    const actualDates = new Map<number, string | null>([[1, '2025-01-10']]);
    const result = calculateScheduleDates(items, false, actualDates);
    expect(result[1].plannedDate).toBe('2025-01-15');
  });

  it('COMPLETION with null actual date resolves to null (not error)', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-01-01' }),
      makeItem({ id: 2, name: 'B', anchorType: 'COMPLETION', anchorRefId: 1, offsetDays: 5 }),
    ];
    const actualDates = new Map<number, string | null>([[1, null]]);
    const result = calculateScheduleDates(items, false, actualDates);
    expect(result[1].plannedDate).toBeNull();
    expect(result[1].error).toBeUndefined();
  });

  it('items downstream of COMPLETION-pending are null (not error)', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-01-01' }),
      makeItem({ id: 2, name: 'B', anchorType: 'COMPLETION', anchorRefId: 1, offsetDays: 5 }),
      makeItem({ id: 3, name: 'C', anchorType: 'SCHEDULE_ITEM', anchorRefId: 2, offsetDays: 3 }),
    ];
    const actualDates = new Map<number, string | null>([[1, null]]);
    const result = calculateScheduleDates(items, false, actualDates);
    expect(result[1].plannedDate).toBeNull();
    expect(result[1].error).toBeUndefined();
    expect(result[2].plannedDate).toBeNull();
    expect(result[2].error).toBeUndefined();
  });

  it('override takes precedence over FIXED_DATE', () => {
    const items = [
      makeItem({
        id: 1,
        name: 'A',
        anchorType: 'FIXED_DATE',
        fixedDate: '2025-01-01',
        overrideEnabled: true,
        overrideDate: '2025-06-15',
      }),
    ];
    const result = calculateScheduleDates(items);
    expect(result[0].plannedDate).toBe('2025-06-15');
  });

  it('override takes precedence over PROJECT_MILESTONE', () => {
    const items = [
      makeItem({
        id: 1,
        name: 'A',
        anchorType: 'PROJECT_MILESTONE',
        projectMilestoneId: 100,
        offsetDays: -14,
        overrideEnabled: true,
        overrideDate: '2025-12-25',
      }),
    ];
    const milestoneDates = new Map([[100, '2025-06-01']]);
    const result = calculateScheduleDates(items, false, undefined, milestoneDates);
    expect(result[0].plannedDate).toBe('2025-12-25');
  });

  it('override takes precedence over SCHEDULE_ITEM', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-01-01' }),
      makeItem({
        id: 2,
        name: 'B',
        anchorType: 'SCHEDULE_ITEM',
        anchorRefId: 1,
        offsetDays: 10,
        overrideEnabled: true,
        overrideDate: '2025-07-04',
      }),
    ];
    const result = calculateScheduleDates(items);
    expect(result[1].plannedDate).toBe('2025-07-04');
  });

  it('override on COMPLETION-anchored item resolves immediately', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-01-01' }),
      makeItem({
        id: 2,
        name: 'B',
        anchorType: 'COMPLETION',
        anchorRefId: 1,
        offsetDays: 5,
        overrideEnabled: true,
        overrideDate: '2025-03-01',
      }),
    ];
    const actualDates = new Map<number, string | null>([[1, null]]);
    const result = calculateScheduleDates(items, false, actualDates);
    expect(result[1].plannedDate).toBe('2025-03-01');
  });

  it('business days in SCHEDULE_ITEM resolution', () => {
    // 2025-03-07 is Friday
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-03-07' }),
      makeItem({ id: 2, name: 'B', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 2 }),
    ];
    const result = calculateScheduleDates(items, true);
    // Friday + 2 business days = Tuesday
    expect(result[1].plannedDate).toBe('2025-03-11');
  });

  it('circular dependency produces error', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'SCHEDULE_ITEM', anchorRefId: 2, offsetDays: 1 }),
      makeItem({ id: 2, name: 'B', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 1 }),
    ];
    const result = calculateScheduleDates(items);
    expect(result[0].plannedDate).toBeNull();
    expect(result[0].error).toContain('circular dependency');
    expect(result[1].plannedDate).toBeNull();
    expect(result[1].error).toContain('circular dependency');
  });

  it('FIXED_DATE with no fixedDate resolves to null', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: null }),
    ];
    const result = calculateScheduleDates(items);
    expect(result[0].plannedDate).toBeNull();
  });

  it('PROJECT_MILESTONE with missing milestone date resolves to null', () => {
    const items = [
      makeItem({
        id: 1,
        name: 'A',
        anchorType: 'PROJECT_MILESTONE',
        projectMilestoneId: 999,
        offsetDays: 0,
      }),
    ];
    const milestoneDates = new Map<number, string | null>();
    const result = calculateScheduleDates(items, false, undefined, milestoneDates);
    expect(result[0].plannedDate).toBeNull();
  });

  it('mixed anchor types in same activity', () => {
    const items = [
      makeItem({ id: 1, name: 'Fixed', anchorType: 'FIXED_DATE', fixedDate: '2025-03-01' }),
      makeItem({
        id: 2,
        name: 'Milestone',
        anchorType: 'PROJECT_MILESTONE',
        projectMilestoneId: 10,
        offsetDays: -7,
      }),
      makeItem({ id: 3, name: 'Chained', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 14 }),
      makeItem({ id: 4, name: 'Completion', anchorType: 'COMPLETION', anchorRefId: 1, offsetDays: 3 }),
    ];
    const milestoneDates = new Map([[10, '2025-06-01']]);
    const actualDates = new Map<number, string | null>([[1, '2025-03-05']]);
    const result = calculateScheduleDates(items, false, actualDates, milestoneDates);

    expect(result[0].plannedDate).toBe('2025-03-01');
    expect(result[1].plannedDate).toBe('2025-05-25');
    expect(result[2].plannedDate).toBe('2025-03-15');
    expect(result[3].plannedDate).toBe('2025-03-08');
  });

  it('preserves original item order in output', () => {
    const items = [
      makeItem({ id: 3, name: 'C', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 5 }),
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-01-01' }),
      makeItem({ id: 2, name: 'B', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 2 }),
    ];
    const result = calculateScheduleDates(items);
    expect(result[0].id).toBe(3);
    expect(result[1].id).toBe(1);
    expect(result[2].id).toBe(2);
    expect(result[0].plannedDate).toBe('2025-01-06');
    expect(result[1].plannedDate).toBe('2025-01-01');
    expect(result[2].plannedDate).toBe('2025-01-03');
  });

  it('negative offset on SCHEDULE_ITEM', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-06-15' }),
      makeItem({ id: 2, name: 'B', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: -10 }),
    ];
    const result = calculateScheduleDates(items);
    expect(result[1].plannedDate).toBe('2025-06-05');
  });

  it('null offsetDays treated as 0', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-01-01' }),
      makeItem({ id: 2, name: 'B', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: null }),
    ];
    const result = calculateScheduleDates(items);
    expect(result[1].plannedDate).toBe('2025-01-01');
  });
});

// ============================================================
// validateScheduleItems
// ============================================================
describe('validateScheduleItems', () => {
  it('returns no errors for valid items', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'FIXED_DATE', fixedDate: '2025-01-01' }),
      makeItem({ id: 2, name: 'B', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 5 }),
    ];
    expect(validateScheduleItems(items)).toEqual([]);
  });

  it('detects self-reference', () => {
    const items = [
      makeItem({ id: 1, name: 'SelfRef', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 5 }),
    ];
    const errors = validateScheduleItems(items);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some(e => e.includes('references itself'))).toBe(true);
  });

  it('detects non-existent reference', () => {
    const items = [
      makeItem({ id: 1, name: 'Orphan', anchorType: 'SCHEDULE_ITEM', anchorRefId: 999, offsetDays: 5 }),
    ];
    const errors = validateScheduleItems(items);
    expect(errors.some(e => e.includes('non-existent'))).toBe(true);
  });

  it('detects FIXED_DATE with no date', () => {
    const items = [
      makeItem({ id: 1, name: 'NoDate', anchorType: 'FIXED_DATE', fixedDate: null }),
    ];
    const errors = validateScheduleItems(items);
    expect(errors.some(e => e.includes('no date set'))).toBe(true);
  });

  it('does not error on FIXED_DATE with no date if override enabled', () => {
    const items = [
      makeItem({
        id: 1,
        name: 'Override',
        anchorType: 'FIXED_DATE',
        fixedDate: null,
        overrideEnabled: true,
        overrideDate: '2025-01-01',
      }),
    ];
    expect(validateScheduleItems(items)).toEqual([]);
  });

  it('detects PROJECT_MILESTONE with no milestone ID', () => {
    const items = [
      makeItem({
        id: 1,
        name: 'NoMilestone',
        anchorType: 'PROJECT_MILESTONE',
        projectMilestoneId: null,
      }),
    ];
    const errors = validateScheduleItems(items);
    expect(errors.some(e => e.includes('no milestone reference'))).toBe(true);
  });

  it('detects circular dependency (A -> B -> A)', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'SCHEDULE_ITEM', anchorRefId: 2, offsetDays: 1 }),
      makeItem({ id: 2, name: 'B', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 1 }),
    ];
    const errors = validateScheduleItems(items);
    expect(errors.some(e => e.includes('Circular dependency'))).toBe(true);
  });

  it('detects circular dependency (A -> B -> C -> A)', () => {
    const items = [
      makeItem({ id: 1, name: 'A', anchorType: 'SCHEDULE_ITEM', anchorRefId: 3, offsetDays: 1 }),
      makeItem({ id: 2, name: 'B', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 1 }),
      makeItem({ id: 3, name: 'C', anchorType: 'SCHEDULE_ITEM', anchorRefId: 2, offsetDays: 1 }),
    ];
    const errors = validateScheduleItems(items);
    expect(errors.some(e => e.includes('Circular dependency'))).toBe(true);
  });
});
