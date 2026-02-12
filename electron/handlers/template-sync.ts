import { ipcMain } from 'electron';
import { query, queryOne, run, withTransaction } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import { computeTemplateSyncPreview } from '../engine/template-sync';
import type {
  ActivityTemplate,
  ActivityTemplateScheduleItem,
  ProjectActivity,
  ProjectScheduleItem,
  TemplateSyncPreview,
} from '@shared/types';

interface OutOfSyncActivity {
  id: number;
  templateVersion: number;
  latestVersion: number;
  templateName: string;
}

export function registerTemplateSyncHandlers() {
  // Check which project activities are out of sync with their templates
  ipcMain.handle('template-sync:check-out-of-sync', async (_, projectId: number) => {
    try {
      const outOfSync = query<OutOfSyncActivity>(`
        SELECT pa.id, pa.template_version, at.version as latest_version, at.name as template_name
        FROM project_activities pa
        JOIN activity_templates at ON pa.activity_template_id = at.id
        WHERE pa.project_id = ? AND pa.template_version != at.version
      `, [projectId]);
      return createSuccessResponse(outOfSync);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Preview what changes would be applied if syncing a project activity to its template
  ipcMain.handle('template-sync:preview', async (_, projectActivityId: number) => {
    try {
      const pa = queryOne<ProjectActivity & { activityTemplateId: number }>(
        'SELECT * FROM project_activities WHERE id = ?',
        [projectActivityId]
      );
      if (!pa) {
        return createErrorResponse('Project activity not found');
      }

      const template = queryOne<ActivityTemplate>(
        'SELECT * FROM activity_templates WHERE id = ?',
        [pa.activityTemplateId]
      );
      if (!template) {
        return createErrorResponse('Activity template not found');
      }

      // Get current project schedule items for this activity
      const projectItems = query<ProjectScheduleItem>(
        'SELECT * FROM project_schedule_items WHERE project_activity_id = ? ORDER BY sort_order',
        [projectActivityId]
      );

      // Get current template schedule items
      const templateItems = query<ActivityTemplateScheduleItem>(
        'SELECT * FROM activity_template_schedule_items WHERE activity_template_id = ? ORDER BY sort_order',
        [pa.activityTemplateId]
      );

      const changes = computeTemplateSyncPreview(projectItems, templateItems);

      const preview: TemplateSyncPreview = {
        projectActivityId,
        templateId: pa.activityTemplateId,
        templateName: template.name,
        currentVersion: pa.templateVersion,
        latestVersion: template.version,
        changes,
      };

      return createSuccessResponse(preview);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Apply template sync - update project schedule items to match current template
  ipcMain.handle('template-sync:apply', async (_, projectActivityId: number) => {
    try {
      return await withTransaction(async () => {
        const pa = queryOne<ProjectActivity & { activityTemplateId: number }>(
          'SELECT * FROM project_activities WHERE id = ?',
          [projectActivityId]
        );
        if (!pa) {
          throw new Error('Project activity not found');
        }

        const template = queryOne<ActivityTemplate>(
          'SELECT * FROM activity_templates WHERE id = ?',
          [pa.activityTemplateId]
        );
        if (!template) {
          throw new Error('Activity template not found');
        }

        // Get current project schedule items
        const projectItems = query<ProjectScheduleItem>(
          'SELECT * FROM project_schedule_items WHERE project_activity_id = ? ORDER BY sort_order',
          [projectActivityId]
        );

        // Get current template schedule items
        const templateItems = query<ActivityTemplateScheduleItem>(
          'SELECT * FROM activity_template_schedule_items WHERE activity_template_id = ? ORDER BY sort_order',
          [pa.activityTemplateId]
        );

        // Index project items by template_item_id
        const projectByTemplateItemId = new Map<number, ProjectScheduleItem>();
        for (const item of projectItems) {
          if (item.templateItemId != null) {
            projectByTemplateItemId.set(item.templateItemId, item);
          }
        }

        // Index template items by id
        const templateById = new Map<number, ActivityTemplateScheduleItem>();
        for (const tItem of templateItems) {
          templateById.set(tItem.id, tItem);
        }

        // (a) Delete project schedule items whose template_item_id no longer exists in template
        for (const pItem of projectItems) {
          if (pItem.templateItemId != null && !templateById.has(pItem.templateItemId)) {
            run('DELETE FROM project_schedule_items WHERE id = ?', [pItem.id]);
          }
        }

        // (b) Add new template items as project schedule items
        // Two-pass: first insert without anchors, then wire anchor_ref_id using ID map
        const templateItemIdToProjectItemId = new Map<number, number>();

        // Carry over existing mappings
        for (const pItem of projectItems) {
          if (pItem.templateItemId != null && templateById.has(pItem.templateItemId)) {
            templateItemIdToProjectItemId.set(pItem.templateItemId, pItem.id);
          }
        }

        // First pass: insert new items without anchor_ref_id
        const newTemplateItemIds: number[] = [];
        for (const tItem of templateItems) {
          if (!projectByTemplateItemId.has(tItem.id)) {
            run(
              `INSERT INTO project_schedule_items
               (project_activity_id, template_item_id, kind, name, anchor_type, anchor_ref_id, offset_days, fixed_date, sort_order)
               VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
              [projectActivityId, tItem.id, tItem.kind, tItem.name, tItem.anchorType, tItem.offsetDays, tItem.fixedDate, tItem.sortOrder]
            );
            const newItem = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!;
            templateItemIdToProjectItemId.set(tItem.id, newItem.id);
            newTemplateItemIds.push(tItem.id);
          }
        }

        // Second pass: wire anchor_ref_id for newly added items
        for (const tItemId of newTemplateItemIds) {
          const tItem = templateById.get(tItemId)!;
          if (tItem.anchorRefId != null) {
            const newAnchorRefId = templateItemIdToProjectItemId.get(tItem.anchorRefId);
            if (newAnchorRefId != null) {
              const newProjectItemId = templateItemIdToProjectItemId.get(tItemId);
              run(
                'UPDATE project_schedule_items SET anchor_ref_id = ? WHERE id = ?',
                [newAnchorRefId, newProjectItemId]
              );
            }
          }
        }

        // (c) Update existing items where name/kind/anchorType/offsetDays changed
        for (const tItem of templateItems) {
          const pItem = projectByTemplateItemId.get(tItem.id);
          if (!pItem) continue;

          const needsUpdate =
            pItem.name !== tItem.name ||
            pItem.kind !== tItem.kind ||
            pItem.anchorType !== tItem.anchorType ||
            pItem.offsetDays !== tItem.offsetDays;

          if (needsUpdate) {
            // Resolve anchor_ref_id from template to project item
            let newAnchorRefId: number | null = null;
            if (tItem.anchorRefId != null) {
              newAnchorRefId = templateItemIdToProjectItemId.get(tItem.anchorRefId) ?? null;
            }

            run(
              `UPDATE project_schedule_items
               SET name = ?, kind = ?, anchor_type = ?, anchor_ref_id = ?, offset_days = ?, sort_order = ?
               WHERE id = ?`,
              [tItem.name, tItem.kind, tItem.anchorType, newAnchorRefId, tItem.offsetDays, tItem.sortOrder, pItem.id]
            );
          }
        }

        // (d) Update project_activities.template_version to latest
        run(
          'UPDATE project_activities SET template_version = ? WHERE id = ?',
          [template.version, projectActivityId]
        );

        // (e) Return updated project activity
        const updatedPa = queryOne<ProjectActivity>(
          'SELECT * FROM project_activities WHERE id = ?',
          [projectActivityId]
        );

        createAuditEvent('project_activity', projectActivityId, 'template_sync', {
          templateId: pa.activityTemplateId,
          fromVersion: pa.templateVersion,
          toVersion: template.version,
        });

        return createSuccessResponse(updatedPa);
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
}
