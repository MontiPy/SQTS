import type { ProjectScheduleItem, ScheduleItemWithDates } from '../shared/types';

/**
 * Add calendar or business days to a date string.
 * Returns YYYY-MM-DD string.
 */
export function addDays(
  dateString: string,
  offsetDays: number,
  useBusinessDays: boolean
): string {
  const date = new Date(dateString + 'T00:00:00'); // Local time, avoid TZ shifts

  if (!useBusinessDays || offsetDays === 0) {
    date.setDate(date.getDate() + offsetDays);
  } else {
    const direction = offsetDays >= 0 ? 1 : -1;
    let remaining = Math.abs(offsetDays);
    while (remaining > 0) {
      date.setDate(date.getDate() + direction);
      const day = date.getDay();
      if (day !== 0 && day !== 6) {
        remaining--;
      }
    }
  }

  return formatDateISO(date);
}

/** Format a Date object as YYYY-MM-DD */
function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Attempt to compute the planned date for a single schedule item.
 * Returns the date string if resolvable, or null if dependencies aren't ready yet.
 */
function calculatePlannedDate(
  item: ProjectScheduleItem,
  resolvedDates: Map<number, string>,
  useBusinessDays: boolean,
  actualDates?: Map<number, string | null>,
  milestoneDates?: Map<number, string | null>
): string | null {
  // Override takes absolute precedence
  if (item.overrideEnabled && item.overrideDate) {
    return item.overrideDate;
  }

  switch (item.anchorType) {
    case 'FIXED_DATE': {
      return item.fixedDate ?? null;
    }

    case 'PROJECT_MILESTONE': {
      if (item.projectMilestoneId == null) return null;
      const milestoneDate = milestoneDates?.get(item.projectMilestoneId) ?? null;
      if (milestoneDate == null) return null;
      return addDays(milestoneDate, item.offsetDays ?? 0, useBusinessDays);
    }

    case 'SCHEDULE_ITEM': {
      if (item.anchorRefId == null) return null;
      const refDate = resolvedDates.get(item.anchorRefId);
      if (refDate == null) return null; // Dependency not yet resolved
      return addDays(refDate, item.offsetDays ?? 0, useBusinessDays);
    }

    case 'COMPLETION': {
      if (item.anchorRefId == null) return null;
      const completionDate = actualDates?.get(item.anchorRefId) ?? null;
      // COMPLETION with no actual date -> null (not error). Expected behavior.
      if (completionDate == null) return null;
      return addDays(completionDate, item.offsetDays ?? 0, useBusinessDays);
    }

    default:
      return null;
  }
}

/**
 * Wave-based iterative scheduler.
 *
 * Resolves dates for all schedule items by iterating in waves:
 *   Wave 1: FIXED_DATE and PROJECT_MILESTONE (no item dependencies)
 *   Wave N: Items whose dependencies resolved in prior waves
 *   Termination: All resolved, or no progress (circular dependency).
 *
 * COMPLETION anchors with null actual dates resolve to null (not error).
 */
export function calculateScheduleDates(
  scheduleItems: ProjectScheduleItem[],
  useBusinessDays: boolean = false,
  actualDates?: Map<number, string | null>,
  milestoneDates?: Map<number, string | null>
): ScheduleItemWithDates[] {
  const resolvedDates = new Map<number, string>();
  const resultMap = new Map<number, ScheduleItemWithDates>();
  const unprocessed = new Set(scheduleItems.map(item => item.id));

  // Track COMPLETION-anchored items whose anchor has no actual date.
  // These are "pending completion", not circular dependency errors.
  const completionPending = new Set<number>();

  // Identify COMPLETION items that cannot resolve because actual date is missing
  for (const item of scheduleItems) {
    if (item.overrideEnabled && item.overrideDate) continue;
    if (item.anchorType === 'COMPLETION' && item.anchorRefId != null) {
      const completionDate = actualDates?.get(item.anchorRefId) ?? null;
      if (completionDate == null) {
        completionPending.add(item.id);
      }
    }
  }

  // Wave loop
  while (unprocessed.size > 0) {
    let progress = false;

    for (const item of scheduleItems) {
      if (!unprocessed.has(item.id)) continue;

      // Skip COMPLETION-pending items - they can't resolve
      if (completionPending.has(item.id)) continue;

      const date = calculatePlannedDate(
        item,
        resolvedDates,
        useBusinessDays,
        actualDates,
        milestoneDates
      );

      if (date !== null) {
        resolvedDates.set(item.id, date);
        unprocessed.delete(item.id);
        progress = true;
        resultMap.set(item.id, { ...item, plannedDate: date });
      }
    }

    if (!progress) {
      // No progress - mark remaining as either pending-completion or circular dependency
      for (const item of scheduleItems) {
        if (unprocessed.has(item.id)) {
          if (completionPending.has(item.id)) {
            resultMap.set(item.id, {
              ...item,
              plannedDate: null,
              error: undefined, // Pending completion is NOT an error
            });
          } else {
            // Check if blocked by a completion-pending item (transitive)
            const isBlockedByCompletion = isTransitivelyBlockedByCompletion(
              item,
              scheduleItems,
              completionPending,
              resolvedDates
            );
            if (isBlockedByCompletion) {
              resultMap.set(item.id, {
                ...item,
                plannedDate: null,
                error: undefined,
              });
            } else {
              resultMap.set(item.id, {
                ...item,
                plannedDate: null,
                error: 'Cannot compute date - circular dependency or missing anchor',
              });
            }
          }
        }
      }
      break;
    }
  }

  // Return in original order, filling in any items not in resultMap
  return scheduleItems.map(
    item =>
      resultMap.get(item.id) ?? { ...item, plannedDate: null }
  );
}

