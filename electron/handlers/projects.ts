import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import type { Project, ProjectMilestone } from '@shared/types';

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
  sortOrder: z.number().int().optional(),
});

const updateMilestoneSchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').nullable().optional(),
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
        `INSERT INTO project_milestones (project_id, name, date, sort_order)
         VALUES (?, ?, ?, ?)`,
        [validated.projectId, validated.name, validated.date || null, validated.sortOrder || 0]
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
}
