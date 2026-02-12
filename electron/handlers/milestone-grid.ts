import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, withTransaction, run } from '../database';
import { createSuccessResponse, createErrorResponse, validateInput } from './shared';
import type { MilestoneDateGridData } from '@shared/types';

const updateSchema = z.object({
  updates: z.array(z.object({
    milestoneId: z.number().int().positive(),
    date: z.string().nullable(),
  })),
});

export function registerMilestoneGridHandlers() {
  ipcMain.handle('milestone-grid:get', async () => {
    try {
      // Get all projects
      const projects = query<{ id: number; name: string; version: string }>(
        `SELECT id, name, version FROM projects ORDER BY name`
      );

      // Get all milestones across all projects
      const allMilestones = query<{
        id: number;
        projectId: number;
        name: string;
        category: string | null;
        date: string | null;
        sortOrder: number;
      }>(
        `SELECT id, project_id, name, category, date, sort_order
         FROM project_milestones
         ORDER BY sort_order, id`
      );

      // Build unique rows (category + name pairs), preserving sort order
      const rowSet = new Map<string, { category: string; name: string; minSort: number }>();
      for (const m of allMilestones) {
        const cat = m.category || 'Uncategorized';
        const key = `${cat}::${m.name}`;
        const existing = rowSet.get(key);
        if (!existing || m.sortOrder < existing.minSort) {
          rowSet.set(key, { category: cat, name: m.name, minSort: m.sortOrder });
        }
      }

      // Sort rows by minSort then name
      const rows = Array.from(rowSet.values())
        .sort((a, b) => a.minSort - b.minSort || a.name.localeCompare(b.name))
        .map(({ category, name }) => ({ category, name }));

      // Build cells: key = `${projectId}::${category}::${name}`
      const cells: Record<string, { milestoneId: number; date: string | null }> = {};
      for (const m of allMilestones) {
        const cat = m.category || 'Uncategorized';
        cells[`${m.projectId}::${cat}::${m.name}`] = {
          milestoneId: m.id,
          date: m.date,
        };
      }

      return createSuccessResponse<MilestoneDateGridData>({ projects, rows, cells });
    } catch (err) {
      return createErrorResponse(err instanceof Error ? err.message : 'Failed to load milestone grid');
    }
  });

  ipcMain.handle('milestone-grid:update', async (_event, params: unknown) => {
    const validation = validateInput(updateSchema, params);
    if (!validation.success) return validation.response;
    const { updates } = validation.data;

    try {
      await withTransaction(() => {
        for (const u of updates) {
          run(
            `UPDATE project_milestones SET date = ? WHERE id = ?`,
            [u.date, u.milestoneId]
          );
        }
      });

      return createSuccessResponse({ updated: updates.length });
    } catch (err) {
      return createErrorResponse(err instanceof Error ? err.message : 'Failed to update milestone dates');
    }
  });
}
