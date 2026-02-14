import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, withTransaction, run } from '../database';
import { createSuccessResponse, createErrorResponse, validateInput, createAuditEvent } from './shared';
import type { SupplierMilestoneDateGrid, ProjectMilestone } from '@shared/types';

const updateSchema = z.object({
  updates: z.array(z.object({
    supplierProjectId: z.number().int().positive(),
    milestoneId: z.number().int().positive(),
    date: z.string().nullable(),
  })),
});

const fillRowSchema = z.object({
  projectId: z.number().int().positive(),
  milestoneId: z.number().int().positive(),
  date: z.string().min(1),
});

export function registerSupplierMilestoneGridHandlers() {
  // Get per-supplier milestone date grid for a project
  ipcMain.handle('supplier-milestone-grid:get', async (_event, projectId: unknown) => {
    try {
      const id = z.number().int().positive().parse(projectId);

      const suppliers = query<{ supplierProjectId: number; supplierId: number; supplierName: string }>(
        `SELECT sp.id as supplier_project_id, sp.supplier_id, s.name as supplier_name
         FROM supplier_projects sp
         JOIN suppliers s ON s.id = sp.supplier_id
         WHERE sp.project_id = ?
         ORDER BY s.name`,
        [id]
      );

      const milestones = query<ProjectMilestone>(
        `SELECT id, project_id, name, date, category, sort_order, created_at
         FROM project_milestones
         WHERE project_id = ?
         ORDER BY sort_order, id`,
        [id]
      );

      // Get existing supplier milestone dates
      const spIds = suppliers.map(s => s.supplierProjectId);
      const dates: Record<string, string | null> = {};

      if (spIds.length > 0 && milestones.length > 0) {
        const placeholders = spIds.map(() => '?').join(',');
        const existingDates = query<{
          supplierProjectId: number;
          projectMilestoneId: number;
          date: string | null;
        }>(
          `SELECT supplier_project_id, project_milestone_id, date
           FROM supplier_milestone_dates
           WHERE supplier_project_id IN (${placeholders})`,
          spIds
        );

        // Build date map with existing supplier-specific dates
        for (const d of existingDates) {
          dates[`${d.supplierProjectId}-${d.projectMilestoneId}`] = d.date;
        }
      }

      // Fill missing cells with project milestone default date
      for (const sp of suppliers) {
        for (const m of milestones) {
          const key = `${sp.supplierProjectId}-${m.id}`;
          if (!(key in dates)) {
            dates[key] = m.date;
          }
        }
      }

      return createSuccessResponse<SupplierMilestoneDateGrid>({ suppliers, milestones, dates });
    } catch (err) {
      return createErrorResponse(err instanceof Error ? err.message : 'Failed to load supplier milestone grid');
    }
  });

  // Update individual supplier milestone dates
  ipcMain.handle('supplier-milestone-grid:update', async (_event, params: unknown) => {
    const validation = validateInput(updateSchema, params);
    if (!validation.success) return validation.response;
    const { updates } = validation.data;

    try {
      await withTransaction(() => {
        for (const u of updates) {
          run(
            `INSERT INTO supplier_milestone_dates (supplier_project_id, project_milestone_id, date)
             VALUES (?, ?, ?)
             ON CONFLICT(supplier_project_id, project_milestone_id) DO UPDATE SET date = excluded.date`,
            [u.supplierProjectId, u.milestoneId, u.date]
          );
        }
      });

      createAuditEvent('supplier_milestone_dates', null, 'batch_update', { count: updates.length });
      return createSuccessResponse({ updated: updates.length });
    } catch (err) {
      return createErrorResponse(err instanceof Error ? err.message : 'Failed to update supplier milestone dates');
    }
  });

  // Fill an entire milestone row with the same date for all suppliers
  ipcMain.handle('supplier-milestone-grid:fill-row', async (_event, params: unknown) => {
    const validation = validateInput(fillRowSchema, params);
    if (!validation.success) return validation.response;
    const { projectId, milestoneId, date } = validation.data;

    try {
      const supplierProjects = query<{ id: number }>(
        `SELECT id FROM supplier_projects WHERE project_id = ?`,
        [projectId]
      );

      await withTransaction(() => {
        for (const sp of supplierProjects) {
          run(
            `INSERT INTO supplier_milestone_dates (supplier_project_id, project_milestone_id, date)
             VALUES (?, ?, ?)
             ON CONFLICT(supplier_project_id, project_milestone_id) DO UPDATE SET date = excluded.date`,
            [sp.id, milestoneId, date]
          );
        }
      });

      createAuditEvent('supplier_milestone_dates', milestoneId, 'fill_row', {
        projectId,
        milestoneId,
        date,
        supplierCount: supplierProjects.length,
      });
      return createSuccessResponse({ updated: supplierProjects.length });
    } catch (err) {
      return createErrorResponse(err instanceof Error ? err.message : 'Failed to fill milestone row');
    }
  });
}
