import { ipcMain } from 'electron';
import { z } from 'zod';
import { query } from '../database';
import { createSuccessResponse, createErrorResponse } from './shared';
import type { SearchResult } from '@shared/types';

const searchSchema = z.string().min(1).max(200);

export function registerSearchHandlers() {
  ipcMain.handle('search:global', async (_event, queryStr: unknown) => {
    try {
      const q = searchSchema.parse(queryStr);
      const term = `%${q}%`;
      const exactTerm = q.toLowerCase();
      const startsTerm = `${q}%`;

      const suppliers = query<{ id: number; name: string }>(
        `SELECT id, name FROM suppliers WHERE name LIKE ? LIMIT 5`,
        [term]
      );

      const projects = query<{ id: number; name: string; version: string }>(
        `SELECT id, name, version FROM projects WHERE name LIKE ? LIMIT 5`,
        [term]
      );

      const activityTemplates = query<{ id: number; name: string; category: string | null }>(
        `SELECT id, name, category FROM activity_templates WHERE name LIKE ? LIMIT 5`,
        [term]
      );

      const projectTemplates = query<{ id: number; name: string }>(
        `SELECT id, name FROM project_templates WHERE name LIKE ? LIMIT 5`,
        [term]
      );

      const parts = query<{ id: number; partNumber: string; description: string | null }>(
        `SELECT id, part_number, description FROM parts WHERE part_number LIKE ? LIMIT 5`,
        [term]
      );

      const results: SearchResult[] = [
        ...suppliers.map((s) => ({ id: s.id, name: s.name, type: 'supplier' as const })),
        ...projects.map((p) => ({ id: p.id, name: p.name, type: 'project' as const, subtitle: p.version })),
        ...activityTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          type: 'activity-template' as const,
          subtitle: t.category || undefined,
        })),
        ...projectTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          type: 'project-template' as const,
        })),
        ...parts.map((p) => ({
          id: p.id,
          name: p.partNumber,
          type: 'part' as const,
          subtitle: p.description || undefined,
        })),
      ];

      // Sort: exact match first, then starts-with, then contains
      results.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aExact = aName === exactTerm ? 0 : 1;
        const bExact = bName === exactTerm ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        const aStarts = aName.startsWith(exactTerm) ? 0 : 1;
        const bStarts = bName.startsWith(exactTerm) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return aName.localeCompare(bName);
      });

      return createSuccessResponse({ results });
    } catch (err) {
      return createErrorResponse(err instanceof Error ? err.message : 'Search failed');
    }
  });
}
