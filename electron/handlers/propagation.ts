import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run, withTransaction } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import { computePropagationPreview, filterPropagationChanges, SupplierPropagationData } from '../engine/propagation';
import type {
  ProjectScheduleItem,
  ProjectMilestone,
  SupplierScheduleItemInstance,
  PropagationPolicy,
} from '@shared/types';

// Zod schemas
const applyPropagationSchema = z.object({
  projectId: z.number().int().positive(),
  selectedSupplierIds: z.array(z.number().int().positive()).optional().nullable(),
});

export function registerPropagationHandlers() {
  // Preview propagation changes
  ipcMain.handle('propagation:preview', async (_, projectId: unknown) => {
    try {
      const validProjectId = z.number().int().positive().parse(projectId);
      // Get propagation policy from settings
      const skipCompleteSetting = queryOne<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        ['propagation_skip_complete']
      );
      const skipLockedSetting = queryOne<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        ['propagation_skip_locked']
      );
      const skipOverriddenSetting = queryOne<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        ['propagation_skip_overridden']
      );
      const useBusinessDaysSetting = queryOne<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        ['use_business_days']
      );

      const policy: PropagationPolicy = {
        skipComplete: skipCompleteSetting?.value === 'true',
        skipLocked: skipLockedSetting?.value === 'true',
        skipOverridden: skipOverriddenSetting?.value === 'true',
        useBusinessDays: useBusinessDaysSetting?.value === 'true',
      };

      // Get project schedule items
      const projectScheduleItems = query<ProjectScheduleItem>(
        `SELECT psi.* FROM project_schedule_items psi
         JOIN project_activities pa ON psi.project_activity_id = pa.id
         WHERE pa.project_id = ?
         ORDER BY pa.sort_order, psi.sort_order`,
        [validProjectId]
      );

      if (projectScheduleItems.length === 0) {
        return createErrorResponse('No schedule items found for this project');
      }

      // Get project milestones
      const milestones = query<ProjectMilestone>(
        'SELECT * FROM project_milestones WHERE project_id = ?',
        [validProjectId]
      );
      const milestoneDates = new Map(milestones.map(m => [m.id, m.date]));

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
        [validProjectId]
      );

      if (supplierProjects.length === 0) {
        return createErrorResponse('No suppliers found for this project');
      }

      // Build supplier data for propagation engine
      const suppliersData: SupplierPropagationData[] = [];

      for (const sp of supplierProjects) {
        // Get all schedule item instances for this supplier-project
        const instances = query<SupplierScheduleItemInstance>(
          `SELECT ssii.*
           FROM supplier_schedule_item_instances ssii
           JOIN supplier_activity_instances sai ON ssii.supplier_activity_instance_id = sai.id
           WHERE sai.supplier_project_id = ?`,
          [sp.id]
        );

        // Build item names map
        const itemNames = new Map<number, string>();
        for (const instance of instances) {
          const item = queryOne<{ name: string }>(
            'SELECT name FROM project_schedule_items WHERE id = ?',
            [instance.projectScheduleItemId]
          );
          if (item) {
            itemNames.set(instance.projectScheduleItemId, item.name);
          }
        }

        suppliersData.push({
          supplierProjectId: sp.id,
          supplierId: sp.supplierId,
          supplierName: sp.supplierName,
          instances,
          itemNames,
        });
      }

      // Compute preview
      const preview = computePropagationPreview(
        validProjectId,
        projectScheduleItems,
        milestoneDates,
        suppliersData,
        policy
      );

      return createSuccessResponse(preview);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Apply propagation changes
  ipcMain.handle('propagation:apply', async (_, params: unknown) => {
    try {
      const validated = applyPropagationSchema.parse(params);

      return await withTransaction(async () => {
        // Get preview first (same logic as preview handler)
        const skipCompleteSetting = queryOne<{ value: string }>(
          'SELECT value FROM settings WHERE key = ?',
          ['propagation_skip_complete']
        );
        const skipLockedSetting = queryOne<{ value: string }>(
          'SELECT value FROM settings WHERE key = ?',
          ['propagation_skip_locked']
        );
        const skipOverriddenSetting = queryOne<{ value: string }>(
          'SELECT value FROM settings WHERE key = ?',
          ['propagation_skip_overridden']
        );
        const useBusinessDaysSetting = queryOne<{ value: string }>(
          'SELECT value FROM settings WHERE key = ?',
          ['use_business_days']
        );

        const policy: PropagationPolicy = {
          skipComplete: skipCompleteSetting?.value === 'true',
          skipLocked: skipLockedSetting?.value === 'true',
          skipOverridden: skipOverriddenSetting?.value === 'true',
          useBusinessDays: useBusinessDaysSetting?.value === 'true',
        };

        const projectScheduleItems = query<ProjectScheduleItem>(
          `SELECT psi.* FROM project_schedule_items psi
           JOIN project_activities pa ON psi.project_activity_id = pa.id
           WHERE pa.project_id = ?
           ORDER BY pa.sort_order, psi.sort_order`,
          [validated.projectId]
        );

        const milestones = query<ProjectMilestone>(
          'SELECT * FROM project_milestones WHERE project_id = ?',
          [validated.projectId]
        );
        const milestoneDates = new Map(milestones.map(m => [m.id, m.date]));

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
          [validated.projectId]
        );

        const suppliersData: SupplierPropagationData[] = [];

        for (const sp of supplierProjects) {
          const instances = query<SupplierScheduleItemInstance>(
            `SELECT ssii.*
             FROM supplier_schedule_item_instances ssii
             JOIN supplier_activity_instances sai ON ssii.supplier_activity_instance_id = sai.id
             WHERE sai.supplier_project_id = ?`,
            [sp.id]
          );

          const itemNames = new Map<number, string>();
          for (const instance of instances) {
            const item = queryOne<{ name: string }>(
              'SELECT name FROM project_schedule_items WHERE id = ?',
              [instance.projectScheduleItemId]
            );
            if (item) {
              itemNames.set(instance.projectScheduleItemId, item.name);
            }
          }

          suppliersData.push({
            supplierProjectId: sp.id,
            supplierId: sp.supplierId,
            supplierName: sp.supplierName,
            instances,
            itemNames,
          });
        }

        const preview = computePropagationPreview(
          validated.projectId,
          projectScheduleItems,
          milestoneDates,
          suppliersData,
          policy
        );

        // Filter by selected suppliers
        const selectedSet = validated.selectedSupplierIds
          ? new Set(validated.selectedSupplierIds)
          : null;

        const result = filterPropagationChanges(preview, selectedSet);

        // Apply updates
        let updateCount = 0;
        const errors: Array<{ instanceId: number; error: string }> = [];

        for (const change of result.updated) {
          try {
            run(
              'UPDATE supplier_schedule_item_instances SET planned_date = ? WHERE id = ?',
              [change.newDate, change.instanceId]
            );
            updateCount++;
          } catch (error: any) {
            errors.push({ instanceId: change.instanceId, error: error.message });
          }
        }

        // Create audit event with summary
        createAuditEvent('propagation', null, 'apply', {
          projectId: validated.projectId,
          updated: updateCount,
          skipped: result.skipped.length,
          errors: errors.length,
          selectedSuppliers: validated.selectedSupplierIds,
        });

        return createSuccessResponse({
          updated: result.updated.length,
          skipped: result.skipped.length,
          errors,
          actualUpdates: updateCount,
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
