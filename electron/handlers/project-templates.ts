import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run, withTransaction } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import type { ProjectTemplate, ProjectTemplateMilestone, ProjectTemplateActivity, ActivityTemplateScheduleItem } from '@shared/types';

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().nullable().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  milestones: z.array(z.object({
    category: z.string().nullable().optional(),
    name: z.string().min(1),
    sortOrder: z.number().int().default(0),
  })).optional(),
  activities: z.array(z.object({
    activityTemplateId: z.number().int().positive(),
    sortOrder: z.number().int().default(0),
  })).optional(),
});

const applyTemplateSchema = z.object({
  projectTemplateId: z.number().int().positive(),
  projectId: z.number().int().positive(),
});

export function registerProjectTemplateHandlers() {
  // List all project templates
  ipcMain.handle('project-templates:list', async () => {
    try {
      const templates = query<ProjectTemplate & { milestoneCount: number; activityCount: number }>(
        `SELECT pt.*,
          (SELECT COUNT(*) FROM project_template_milestones WHERE project_template_id = pt.id) as milestone_count,
          (SELECT COUNT(*) FROM project_template_activities WHERE project_template_id = pt.id) as activity_count
         FROM project_templates pt
         ORDER BY pt.name`
      );
      return createSuccessResponse(templates);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Get a single project template with milestones and activities
  ipcMain.handle('project-templates:get', async (_, id: unknown) => {
    try {
      const validId = z.number().int().positive().parse(id);

      const template = queryOne<ProjectTemplate>(
        'SELECT * FROM project_templates WHERE id = ?',
        [validId]
      );
      if (!template) return createErrorResponse('Project template not found');

      const milestones = query<ProjectTemplateMilestone>(
        'SELECT * FROM project_template_milestones WHERE project_template_id = ? ORDER BY sort_order',
        [validId]
      );

      const activities = query<ProjectTemplateActivity & { templateName: string; templateCategory: string | null }>(
        `SELECT pta.*, at.name as template_name, at.category as template_category
         FROM project_template_activities pta
         JOIN activity_templates at ON pta.activity_template_id = at.id
         WHERE pta.project_template_id = ?
         ORDER BY pta.sort_order`,
        [validId]
      );

      return createSuccessResponse({
        ...template,
        milestones,
        activities,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Create a new project template
  ipcMain.handle('project-templates:create', async (_, params: unknown) => {
    try {
      const validated = createTemplateSchema.parse(params);

      run(
        'INSERT INTO project_templates (name, description) VALUES (?, ?)',
        [validated.name, validated.description || null]
      );

      const template = queryOne<ProjectTemplate>(
        'SELECT * FROM project_templates WHERE id = last_insert_rowid()'
      );
      createAuditEvent('project_template', template!.id, 'create', { name: validated.name });
      return createSuccessResponse(template);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Update a project template (name/description and optionally full-replace milestones/activities)
  ipcMain.handle('project-templates:update', async (_, id: unknown, params: unknown) => {
    try {
      const validId = z.number().int().positive().parse(id);
      const validated = updateTemplateSchema.parse(params);

      const existing = queryOne<ProjectTemplate>(
        'SELECT * FROM project_templates WHERE id = ?',
        [validId]
      );
      if (!existing) return createErrorResponse('Project template not found');

      return await withTransaction(async () => {
        // Update name/description
        const updates: string[] = [];
        const values: any[] = [];
        if (validated.name !== undefined) {
          updates.push('name = ?');
          values.push(validated.name);
        }
        if (validated.description !== undefined) {
          updates.push('description = ?');
          values.push(validated.description);
        }
        if (updates.length > 0) {
          values.push(validId);
          run(`UPDATE project_templates SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        // Full-replace milestones if provided
        if (validated.milestones !== undefined) {
          run('DELETE FROM project_template_milestones WHERE project_template_id = ?', [validId]);
          for (const m of validated.milestones) {
            run(
              'INSERT INTO project_template_milestones (project_template_id, category, name, sort_order) VALUES (?, ?, ?, ?)',
              [validId, m.category || null, m.name, m.sortOrder]
            );
          }
        }

        // Full-replace activities if provided
        if (validated.activities !== undefined) {
          run('DELETE FROM project_template_activities WHERE project_template_id = ?', [validId]);
          for (const a of validated.activities) {
            run(
              'INSERT INTO project_template_activities (project_template_id, activity_template_id, sort_order) VALUES (?, ?, ?)',
              [validId, a.activityTemplateId, a.sortOrder]
            );
          }
        }

        const template = queryOne<ProjectTemplate>(
          'SELECT * FROM project_templates WHERE id = ?',
          [validId]
        );

        const milestones = query<ProjectTemplateMilestone>(
          'SELECT * FROM project_template_milestones WHERE project_template_id = ? ORDER BY sort_order',
          [validId]
        );

        const activities = query<ProjectTemplateActivity & { templateName: string; templateCategory: string | null }>(
          `SELECT pta.*, at.name as template_name, at.category as template_category
           FROM project_template_activities pta
           JOIN activity_templates at ON pta.activity_template_id = at.id
           WHERE pta.project_template_id = ?
           ORDER BY pta.sort_order`,
          [validId]
        );

        createAuditEvent('project_template', validId, 'update', validated);
        return createSuccessResponse({ ...template, milestones, activities });
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Delete a project template
  ipcMain.handle('project-templates:delete', async (_, id: unknown) => {
    try {
      const validId = z.number().int().positive().parse(id);

      const existing = queryOne<ProjectTemplate>(
        'SELECT * FROM project_templates WHERE id = ?',
        [validId]
      );
      if (!existing) return createErrorResponse('Project template not found');

      run('DELETE FROM project_templates WHERE id = ?', [validId]);
      createAuditEvent('project_template', validId, 'delete', { name: existing.name });
      return createSuccessResponse(null);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Apply a project template to a project
  ipcMain.handle('project-templates:apply', async (_, params: unknown) => {
    try {
      const validated = applyTemplateSchema.parse(params);

      return await withTransaction(async () => {
        // Load template milestones
        const templateMilestones = query<ProjectTemplateMilestone>(
          'SELECT * FROM project_template_milestones WHERE project_template_id = ? ORDER BY sort_order',
          [validated.projectTemplateId]
        );

        // Load template activities
        const templateActivities = query<ProjectTemplateActivity>(
          'SELECT * FROM project_template_activities WHERE project_template_id = ? ORDER BY sort_order',
          [validated.projectTemplateId]
        );

        // Get existing project milestones
        const existingMilestones = query<{ name: string }>(
          'SELECT name FROM project_milestones WHERE project_id = ?',
          [validated.projectId]
        );
        const existingMilestoneNames = new Set(existingMilestones.map(m => m.name.toLowerCase()));

        // Get max sort order for milestones
        const maxMilestoneOrder = queryOne<{ maxOrder: number }>(
          'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM project_milestones WHERE project_id = ?',
          [validated.projectId]
        );
        let nextMilestoneOrder = (maxMilestoneOrder?.maxOrder ?? -1) + 1;

        let milestonesAdded = 0;
        let milestonesSkipped = 0;

        for (const tm of templateMilestones) {
          if (existingMilestoneNames.has(tm.name.toLowerCase())) {
            milestonesSkipped++;
            continue;
          }
          run(
            'INSERT INTO project_milestones (project_id, name, category, sort_order) VALUES (?, ?, ?, ?)',
            [validated.projectId, tm.name, tm.category, nextMilestoneOrder++]
          );
          milestonesAdded++;
        }

        // Get existing project activities
        const existingActivities = query<{ activityTemplateId: number }>(
          'SELECT activity_template_id FROM project_activities WHERE project_id = ?',
          [validated.projectId]
        );
        const existingTemplateIds = new Set(existingActivities.map(a => a.activityTemplateId));

        // Get max sort order for activities
        const maxActivityOrder = queryOne<{ maxOrder: number }>(
          'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM project_activities WHERE project_id = ?',
          [validated.projectId]
        );
        let nextActivityOrder = (maxActivityOrder?.maxOrder ?? -1) + 1;

        let activitiesAdded = 0;
        let activitiesSkipped = 0;

        for (const ta of templateActivities) {
          if (existingTemplateIds.has(ta.activityTemplateId)) {
            activitiesSkipped++;
            continue;
          }

          // Replicate the project-activities:add logic
          const template = queryOne<{ version: number }>(
            'SELECT version FROM activity_templates WHERE id = ?',
            [ta.activityTemplateId]
          );
          if (!template) {
            activitiesSkipped++;
            continue;
          }

          run(
            `INSERT INTO project_activities (project_id, activity_template_id, sort_order, template_version)
             VALUES (?, ?, ?, ?)`,
            [validated.projectId, ta.activityTemplateId, nextActivityOrder++, template.version]
          );
          const projectActivityId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!.id;

          // Copy template schedule items
          const templateItems = query<ActivityTemplateScheduleItem>(
            'SELECT * FROM activity_template_schedule_items WHERE activity_template_id = ? ORDER BY sort_order',
            [ta.activityTemplateId]
          );

          const idMap = new Map<number, number>();

          // First pass: create items without anchor refs
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

          activitiesAdded++;
        }

        createAuditEvent('project_template', validated.projectTemplateId, 'apply', {
          projectId: validated.projectId,
          milestonesAdded,
          milestonesSkipped,
          activitiesAdded,
          activitiesSkipped,
        });

        return createSuccessResponse({
          milestonesAdded,
          milestonesSkipped,
          activitiesAdded,
          activitiesSkipped,
        });
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });
}
