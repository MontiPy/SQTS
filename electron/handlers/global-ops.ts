import { ipcMain } from 'electron';
import { query, queryOne, withTransaction } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import { applySyncForSingleProjectActivity } from './template-sync';
import { repairMilestoneLinks } from './propagation';
import { computePropagationPreview, filterPropagationChanges, SupplierPropagationData } from '../engine/propagation';
import { run } from '../database';
import type {
  ProjectScheduleItem,
  ProjectMilestone,
  SupplierScheduleItemInstance,
  PropagationPolicy,
} from '@shared/types';

export function registerGlobalOpsHandlers() {
  /**
   * Sync all out-of-sync templates across all projects, then propagate
   * dates to all supplier instances. Single button, does everything.
   */
  ipcMain.handle('global:sync-and-propagate', async () => {
    try {
      return await withTransaction(async () => {
        // --- Phase 1: Template Sync ---
        // Find ALL out-of-sync project activities across all projects
        const outOfSync = query<{
          id: number;
          projectId: number;
          templateVersion: number;
          latestVersion: number;
        }>(`
          SELECT pa.id, pa.project_id, pa.template_version, at.version as latest_version
          FROM project_activities pa
          JOIN activity_templates at ON pa.activity_template_id = at.id
          WHERE pa.template_version != at.version
        `);

        let syncCount = 0;
        const syncErrors: Array<{ projectActivityId: number; error: string }> = [];

        for (const activity of outOfSync) {
          try {
            applySyncForSingleProjectActivity(activity.id);
            syncCount++;
          } catch (err: any) {
            syncErrors.push({ projectActivityId: activity.id, error: err.message });
          }
        }

        // --- Phase 2: Propagation ---
        // Get propagation policy
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

        // Get all projects that have at least one supplier
        const projectsWithSuppliers = query<{ id: number; name: string }>(`
          SELECT DISTINCT p.id, p.name
          FROM projects p
          JOIN supplier_projects sp ON sp.project_id = p.id
          ORDER BY p.name
        `);

        let totalUpdated = 0;
        let totalSkipped = 0;
        const propagationErrors: Array<{ projectId: number; error: string }> = [];

        for (const project of projectsWithSuppliers) {
          try {
            // Repair milestone links first
            repairMilestoneLinks(project.id);

            // Get project schedule items
            const projectScheduleItems = query<ProjectScheduleItem>(
              `SELECT psi.* FROM project_schedule_items psi
               JOIN project_activities pa ON psi.project_activity_id = pa.id
               WHERE pa.project_id = ?
               ORDER BY pa.sort_order, psi.sort_order`,
              [project.id]
            );

            if (projectScheduleItems.length === 0) continue;

            // Get milestones
            const milestones = query<ProjectMilestone>(
              'SELECT * FROM project_milestones WHERE project_id = ?',
              [project.id]
            );
            const milestoneDates = new Map(milestones.map(m => [m.id, m.date]));

            // Get suppliers
            const supplierProjects = query<{
              id: number;
              supplierId: number;
              supplierName: string;
            }>(`
              SELECT sp.id, sp.supplier_id, s.name as supplier_name
              FROM supplier_projects sp
              JOIN suppliers s ON sp.supplier_id = s.id
              WHERE sp.project_id = ?
              ORDER BY s.name`,
              [project.id]
            );

            if (supplierProjects.length === 0) continue;

            // Build supplier data
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

            // Compute and apply propagation
            const preview = computePropagationPreview(
              project.id,
              projectScheduleItems,
              milestoneDates,
              suppliersData,
              policy
            );

            const result = filterPropagationChanges(preview, null);

            for (const change of result.updated) {
              run(
                'UPDATE supplier_schedule_item_instances SET planned_date = ? WHERE id = ?',
                [change.newDate, change.instanceId]
              );
              totalUpdated++;
            }
            totalSkipped += result.skipped.length;
          } catch (err: any) {
            propagationErrors.push({ projectId: project.id, error: err.message });
          }
        }

        createAuditEvent('global', null, 'sync_and_propagate', {
          templatesSynced: syncCount,
          syncErrors: syncErrors.length,
          projectsPropagated: projectsWithSuppliers.length,
          datesUpdated: totalUpdated,
          datesSkipped: totalSkipped,
          propagationErrors: propagationErrors.length,
        });

        return createSuccessResponse({
          templatesSynced: syncCount,
          syncErrors,
          projectsPropagated: projectsWithSuppliers.length,
          datesUpdated: totalUpdated,
          datesSkipped: totalSkipped,
          propagationErrors,
        });
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
}
