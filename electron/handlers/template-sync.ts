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
  ProjectTemplateStatus,
  BatchApplyResult,
  TemplateOutOfSyncActivity,
  BatchSyncResult,
} from '@shared/types';

interface OutOfSyncActivity {
  id: number;
  templateVersion: number;
  latestVersion: number;
  templateName: string;
}

/**
 * Core sync logic extracted from template-sync:apply.
 * Syncs a single project activity's schedule items to match the current template.
 * Must be called inside a transaction.
 * Returns { fromVersion, toVersion } on success.
 */
function applySyncForSingleProjectActivity(
  projectActivityId: number
): { fromVersion: number; toVersion: number } {
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

  const fromVersion = pa.templateVersion;
  const toVersion = template.version;

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

  createAuditEvent('project_activity', projectActivityId, 'template_sync', {
    templateId: pa.activityTemplateId,
    fromVersion,
    toVersion,
  });

  return { fromVersion, toVersion };
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
        applySyncForSingleProjectActivity(projectActivityId);

        // Return updated project activity
        const updatedPa = queryOne<ProjectActivity>(
          'SELECT * FROM project_activities WHERE id = ?',
          [projectActivityId]
        );

        return createSuccessResponse(updatedPa);
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // ====================================================================
  // Batch Operations
  // ====================================================================

  // Get project status for a template: which projects have it, and sync status
  ipcMain.handle('template-batch:get-project-status', async (_, templateId: number) => {
    try {
      const rows = query<ProjectTemplateStatus>(`
        SELECT
          p.id as project_id,
          p.name as project_name,
          CASE WHEN pa.id IS NOT NULL THEN 1 ELSE 0 END as has_activity,
          pa.id as project_activity_id,
          pa.template_version,
          CASE WHEN pa.id IS NOT NULL AND pa.template_version != at.version THEN 1 ELSE 0 END as is_out_of_sync
        FROM projects p
        LEFT JOIN project_activities pa ON pa.project_id = p.id AND pa.activity_template_id = ?
        LEFT JOIN activity_templates at ON at.id = ?
        ORDER BY p.name
      `, [templateId, templateId]);

      // sql.js returns 0/1 for booleans, convert to actual booleans
      const result: ProjectTemplateStatus[] = rows.map(r => ({
        ...r,
        hasActivity: !!r.hasActivity,
        isOutOfSync: !!r.isOutOfSync,
      }));

      return createSuccessResponse(result);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Batch apply template to multiple projects
  ipcMain.handle('template-batch:apply-to-projects', async (_, params: { activityTemplateId: number; projectIds: number[] }) => {
    try {
      const { activityTemplateId, projectIds } = params;

      if (!projectIds || projectIds.length === 0) {
        return createErrorResponse('No projects selected');
      }

      // Get template info once
      const template = queryOne<ActivityTemplate>(
        'SELECT * FROM activity_templates WHERE id = ?',
        [activityTemplateId]
      );
      if (!template) {
        return createErrorResponse('Activity template not found');
      }

      // Get template schedule items once
      const templateItems = query<ActivityTemplateScheduleItem>(
        'SELECT * FROM activity_template_schedule_items WHERE activity_template_id = ? ORDER BY sort_order',
        [activityTemplateId]
      );

      const results: BatchApplyResult[] = [];

      return await withTransaction(async () => {
        for (const projectId of projectIds) {
          // Look up project name
          const project = queryOne<{ id: number; name: string }>(
            'SELECT id, name FROM projects WHERE id = ?',
            [projectId]
          );
          if (!project) {
            results.push({ projectId, projectName: `Project #${projectId}`, success: false, error: 'Project not found' });
            continue;
          }

          try {
            // Check for duplicate
            const existing = queryOne<{ id: number }>(
              'SELECT id FROM project_activities WHERE project_id = ? AND activity_template_id = ?',
              [projectId, activityTemplateId]
            );
            if (existing) {
              results.push({ projectId, projectName: project.name, success: false, error: 'Activity already added to this project' });
              continue;
            }

            // Get current max sort_order for this project
            const maxOrder = queryOne<{ maxOrder: number }>(
              'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM project_activities WHERE project_id = ?',
              [projectId]
            );

            // Create project activity
            run(
              `INSERT INTO project_activities (project_id, activity_template_id, sort_order, template_version)
               VALUES (?, ?, ?, ?)`,
              [projectId, activityTemplateId, (maxOrder?.maxOrder ?? -1) + 1, template.version]
            );
            const projectActivityId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!.id;

            // Copy template schedule items — two-pass for anchor refs
            const idMap = new Map<number, number>();

            // First pass: insert without anchor refs
            for (const item of templateItems) {
              run(
                `INSERT INTO project_schedule_items
                 (project_activity_id, template_item_id, kind, name, anchor_type, anchor_ref_id, offset_days, fixed_date, override_date, override_enabled, project_milestone_id, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [projectActivityId, item.id, item.kind, item.name, item.anchorType, null, item.offsetDays, item.fixedDate, null, false, null, item.sortOrder]
              );
              const newId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!.id;
              idMap.set(item.id, newId);
            }

            // Second pass: wire anchor references
            for (const item of templateItems) {
              if (item.anchorRefId && idMap.has(item.anchorRefId)) {
                const newItemId = idMap.get(item.id)!;
                const newAnchorRefId = idMap.get(item.anchorRefId)!;
                run(
                  'UPDATE project_schedule_items SET anchor_ref_id = ? WHERE id = ?',
                  [newAnchorRefId, newItemId]
                );
              }
            }

            createAuditEvent('project_activity', projectActivityId, 'batch_add', {
              projectId,
              activityTemplateId,
            });

            results.push({ projectId, projectName: project.name, success: true });
          } catch (err: any) {
            results.push({ projectId, projectName: project.name, success: false, error: err.message });
          }
        }

        return createSuccessResponse(results);
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Check which project activities are out of sync for a specific template (across all projects)
  ipcMain.handle('template-batch:check-out-of-sync', async (_, templateId: number) => {
    try {
      const outOfSync = query<TemplateOutOfSyncActivity>(`
        SELECT
          pa.id as project_activity_id,
          pa.project_id,
          p.name as project_name,
          pa.template_version,
          at.version as latest_version
        FROM project_activities pa
        JOIN activity_templates at ON pa.activity_template_id = at.id
        JOIN projects p ON pa.project_id = p.id
        WHERE pa.activity_template_id = ? AND pa.template_version != at.version
        ORDER BY p.name
      `, [templateId]);
      return createSuccessResponse(outOfSync);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Batch sync multiple project activities to their template
  ipcMain.handle('template-batch:sync-all', async (_, params: { projectActivityIds: number[] }) => {
    try {
      const { projectActivityIds } = params;

      if (!projectActivityIds || projectActivityIds.length === 0) {
        return createErrorResponse('No project activities selected');
      }

      const results: BatchSyncResult[] = [];

      return await withTransaction(async () => {
        for (const projectActivityId of projectActivityIds) {
          // Look up project name for this activity
          const paInfo = queryOne<{ projectId: number; projectName: string }>(
            `SELECT pa.project_id, p.name as project_name
             FROM project_activities pa
             JOIN projects p ON pa.project_id = p.id
             WHERE pa.id = ?`,
            [projectActivityId]
          );

          if (!paInfo) {
            results.push({
              projectActivityId,
              projectId: 0,
              projectName: `Unknown (PA #${projectActivityId})`,
              success: false,
              error: 'Project activity not found',
            });
            continue;
          }

          try {
            const { fromVersion, toVersion } = applySyncForSingleProjectActivity(projectActivityId);
            results.push({
              projectActivityId,
              projectId: paInfo.projectId,
              projectName: paInfo.projectName,
              success: true,
              fromVersion,
              toVersion,
            });
          } catch (err: any) {
            results.push({
              projectActivityId,
              projectId: paInfo.projectId,
              projectName: paInfo.projectName,
              success: false,
              error: err.message,
            });
          }
        }

        return createSuccessResponse(results);
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
}
