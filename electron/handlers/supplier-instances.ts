import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run, withTransaction } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import { calculateScheduleDates } from '../scheduler';
import type {
  SupplierProject,
  SupplierActivityInstance,
  SupplierScheduleItemInstance,
  ProjectScheduleItem,
  ProjectMilestone,
  ActivityStatus,
  ScopeOverride,
} from '@shared/types';

// Zod schemas
const applyProjectSchema = z.object({
  projectId: z.number().int().positive(),
  supplierId: z.number().int().positive(),
  activityIds: z.array(z.number().int().positive()).optional(), // Manual selection
});

const updateInstanceStatusSchema = z.object({
  instanceId: z.number().int().positive(),
  status: z.enum(['Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete', 'Not Required']),
  completionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().optional().nullable(),
});

const batchUpdateStatusSchema = z.object({
  instanceIds: z.array(z.number().int().positive()),
  status: z.enum(['Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete', 'Not Required']),
  completionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const updateInstanceNotesSchema = z.object({
  instanceId: z.number().int().positive(),
  notes: z.string().nullable(),
});

const toggleApplicabilitySchema = z.object({
  supplierId: z.number().int().positive(),
  activityId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  include: z.boolean(),
});

export function registerSupplierInstanceHandlers() {
  // Apply project to supplier - creates all instances
  ipcMain.handle('supplier-instances:apply-project', async (_, params: unknown) => {
    try {
      const validated = applyProjectSchema.parse(params);

      return await withTransaction(async () => {
        // Get supplier info
        const supplier = queryOne<{ id: number; name: string; nmrRank: string | null }>(
          'SELECT id, name, nmr_rank FROM suppliers WHERE id = ?',
          [validated.supplierId]
        );
        if (!supplier) {
          throw new Error('Supplier not found');
        }

        // Get project info
        const project = queryOne<{ id: number; version: string }>(
          'SELECT id, version FROM projects WHERE id = ?',
          [validated.projectId]
        );
        if (!project) {
          throw new Error('Project not found');
        }

        // Check if already applied
        const existing = queryOne<{ id: number }>(
          'SELECT id FROM supplier_projects WHERE supplier_id = ? AND project_id = ?',
          [validated.supplierId, validated.projectId]
        );
        if (existing) {
          throw new Error('Project already applied to this supplier');
        }

        // Create supplier project
        run(
          `INSERT INTO supplier_projects (supplier_id, project_id, project_version, supplier_project_nmr_rank)
           VALUES (?, ?, ?, ?)`,
          [validated.supplierId, validated.projectId, project.version, supplier.nmrRank]
        );
        const supplierProjectId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!.id;

        // Get project activities
        let projectActivities: Array<{ id: number; activityTemplateId: number }>;
        if (validated.activityIds && validated.activityIds.length > 0) {
          // Manual selection
          projectActivities = query<{ id: number; activityTemplateId: number }>(
            `SELECT id, activity_template_id FROM project_activities
             WHERE project_id = ? AND id IN (${validated.activityIds.map(() => '?').join(',')})`,
            [validated.projectId, ...validated.activityIds]
          );
        } else {
          // All activities
          projectActivities = query<{ id: number; activityTemplateId: number }>(
            'SELECT id, activity_template_id FROM project_activities WHERE project_id = ?',
            [validated.projectId]
          );
        }

        if (projectActivities.length === 0) {
          throw new Error('No activities found for this project');
        }

        // Get milestones for scheduler
        const milestones = query<ProjectMilestone>(
          'SELECT * FROM project_milestones WHERE project_id = ?',
          [validated.projectId]
        );
        const milestoneDates = new Map(milestones.map(m => [m.id, m.date]));

        // Get settings for business days
        const settings = queryOne<{ value: string }>(
          'SELECT value FROM settings WHERE key = ?',
          ['use_business_days']
        );
        const useBusinessDays = settings?.value === 'true';

        // For each project activity, create supplier activity instance + schedule item instances
        for (const projectActivity of projectActivities) {
          // Create supplier activity instance
          run(
            `INSERT INTO supplier_activity_instances
             (supplier_project_id, project_activity_id, status, scope_override)
             VALUES (?, ?, ?, ?)`,
            [supplierProjectId, projectActivity.id, 'Not Started', null]
          );
          const activityInstanceId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!.id;

          // Get project schedule items for this activity
          const scheduleItems = query<ProjectScheduleItem>(
            'SELECT * FROM project_schedule_items WHERE project_activity_id = ? ORDER BY sort_order',
            [projectActivity.id]
          );

          if (scheduleItems.length === 0) continue;

          // Calculate planned dates using scheduler
          const actualDates = new Map<number, string | null>();
          const calculatedItems = calculateScheduleDates(scheduleItems, useBusinessDays, actualDates, milestoneDates);

          // Create supplier schedule item instances
          for (const item of calculatedItems) {
            run(
              `INSERT INTO supplier_schedule_item_instances
               (supplier_activity_instance_id, project_schedule_item_id, planned_date, actual_date, status, planned_date_override, scope_override, locked, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [activityInstanceId, item.id, item.plannedDate, null, 'Not Started', false, null, false, null]
            );
          }
        }

        createAuditEvent('supplier_project', supplierProjectId, 'apply_project', {
          supplierId: validated.supplierId,
          projectId: validated.projectId,
          activityCount: projectActivities.length,
        });

        const supplierProject = queryOne<SupplierProject>(
          'SELECT * FROM supplier_projects WHERE id = ?',
          [supplierProjectId]
        );

        return createSuccessResponse({
          supplierProject,
          activitiesCreated: projectActivities.length,
        });
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Remove project from supplier
  ipcMain.handle('supplier-instances:remove-project', async (_, projectId: number, supplierId: number) => {
    try {
      return await withTransaction(async () => {
        const supplierProject = queryOne<{ id: number }>(
          'SELECT id FROM supplier_projects WHERE supplier_id = ? AND project_id = ?',
          [supplierId, projectId]
        );

        if (!supplierProject) {
          throw new Error('Project not applied to this supplier');
        }

        // Delete supplier project (cascade will handle instances)
        run('DELETE FROM supplier_projects WHERE id = ?', [supplierProject.id]);

        createAuditEvent('supplier_project', supplierProject.id, 'remove_project', {
          supplierId,
          projectId,
        });

        return createSuccessResponse({ id: supplierProject.id });
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Get supplier grid for a project/activity
  ipcMain.handle('supplier-instances:get-grid', async (_, projectId: number, activityId?: number) => {
    try {
      // Get all suppliers with this project
      const supplierProjects = query<{
        id: number;
        supplierId: number;
        supplierName: string;
      }>(
        `SELECT sp.id, sp.supplier_id, s.name as supplier_name
         FROM supplier_projects sp
         JOIN suppliers s ON sp.supplier_id = s.id
         WHERE sp.project_id = ?
         ORDER BY s.name`,
        [projectId]
      );

      const grid = [];

      for (const sp of supplierProjects) {
        // Get activity instances
        let activityInstances;
        if (activityId) {
          activityInstances = query<{ id: number; projectActivityId: number; status: ActivityStatus }>(
            `SELECT sai.id, sai.project_activity_id, sai.status
             FROM supplier_activity_instances sai
             JOIN project_activities pa ON sai.project_activity_id = pa.id
             WHERE sai.supplier_project_id = ? AND pa.activity_template_id = ?`,
            [sp.id, activityId]
          );
        } else {
          activityInstances = query<{ id: number; projectActivityId: number; status: ActivityStatus }>(
            'SELECT id, project_activity_id, status FROM supplier_activity_instances WHERE supplier_project_id = ?',
            [sp.id]
          );
        }

        for (const activityInstance of activityInstances) {
          // Get schedule item instances
          const scheduleInstances = query<SupplierScheduleItemInstance>(
            'SELECT * FROM supplier_schedule_item_instances WHERE supplier_activity_instance_id = ? ORDER BY id',
            [activityInstance.id]
          );

          grid.push({
            supplierId: sp.supplierId,
            supplierName: sp.supplierName,
            supplierProjectId: sp.id,
            projectActivityId: activityInstance.projectActivityId,
            activityInstanceId: activityInstance.id,
            scheduleInstances,
          });
        }
      }

      return createSuccessResponse(grid);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Update single instance status
  ipcMain.handle('supplier-instances:update-status', async (_, params: unknown) => {
    try {
      const validated = updateInstanceStatusSchema.parse(params);

      // Get current instance
      const instance = queryOne<SupplierScheduleItemInstance>(
        'SELECT * FROM supplier_schedule_item_instances WHERE id = ?',
        [validated.instanceId]
      );

      if (!instance) {
        throw new Error('Instance not found');
      }

      // Update instance
      const updates: string[] = ['status = ?'];
      const values: any[] = [validated.status];

      if (validated.completionDate !== undefined) {
        updates.push('actual_date = ?');
        values.push(validated.completionDate);
      }

      if (validated.notes !== undefined) {
        updates.push('notes = ?');
        values.push(validated.notes);
      }

      values.push(validated.instanceId);
      run(`UPDATE supplier_schedule_item_instances SET ${updates.join(', ')} WHERE id = ?`, values);

      // Check if COMPLETION anchors need recalculation
      const needsRecalc = validated.status === 'Complete' && validated.completionDate;

      const updatedInstance = queryOne<SupplierScheduleItemInstance>(
        'SELECT * FROM supplier_schedule_item_instances WHERE id = ?',
        [validated.instanceId]
      );

      createAuditEvent('supplier_schedule_item_instance', validated.instanceId, 'update_status', {
        status: validated.status,
        completionDate: validated.completionDate,
      });

      return createSuccessResponse({
        instance: updatedInstance,
        needsRecalc,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Batch update status
  ipcMain.handle('supplier-instances:batch-update-status', async (_, params: unknown) => {
    try {
      const validated = batchUpdateStatusSchema.parse(params);

      return await withTransaction(async () => {
        const updates: string[] = ['status = ?'];
        const baseValues: any[] = [validated.status];

        if (validated.completionDate !== undefined) {
          updates.push('actual_date = ?');
          baseValues.push(validated.completionDate);
        }

        for (const instanceId of validated.instanceIds) {
          const values = [...baseValues, instanceId];
          run(`UPDATE supplier_schedule_item_instances SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        createAuditEvent('supplier_schedule_item_instance', null, 'batch_update_status', {
          count: validated.instanceIds.length,
          status: validated.status,
        });

        return createSuccessResponse({ updated: validated.instanceIds.length });
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Update instance notes
  ipcMain.handle('supplier-instances:update-notes', async (_, params: unknown) => {
    try {
      const validated = updateInstanceNotesSchema.parse(params);

      run('UPDATE supplier_schedule_item_instances SET notes = ? WHERE id = ?', [
        validated.notes,
        validated.instanceId,
      ]);

      const instance = queryOne<SupplierScheduleItemInstance>(
        'SELECT * FROM supplier_schedule_item_instances WHERE id = ?',
        [validated.instanceId]
      );

      createAuditEvent('supplier_schedule_item_instance', validated.instanceId, 'update_notes', {
        notes: validated.notes,
      });

      return createSuccessResponse(instance);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Toggle planned date override
  ipcMain.handle('supplier-instances:toggle-override', async (_, instanceId: number, enabled: boolean, date?: string | null) => {
    try {
      const updates: string[] = ['planned_date_override = ?'];
      const values: any[] = [enabled];

      if (date !== undefined) {
        updates.push('planned_date = ?');
        values.push(date);
      }

      values.push(instanceId);
      run(`UPDATE supplier_schedule_item_instances SET ${updates.join(', ')} WHERE id = ?`, values);

      const instance = queryOne<SupplierScheduleItemInstance>(
        'SELECT * FROM supplier_schedule_item_instances WHERE id = ?',
        [instanceId]
      );

      createAuditEvent('supplier_schedule_item_instance', instanceId, 'toggle_override', { enabled, date });

      return createSuccessResponse(instance);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Toggle locked flag
  ipcMain.handle('supplier-instances:toggle-lock', async (_, instanceId: number, locked: boolean) => {
    try {
      run('UPDATE supplier_schedule_item_instances SET locked = ? WHERE id = ?', [locked, instanceId]);

      const instance = queryOne<SupplierScheduleItemInstance>(
        'SELECT * FROM supplier_schedule_item_instances WHERE id = ?',
        [instanceId]
      );

      createAuditEvent('supplier_schedule_item_instance', instanceId, 'toggle_lock', { locked });

      return createSuccessResponse(instance);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Toggle scope override
  ipcMain.handle('supplier-instances:toggle-scope', async (_, instanceId: number, scope: ScopeOverride) => {
    try {
      run('UPDATE supplier_schedule_item_instances SET scope_override = ? WHERE id = ?', [scope, instanceId]);

      const instance = queryOne<SupplierScheduleItemInstance>(
        'SELECT * FROM supplier_schedule_item_instances WHERE id = ?',
        [instanceId]
      );

      createAuditEvent('supplier_schedule_item_instance', instanceId, 'toggle_scope', { scope });

      return createSuccessResponse(instance);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Toggle applicability - manual checkbox override
  ipcMain.handle('supplier-instances:toggle-applicability', async (_, params: unknown) => {
    try {
      const validated = toggleApplicabilitySchema.parse(params);

      return await withTransaction(async () => {
        // Get supplier project
        const supplierProject = queryOne<{ id: number }>(
          'SELECT id FROM supplier_projects WHERE supplier_id = ? AND project_id = ?',
          [validated.supplierId, validated.projectId]
        );

        if (!supplierProject) {
          throw new Error('Project not applied to this supplier');
        }

        // Get project activity
        const projectActivity = queryOne<{ id: number }>(
          'SELECT id FROM project_activities WHERE project_id = ? AND activity_template_id = ?',
          [validated.projectId, validated.activityId]
        );

        if (!projectActivity) {
          throw new Error('Activity not found in project');
        }

        if (validated.include) {
          // Check if already exists
          const existing = queryOne<{ id: number }>(
            'SELECT id FROM supplier_activity_instances WHERE supplier_project_id = ? AND project_activity_id = ?',
            [supplierProject.id, projectActivity.id]
          );

          if (existing) {
            return createSuccessResponse({ message: 'Activity already included' });
          }

          // Add activity instance
          run(
            `INSERT INTO supplier_activity_instances (supplier_project_id, project_activity_id, status, scope_override)
             VALUES (?, ?, ?, ?)`,
            [supplierProject.id, projectActivity.id, 'Not Started', null]
          );
          const activityInstanceId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!.id;

          // Get schedule items and create instances
          const scheduleItems = query<ProjectScheduleItem>(
            'SELECT * FROM project_schedule_items WHERE project_activity_id = ? ORDER BY sort_order',
            [projectActivity.id]
          );

          // Get milestones
          const milestones = query<ProjectMilestone>(
            'SELECT * FROM project_milestones WHERE project_id = ?',
            [validated.projectId]
          );
          const milestoneDates = new Map(milestones.map(m => [m.id, m.date]));

          // Get settings
          const settings = queryOne<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?',
            ['use_business_days']
          );
          const useBusinessDays = settings?.value === 'true';

          // Calculate dates
          const actualDates = new Map<number, string | null>();
          const calculatedItems = calculateScheduleDates(scheduleItems, useBusinessDays, actualDates, milestoneDates);

          // Create instances
          for (const item of calculatedItems) {
            run(
              `INSERT INTO supplier_schedule_item_instances
               (supplier_activity_instance_id, project_schedule_item_id, planned_date, actual_date, status, planned_date_override, scope_override, locked, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [activityInstanceId, item.id, item.plannedDate, null, 'Not Started', false, null, false, null]
            );
          }

          createAuditEvent('supplier_activity_instance', activityInstanceId, 'include_activity', {
            supplierId: validated.supplierId,
            projectId: validated.projectId,
            activityId: validated.activityId,
          });

          return createSuccessResponse({ message: 'Activity included', activityInstanceId });
        } else {
          // Remove activity instance
          const activityInstance = queryOne<{ id: number }>(
            'SELECT id FROM supplier_activity_instances WHERE supplier_project_id = ? AND project_activity_id = ?',
            [supplierProject.id, projectActivity.id]
          );

          if (!activityInstance) {
            return createSuccessResponse({ message: 'Activity already excluded' });
          }

          run('DELETE FROM supplier_activity_instances WHERE id = ?', [activityInstance.id]);

          createAuditEvent('supplier_activity_instance', activityInstance.id, 'exclude_activity', {
            supplierId: validated.supplierId,
            projectId: validated.projectId,
            activityId: validated.activityId,
          });

          return createSuccessResponse({ message: 'Activity excluded' });
        }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Get supplier project details
  ipcMain.handle('supplier-instances:get-supplier-project', async (_, supplierId: number, projectId: number) => {
    try {
      const supplierProject = queryOne<SupplierProject>(
        'SELECT * FROM supplier_projects WHERE supplier_id = ? AND project_id = ?',
        [supplierId, projectId]
      );

      if (!supplierProject) {
        return createErrorResponse('Supplier project not found');
      }

      // Get activity instances
      const activityInstances = query<SupplierActivityInstance & { activityName: string }>(
        `SELECT sai.*, at.name as activity_name
         FROM supplier_activity_instances sai
         JOIN project_activities pa ON sai.project_activity_id = pa.id
         JOIN activity_templates at ON pa.activity_template_id = at.id
         WHERE sai.supplier_project_id = ?
         ORDER BY pa.sort_order`,
        [supplierProject.id]
      );

      // For each activity, get schedule item instances
      const activities = [];
      for (const activity of activityInstances) {
        const scheduleInstances = query<SupplierScheduleItemInstance & { itemName: string }>(
          `SELECT ssii.*, psi.name as item_name
           FROM supplier_schedule_item_instances ssii
           JOIN project_schedule_items psi ON ssii.project_schedule_item_id = psi.id
           WHERE ssii.supplier_activity_instance_id = ?
           ORDER BY psi.sort_order`,
          [activity.id]
        );

        activities.push({
          ...activity,
          scheduleInstances,
        });
      }

      return createSuccessResponse({
        supplierProject,
        activities,
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // List all projects for a supplier
  ipcMain.handle('supplier-instances:list-supplier-projects', async (_, supplierId: number) => {
    try {
      const projects = query<SupplierProject & { projectName: string; activityCount: number }>(
        `SELECT sp.*, p.name as project_name,
         (SELECT COUNT(*) FROM supplier_activity_instances WHERE supplier_project_id = sp.id) as activity_count
         FROM supplier_projects sp
         JOIN projects p ON sp.project_id = p.id
         WHERE sp.supplier_id = ?
         ORDER BY sp.created_at DESC`,
        [supplierId]
      );

      return createSuccessResponse(projects);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
}
