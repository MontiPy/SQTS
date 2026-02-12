import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run, withTransaction } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import type { Project, ProjectMilestone, ProjectActivity, ActivityTemplateScheduleItem } from '@shared/types';

// Zod validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  version: z.string().optional(),
  defaultAnchorRule: z.string().optional().nullable(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  version: z.string().optional(),
  defaultAnchorRule: z.string().optional().nullable(),
});

const createMilestoneSchema = z.object({
  projectId: z.number().int().positive(),
  name: z.string().min(1, 'Name is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').nullable().optional(),
  category: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const updateMilestoneSchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').nullable().optional(),
  category: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export function registerProjectHandlers() {
  // Projects
  ipcMain.handle('projects:list', async () => {
    try {
      const projects = query<Project>('SELECT * FROM projects ORDER BY created_at DESC');
      return createSuccessResponse(projects);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('projects:get', async (_, id: number) => {
    try {
      const project = queryOne<Project>('SELECT * FROM projects WHERE id = ?', [id]);
      if (!project) {
        return createErrorResponse('Project not found');
      }
      return createSuccessResponse(project);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('projects:create', async (_, params: unknown) => {
    try {
      const validated = createProjectSchema.parse(params);

      run(
        `INSERT INTO projects (name, version, default_anchor_rule)
         VALUES (?, ?, ?)`,
        [validated.name, validated.version || 'v1.0', validated.defaultAnchorRule || null]
      );

      const project = queryOne<Project>('SELECT * FROM projects WHERE id = last_insert_rowid()');
      createAuditEvent('project', project!.id, 'create', { name: validated.name });
      return createSuccessResponse(project);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('projects:update', async (_, id: number, params: unknown) => {
    try {
      const validated = updateProjectSchema.parse(params);

      const updates: string[] = [];
      const values: any[] = [];

      if (validated.name !== undefined) {
        updates.push('name = ?');
        values.push(validated.name);
      }
      if (validated.version !== undefined) {
        updates.push('version = ?');
        values.push(validated.version);
      }
      if (validated.defaultAnchorRule !== undefined) {
        updates.push('default_anchor_rule = ?');
        values.push(validated.defaultAnchorRule);
      }

      if (updates.length === 0) {
        return createErrorResponse('No fields to update');
      }

      updates.push('updated_at = datetime("now")');
      values.push(id);
      run(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, values);

      const project = queryOne<Project>('SELECT * FROM projects WHERE id = ?', [id]);
      createAuditEvent('project', id, 'update', validated);
      return createSuccessResponse(project);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('projects:delete', async (_, id: number) => {
    try {
      run('DELETE FROM projects WHERE id = ?', [id]);
      createAuditEvent('project', id, 'delete');
      return createSuccessResponse({ id });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Milestones
  ipcMain.handle('milestones:list', async (_, projectId: number) => {
    try {
      const milestones = query<ProjectMilestone>(
        'SELECT * FROM project_milestones WHERE project_id = ? ORDER BY sort_order',
        [projectId]
      );
      return createSuccessResponse(milestones);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('milestones:create', async (_, params: unknown) => {
    try {
      const validated = createMilestoneSchema.parse(params);

      run(
        `INSERT INTO project_milestones (project_id, name, date, category, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [validated.projectId, validated.name, validated.date || null, validated.category || null, validated.sortOrder || 0]
      );

      const milestone = queryOne<ProjectMilestone>('SELECT * FROM project_milestones WHERE id = last_insert_rowid()');
      createAuditEvent('project_milestone', milestone!.id, 'create', { projectId: validated.projectId, name: validated.name });
      return createSuccessResponse(milestone);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('milestones:update', async (_, id: number, params: unknown) => {
    try {
      const validated = updateMilestoneSchema.parse(params);

      // Check if date is changing - this will trigger scheduler recalculation
      const oldMilestone = queryOne<ProjectMilestone>('SELECT * FROM project_milestones WHERE id = ?', [id]);
      const dateChanged = validated.date !== undefined && oldMilestone && validated.date !== oldMilestone.date;

      const updates: string[] = [];
      const values: any[] = [];

      if (validated.name !== undefined) {
        updates.push('name = ?');
        values.push(validated.name);
      }
      if (validated.date !== undefined) {
        updates.push('date = ?');
        values.push(validated.date);
      }
      if (validated.category !== undefined) {
        updates.push('category = ?');
        values.push(validated.category);
      }
      if (validated.sortOrder !== undefined) {
        updates.push('sort_order = ?');
        values.push(validated.sortOrder);
      }

      if (updates.length === 0) {
        return createErrorResponse('No fields to update');
      }

      values.push(id);
      run(`UPDATE project_milestones SET ${updates.join(', ')} WHERE id = ?`, values);

      const milestone = queryOne<ProjectMilestone>('SELECT * FROM project_milestones WHERE id = ?', [id]);
      createAuditEvent('project_milestone', id, 'update', validated);

      // Return preview information if date changed
      return createSuccessResponse({
        milestone,
        dateChanged,
        propagationRequired: dateChanged,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('milestones:delete', async (_, id: number) => {
    try {
      run('DELETE FROM project_milestones WHERE id = ?', [id]);
      createAuditEvent('project_milestone', id, 'delete');
      return createSuccessResponse({ id });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Project Activities
  ipcMain.handle('project-activities:list', async (_, projectId: number) => {
    try {
      const activities = query<ProjectActivity & { templateName: string; templateCategory: string | null; scheduleItemCount: number }>(
        `SELECT pa.*, at.name as template_name, at.category as template_category,
         (SELECT COUNT(*) FROM project_schedule_items WHERE project_activity_id = pa.id) as schedule_item_count
         FROM project_activities pa
         JOIN activity_templates at ON pa.activity_template_id = at.id
         WHERE pa.project_id = ?
         ORDER BY pa.sort_order`,
        [projectId]
      );
      return createSuccessResponse(activities);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('project-activities:add', async (_, params: unknown) => {
    try {
      const validated = z.object({
        projectId: z.number().int().positive(),
        activityTemplateId: z.number().int().positive(),
      }).parse(params);

      return await withTransaction(async () => {
        // Check if already added
        const existing = queryOne<{ id: number }>(
          'SELECT id FROM project_activities WHERE project_id = ? AND activity_template_id = ?',
          [validated.projectId, validated.activityTemplateId]
        );
        if (existing) {
          throw new Error('Activity already added to this project');
        }

        // Get template version
        const template = queryOne<{ version: number }>(
          'SELECT version FROM activity_templates WHERE id = ?',
          [validated.activityTemplateId]
        );
        if (!template) {
          throw new Error('Activity template not found');
        }

        // Get current max sort_order
        const maxOrder = queryOne<{ maxOrder: number }>(
          'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM project_activities WHERE project_id = ?',
          [validated.projectId]
        );

        // Create project activity
        run(
          `INSERT INTO project_activities (project_id, activity_template_id, sort_order, template_version)
           VALUES (?, ?, ?, ?)`,
          [validated.projectId, validated.activityTemplateId, (maxOrder?.maxOrder ?? -1) + 1, template.version]
        );
        const projectActivityId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!.id;

        // Copy template schedule items to project schedule items
        const templateItems = query<ActivityTemplateScheduleItem>(
          'SELECT * FROM activity_template_schedule_items WHERE activity_template_id = ? ORDER BY sort_order',
          [validated.activityTemplateId]
        );

        const idMap = new Map<number, number>(); // template item ID -> project schedule item ID

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

        const projectActivity = queryOne<ProjectActivity>(
          'SELECT * FROM project_activities WHERE id = ?',
          [projectActivityId]
        );

        createAuditEvent('project_activity', projectActivityId, 'add', {
          projectId: validated.projectId,
          activityTemplateId: validated.activityTemplateId,
        });

        return createSuccessResponse(projectActivity);
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('project-activities:remove', async (_, projectActivityId: number) => {
    try {
      run('DELETE FROM project_activities WHERE id = ?', [projectActivityId]);
      createAuditEvent('project_activity', projectActivityId, 'remove');
      return createSuccessResponse({ id: projectActivityId });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
}
