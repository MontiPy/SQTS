import type {
  ProjectScheduleItem,
  SupplierScheduleItemInstance,
  PropagationPolicy,
  PropagationPreview,
  PropagationChangeItem,
  PropagationSkipItem,
  PropagationResult,
} from '../../shared/types';
import { calculateScheduleDates } from '../scheduler';

/**
 * Supplier data bundle needed for propagation preview.
 * This is the interface that the handler layer must provide.
 */
export interface SupplierPropagationData {
  supplierProjectId: number;
  supplierId: number;
  supplierName: string;
  instances: SupplierScheduleItemInstance[];
  /** Map from projectScheduleItemId -> item name */
  itemNames: Map<number, string>;
}

/**
 * Compute the propagation preview for a single project.
 *
 * Pure function: takes data, returns preview. No database access.
 *
 * @param projectId - The project being propagated
 * @param projectScheduleItems - Master schedule items for the project
 * @param milestoneDates - Map of milestone ID -> date string
 * @param suppliers - Array of supplier data bundles
 * @param policy - Propagation protection policy
 */
export function computePropagationPreview(
  projectId: number,
  projectScheduleItems: ProjectScheduleItem[],
  milestoneDates: Map<number, string | null>,
  suppliers: SupplierPropagationData[],
  policy: PropagationPolicy
): PropagationPreview {
  const willChange: PropagationChangeItem[] = [];
  const wontChange: PropagationSkipItem[] = [];

  for (const supplier of suppliers) {
    // Build actual dates map from supplier instances
    const actualDates = new Map<number, string | null>();
    for (const inst of supplier.instances) {
      actualDates.set(inst.projectScheduleItemId, inst.actualDate);
    }

    // Recalculate dates using the scheduler
    const recalculated = calculateScheduleDates(
      projectScheduleItems,
      policy.useBusinessDays,
      actualDates,
      milestoneDates
    );

    // Build lookup: projectScheduleItemId -> recalculated date
    const newDateMap = new Map<number, string | null>();
    for (const item of recalculated) {
      newDateMap.set(item.id, item.plannedDate);
    }

    // Compare each instance
    for (const instance of supplier.instances) {
      const newDate = newDateMap.get(instance.projectScheduleItemId) ?? null;
      const itemName = supplier.itemNames.get(instance.projectScheduleItemId) ?? 'Unknown';
      const baseInfo = {
        instanceId: instance.id,
        supplierProjectId: supplier.supplierProjectId,
        supplierId: supplier.supplierId,
        supplierName: supplier.supplierName,
        projectScheduleItemId: instance.projectScheduleItemId,
        itemName,
        currentDate: instance.plannedDate,
      };

      // Check protection flags
      const skipReason = getSkipReason(instance, policy);
      if (skipReason) {
        wontChange.push({ ...baseInfo, reason: skipReason });
        continue;
      }

      // Check if date actually changed
      if (newDate === instance.plannedDate) {
        wontChange.push({ ...baseInfo, reason: 'No change needed' });
        continue;
      }

      willChange.push({ ...baseInfo, newDate });
    }
  }

  return { projectId, willChange, wontChange };
}

/**
 * Check if an instance should be skipped based on protection policy.
 * Returns the skip reason string or null if not skipped.
 */
function getSkipReason(
  instance: SupplierScheduleItemInstance,
  policy: PropagationPolicy
): string | null {
  if (policy.skipLocked && instance.locked) {
    return 'Locked';
  }
  if (policy.skipOverridden && instance.plannedDateOverride) {
    return 'Manually overridden';
  }
  if (policy.skipComplete && instance.status === 'Complete') {
    return 'Already complete';
  }
  return null;
}

/**
 * Apply propagation changes.
 *
 * This is a pure function that takes the preview and a list of supplier IDs to include,
 * and returns the changes to apply. The actual database updates are handled by the caller.
 *
 * @param preview - The propagation preview
 * @param selectedSupplierIds - Optional set of supplier IDs to include. If null, include all.
 */
export function filterPropagationChanges(
  preview: PropagationPreview,
  selectedSupplierIds?: Set<number> | null
): PropagationResult {
  const updated: PropagationChangeItem[] = [];
  const skipped: PropagationSkipItem[] = [];

  for (const change of preview.willChange) {
    if (selectedSupplierIds && !selectedSupplierIds.has(change.supplierId)) {
      skipped.push({
        ...change,
        reason: 'Supplier excluded from propagation',
      });
    } else {
      updated.push(change);
    }
  }

  // All wontChange items are always skipped
  for (const skip of preview.wontChange) {
    skipped.push(skip);
  }

  return { updated, skipped, errors: [] };
}
