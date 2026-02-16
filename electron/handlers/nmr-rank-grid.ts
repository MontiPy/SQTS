import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, run, withTransaction } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent, validateInput } from './shared';
import type { NmrRankGridData } from '@shared/types';

const updateSchema = z.object({
  updates: z.array(z.object({
    supplierProjectId: z.number().int().positive(),
    nmrRank: z.string().nullable(),
  })),
});

export function registerNmrRankGridHandlers() {
  ipcMain.handle('nmr-rank-grid:get', async () => {
    try {
      // Get ALL suppliers and ALL projects
      const suppliers = query<{ id: number; name: string }>(
        `SELECT id, name FROM suppliers ORDER BY name`
      );
      const projects = query<{ id: number; name: string; version: string }>(
        `SELECT id, name, version FROM projects ORDER BY name`
      );

      // Get existing supplier-project combinations
      const supplierProjects = query<{
        id: number;
        supplierId: number;
        projectId: number;
        supplierProjectNmrRank: string | null;
      }>(
        `SELECT id, supplier_id, project_id, supplier_project_nmr_rank
         FROM supplier_projects
         ORDER BY id`
      );

      // Build lookup maps
      const supplierProjectIds: Record<string, number> = {};
      const ranks: Record<string, string | null> = {};
      for (const sp of supplierProjects) {
        const key = `${sp.supplierId}-${sp.projectId}`;
        supplierProjectIds[key] = sp.id;
        ranks[key] = sp.supplierProjectNmrRank;
      }

      return createSuccessResponse<NmrRankGridData>({
        suppliers,
        projects,
        supplierProjectIds,
        ranks,
      });
    } catch (err) {
      return createErrorResponse(err instanceof Error ? err.message : 'Failed to load NMR rank grid');
    }
  });

  ipcMain.handle('nmr-rank-grid:update', async (_event, params: unknown) => {
    const validation = validateInput(updateSchema, params);
    if (!validation.success) return validation.response;
    const { updates } = validation.data;

    try {
      await withTransaction(() => {
        for (const u of updates) {
          run(
            `UPDATE supplier_projects SET supplier_project_nmr_rank = ? WHERE id = ?`,
            [u.nmrRank, u.supplierProjectId]
          );
        }
      });

      createAuditEvent('supplier_project', 0, 'batch_update_nmr_ranks', {
        count: updates.length,
      });

      return createSuccessResponse({ updated: updates.length });
    } catch (err) {
      return createErrorResponse(err instanceof Error ? err.message : 'Failed to update NMR ranks');
    }
  });
}