/**
 * Check if an unresolved item is transitively blocked by a COMPLETION-pending item.
 * If so, it's not a circular dependency error - just waiting for completion.
 */
function isTransitivelyBlockedByCompletion(
  item: ProjectScheduleItem,
  allItems: ProjectScheduleItem[],
  completionPending: Set<number>,
  resolvedDates: Map<number, string>
): boolean {
  if (item.anchorRefId == null) return false;

  const visited = new Set<number>();
  const stack = [item.anchorRefId];

  while (stack.length > 0) {
    const refId = stack.pop()!;
    if (visited.has(refId)) continue;
    visited.add(refId);

    if (completionPending.has(refId)) return true;

    // If not resolved, follow its dependency
    if (!resolvedDates.has(refId)) {
      const refItem = allItems.find(i => i.id === refId);
      if (refItem?.anchorRefId != null) {
        stack.push(refItem.anchorRefId);
      }
    }
  }

  return false;
}

/**
 * Validate schedule items for circular dependencies and configuration errors.
 * Returns an array of error messages (empty if valid).
 */
export function validateScheduleItems(items: ProjectScheduleItem[]): string[] {
  const errors: string[] = [];
  const itemMap = new Map(items.map(i => [i.id, i]));

  for (const item of items) {
    // Self-reference check
    if (
      (item.anchorType === 'SCHEDULE_ITEM' || item.anchorType === 'COMPLETION') &&
      item.anchorRefId === item.id
    ) {
      errors.push(`"${item.name}" references itself`);
      continue;
    }

    // Reference exists check
    if (
      (item.anchorType === 'SCHEDULE_ITEM' || item.anchorType === 'COMPLETION') &&
      item.anchorRefId != null &&
      !itemMap.has(item.anchorRefId)
    ) {
      errors.push(`"${item.name}" references a non-existent schedule item (ID ${item.anchorRefId})`);
    }

    // FIXED_DATE must have fixedDate
    if (item.anchorType === 'FIXED_DATE' && !item.fixedDate && !item.overrideEnabled) {
      errors.push(`"${item.name}" is FIXED_DATE but has no date set`);
    }

    // PROJECT_MILESTONE must have milestoneId
    if (item.anchorType === 'PROJECT_MILESTONE' && item.projectMilestoneId == null && !item.overrideEnabled) {
      errors.push(`"${item.name}" is PROJECT_MILESTONE but has no milestone reference`);
    }
  }

  // Cycle detection using DFS for SCHEDULE_ITEM anchors
  const cycleItems = items.filter(i => i.anchorType === 'SCHEDULE_ITEM' && i.anchorRefId != null);
  const visiting = new Set<number>();
  const visited = new Set<number>();

  function hasCycle(id: number): boolean {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;

    visiting.add(id);
    const item = itemMap.get(id);
    if (item?.anchorType === 'SCHEDULE_ITEM' && item.anchorRefId != null) {
      if (hasCycle(item.anchorRefId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const item of cycleItems) {
    visiting.clear();
    visited.clear();
    if (hasCycle(item.id)) {
      errors.push(`Circular dependency detected involving "${item.name}"`);
    }
  }

  return errors;
}
