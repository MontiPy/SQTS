import type {
  ActivityTemplateScheduleItem,
  ProjectScheduleItem,
  TemplateSyncChange,
} from '../../shared/types';

/**
 * Compare template schedule items with project schedule items (by templateItemId)
 * and produce a list of changes needed to sync the project to the template.
 *
 * Pure function: no database access.
 */
export function computeTemplateSyncPreview(
  currentItems: ProjectScheduleItem[],
  templateItems: ActivityTemplateScheduleItem[]
): TemplateSyncChange[] {
  const changes: TemplateSyncChange[] = [];

  // Index project items by their template_item_id
  const projectByTemplateItemId = new Map<number, ProjectScheduleItem>();
  for (const item of currentItems) {
    if (item.templateItemId != null) {
      projectByTemplateItemId.set(item.templateItemId, item);
    }
  }

  // Index template items by id
  const templateById = new Map<number, ActivityTemplateScheduleItem>();
  for (const item of templateItems) {
    templateById.set(item.id, item);
  }

  // Check for items in template but not in project -> 'add'
  for (const tItem of templateItems) {
    if (!projectByTemplateItemId.has(tItem.id)) {
      changes.push({
        type: 'add',
        itemName: tItem.name,
        details: `New ${tItem.kind.toLowerCase()} "${tItem.name}" will be added`,
      });
    }
  }

  // Check for items in project linked to template items that no longer exist -> 'remove'
  for (const pItem of currentItems) {
    if (pItem.templateItemId != null && !templateById.has(pItem.templateItemId)) {
      changes.push({
        type: 'remove',
        itemName: pItem.name,
        details: `"${pItem.name}" no longer exists in the template and will be removed`,
      });
    }
  }

  // Check for items where name, kind, anchorType, or offsetDays differ -> 'update'
  for (const tItem of templateItems) {
    const pItem = projectByTemplateItemId.get(tItem.id);
    if (!pItem) continue;

    const diffs: string[] = [];

    if (pItem.name !== tItem.name) {
      diffs.push(`name: "${pItem.name}" -> "${tItem.name}"`);
    }
    if (pItem.kind !== tItem.kind) {
      diffs.push(`kind: ${pItem.kind} -> ${tItem.kind}`);
    }
    if (pItem.anchorType !== tItem.anchorType) {
      diffs.push(`anchor: ${pItem.anchorType} -> ${tItem.anchorType}`);
    }
    if (pItem.offsetDays !== tItem.offsetDays) {
      diffs.push(`offset: ${pItem.offsetDays ?? 'none'} -> ${tItem.offsetDays ?? 'none'}`);
    }

    if (diffs.length > 0) {
      changes.push({
        type: 'update',
        itemName: tItem.name,
        details: diffs.join('; '),
      });
    }
  }

  return changes;
}
