import { describe, it, expect } from 'vitest';
import { computePropagationPreview, filterPropagationChanges } from '../electron/engine/propagation';
import type { SupplierPropagationData } from '../electron/engine/propagation';
import type {
  ProjectScheduleItem,
  SupplierScheduleItemInstance,
  PropagationPolicy,
} from '../shared/types';

// Helper to create a ProjectScheduleItem
function makePSI(overrides: Partial<ProjectScheduleItem> & { id: number; name: string }): ProjectScheduleItem {
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

// Helper to create a SupplierScheduleItemInstance
function makeInstance(
  overrides: Partial<SupplierScheduleItemInstance> & { id: number; projectScheduleItemId: number }
): SupplierScheduleItemInstance {
  return {
    supplierActivityInstanceId: 1,
    plannedDate: null,
    actualDate: null,
    status: 'Not Started',
    plannedDateOverride: false,
    scopeOverride: null,
    locked: false,
    notes: null,
    createdAt: '2025-01-01',
    ...overrides,
  };
}

const defaultPolicy: PropagationPolicy = {
  skipComplete: true,
  skipLocked: true,
  skipOverridden: true,
  useBusinessDays: false,
};

function makeSupplier(
  id: number,
  name: string,
  instances: SupplierScheduleItemInstance[],
  itemNames: Map<number, string>
): SupplierPropagationData {
  return {
    supplierProjectId: id * 100,
    supplierId: id,
    supplierName: name,
    instances,
    itemNames,
  };
}

// ============================================================
// computePropagationPreview
// ============================================================
describe('computePropagationPreview', () => {
  it('detects date changes', () => {
    const psi = [makePSI({ id: 1, name: 'Task A', fixedDate: '2025-07-01' })];
    const itemNames = new Map([[1, 'Task A']]);
    const instances = [makeInstance({ id: 10, projectScheduleItemId: 1, plannedDate: '2025-06-01' })];
    const supplier = makeSupplier(1, 'Acme', instances, itemNames);

    const preview = computePropagationPreview(1, psi, new Map(), [supplier], defaultPolicy);
    expect(preview.willChange).toHaveLength(1);
    expect(preview.willChange[0].newDate).toBe('2025-07-01');
    expect(preview.willChange[0].currentDate).toBe('2025-06-01');
  });

  it('skips locked items', () => {
    const psi = [makePSI({ id: 1, name: 'Task A', fixedDate: '2025-07-01' })];
    const itemNames = new Map([[1, 'Task A']]);
    const instances = [
      makeInstance({ id: 10, projectScheduleItemId: 1, plannedDate: '2025-06-01', locked: true }),
    ];
    const supplier = makeSupplier(1, 'Acme', instances, itemNames);

    const preview = computePropagationPreview(1, psi, new Map(), [supplier], defaultPolicy);
    expect(preview.willChange).toHaveLength(0);
    expect(preview.wontChange).toHaveLength(1);
    expect(preview.wontChange[0].reason).toBe('Locked');
  });

  it('skips overridden items', () => {
    const psi = [makePSI({ id: 1, name: 'Task A', fixedDate: '2025-07-01' })];
    const itemNames = new Map([[1, 'Task A']]);
    const instances = [
      makeInstance({
        id: 10,
        projectScheduleItemId: 1,
        plannedDate: '2025-06-01',
        plannedDateOverride: true,
      }),
    ];
    const supplier = makeSupplier(1, 'Acme', instances, itemNames);

    const preview = computePropagationPreview(1, psi, new Map(), [supplier], defaultPolicy);
    expect(preview.willChange).toHaveLength(0);
    expect(preview.wontChange[0].reason).toBe('Manually overridden');
  });

  it('skips complete items', () => {
    const psi = [makePSI({ id: 1, name: 'Task A', fixedDate: '2025-07-01' })];
    const itemNames = new Map([[1, 'Task A']]);
    const instances = [
      makeInstance({
        id: 10,
        projectScheduleItemId: 1,
        plannedDate: '2025-06-01',
        status: 'Complete',
      }),
    ];
    const supplier = makeSupplier(1, 'Acme', instances, itemNames);

    const preview = computePropagationPreview(1, psi, new Map(), [supplier], defaultPolicy);
    expect(preview.willChange).toHaveLength(0);
    expect(preview.wontChange[0].reason).toBe('Already complete');
  });

  it('does not skip locked items when policy.skipLocked is false', () => {
    const psi = [makePSI({ id: 1, name: 'Task A', fixedDate: '2025-07-01' })];
    const itemNames = new Map([[1, 'Task A']]);
    const instances = [
      makeInstance({ id: 10, projectScheduleItemId: 1, plannedDate: '2025-06-01', locked: true }),
    ];
    const supplier = makeSupplier(1, 'Acme', instances, itemNames);
    const policy = { ...defaultPolicy, skipLocked: false };

    const preview = computePropagationPreview(1, psi, new Map(), [supplier], policy);
    expect(preview.willChange).toHaveLength(1);
  });

  it('reports no change when dates match', () => {
    const psi = [makePSI({ id: 1, name: 'Task A', fixedDate: '2025-06-01' })];
    const itemNames = new Map([[1, 'Task A']]);
    const instances = [makeInstance({ id: 10, projectScheduleItemId: 1, plannedDate: '2025-06-01' })];
    const supplier = makeSupplier(1, 'Acme', instances, itemNames);

    const preview = computePropagationPreview(1, psi, new Map(), [supplier], defaultPolicy);
    expect(preview.willChange).toHaveLength(0);
    expect(preview.wontChange).toHaveLength(1);
    expect(preview.wontChange[0].reason).toBe('No change needed');
  });

  it('handles multiple suppliers with mixed protections', () => {
    const psi = [makePSI({ id: 1, name: 'Task A', fixedDate: '2025-07-01' })];
    const itemNames = new Map([[1, 'Task A']]);

    const supplierA = makeSupplier(1, 'Acme', [
      makeInstance({ id: 10, projectScheduleItemId: 1, plannedDate: '2025-06-01' }),
    ], itemNames);
    const supplierB = makeSupplier(2, 'Beta', [
      makeInstance({ id: 20, projectScheduleItemId: 1, plannedDate: '2025-06-01', locked: true }),
    ], itemNames);
    const supplierC = makeSupplier(3, 'Gamma', [
      makeInstance({ id: 30, projectScheduleItemId: 1, plannedDate: '2025-06-01', status: 'Complete' }),
    ], itemNames);

    const preview = computePropagationPreview(1, psi, new Map(), [supplierA, supplierB, supplierC], defaultPolicy);
    expect(preview.willChange).toHaveLength(1);
    expect(preview.willChange[0].supplierName).toBe('Acme');
    expect(preview.wontChange).toHaveLength(2);
  });

  it('handles empty supplier list', () => {
    const psi = [makePSI({ id: 1, name: 'Task A', fixedDate: '2025-07-01' })];
    const preview = computePropagationPreview(1, psi, new Map(), [], defaultPolicy);
    expect(preview.willChange).toHaveLength(0);
    expect(preview.wontChange).toHaveLength(0);
  });

  it('uses milestone dates for recalculation', () => {
    const psi = [
      makePSI({ id: 1, name: 'Before PA3', anchorType: 'PROJECT_MILESTONE', projectMilestoneId: 100, offsetDays: -7 }),
    ];
    const milestoneDates = new Map<number, string | null>([[100, '2025-08-01']]);
    const itemNames = new Map([[1, 'Before PA3']]);
    const instances = [makeInstance({ id: 10, projectScheduleItemId: 1, plannedDate: '2025-06-01' })];
    const supplier = makeSupplier(1, 'Acme', instances, itemNames);

    const preview = computePropagationPreview(1, psi, milestoneDates, [supplier], defaultPolicy);
    expect(preview.willChange).toHaveLength(1);
    expect(preview.willChange[0].newDate).toBe('2025-07-25');
  });

  it('uses business days when policy says so', () => {
    // 2025-03-07 is Friday. FIXED_DATE Friday, then SCHEDULE_ITEM +2 business days = Tuesday
    const psi = [
      makePSI({ id: 1, name: 'A', fixedDate: '2025-03-07' }),
      makePSI({ id: 2, name: 'B', anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 2 }),
    ];
    const itemNames = new Map([[1, 'A'], [2, 'B']]);
    const instances = [
      makeInstance({ id: 10, projectScheduleItemId: 1, plannedDate: '2025-03-07' }),
      makeInstance({ id: 20, projectScheduleItemId: 2, plannedDate: '2025-03-09' }), // old: calendar days
    ];
    const supplier = makeSupplier(1, 'Acme', instances, itemNames);
    const policy = { ...defaultPolicy, useBusinessDays: true };

    const preview = computePropagationPreview(1, psi, new Map(), [supplier], policy);
    // Item 2: Friday +2 biz days = Tuesday March 11. Old was March 9. Should change.
    const item2Change = preview.willChange.find(c => c.projectScheduleItemId === 2);
    expect(item2Change).toBeDefined();
    expect(item2Change!.newDate).toBe('2025-03-11');
  });

  it('handles COMPLETION-anchored items with actual dates from supplier', () => {
    const psi = [
      makePSI({ id: 1, name: 'A', fixedDate: '2025-01-01' }),
      makePSI({ id: 2, name: 'B', anchorType: 'COMPLETION', anchorRefId: 1, offsetDays: 5 }),
    ];
    const itemNames = new Map([[1, 'A'], [2, 'B']]);
    const instances = [
      makeInstance({ id: 10, projectScheduleItemId: 1, plannedDate: '2025-01-01', actualDate: '2025-01-10' }),
      makeInstance({ id: 20, projectScheduleItemId: 2, plannedDate: '2025-01-20' }),
    ];
    const supplier = makeSupplier(1, 'Acme', instances, itemNames);

    const preview = computePropagationPreview(1, psi, new Map(), [supplier], defaultPolicy);
    const item2 = preview.willChange.find(c => c.projectScheduleItemId === 2);
    expect(item2).toBeDefined();
    expect(item2!.newDate).toBe('2025-01-15'); // actual 1/10 + 5 days
  });
});

// ============================================================
// filterPropagationChanges
// ============================================================
describe('filterPropagationChanges', () => {
  it('includes all suppliers when no selection provided', () => {
    const preview = {
      projectId: 1,
      willChange: [
        { instanceId: 10, supplierProjectId: 100, supplierId: 1, supplierName: 'Acme', projectScheduleItemId: 1, itemName: 'A', currentDate: '2025-01-01', newDate: '2025-02-01' },
        { instanceId: 20, supplierProjectId: 200, supplierId: 2, supplierName: 'Beta', projectScheduleItemId: 1, itemName: 'A', currentDate: '2025-01-01', newDate: '2025-02-01' },
      ],
      wontChange: [],
    };

    const result = filterPropagationChanges(preview);
    expect(result.updated).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });

  it('excludes unselected suppliers', () => {
    const preview = {
      projectId: 1,
      willChange: [
        { instanceId: 10, supplierProjectId: 100, supplierId: 1, supplierName: 'Acme', projectScheduleItemId: 1, itemName: 'A', currentDate: '2025-01-01', newDate: '2025-02-01' },
        { instanceId: 20, supplierProjectId: 200, supplierId: 2, supplierName: 'Beta', projectScheduleItemId: 1, itemName: 'A', currentDate: '2025-01-01', newDate: '2025-02-01' },
      ],
      wontChange: [],
    };

    const result = filterPropagationChanges(preview, new Set([1]));
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].supplierName).toBe('Acme');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('Supplier excluded from propagation');
  });

  it('passes through wontChange items as skipped', () => {
    const preview = {
      projectId: 1,
      willChange: [],
      wontChange: [
        { instanceId: 10, supplierProjectId: 100, supplierId: 1, supplierName: 'Acme', projectScheduleItemId: 1, itemName: 'A', currentDate: '2025-01-01', reason: 'Locked' },
      ],
    };

    const result = filterPropagationChanges(preview);
    expect(result.updated).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('Locked');
  });

  it('includes all when null selection', () => {
    const preview = {
      projectId: 1,
      willChange: [
        { instanceId: 10, supplierProjectId: 100, supplierId: 1, supplierName: 'Acme', projectScheduleItemId: 1, itemName: 'A', currentDate: '2025-01-01', newDate: '2025-02-01' },
      ],
      wontChange: [],
    };

    const result = filterPropagationChanges(preview, null);
    expect(result.updated).toHaveLength(1);
  });

  it('returns empty errors array', () => {
    const preview = { projectId: 1, willChange: [], wontChange: [] };
    const result = filterPropagationChanges(preview);
    expect(result.errors).toEqual([]);
  });
});
