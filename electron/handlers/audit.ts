import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne } from '../database';
import { createSuccessResponse, createErrorResponse } from './shared';

const listSchema = z.object({
  entityType: z.string().optional(),
  action: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
}).optional().default({});

export function registerAuditHandlers() {
  ipcMain.handle('audit:list', async (_event, params: unknown) => {
    try {
      const parsed = listSchema.parse(params);
      const { entityType, action, search, startDate, endDate, limit, offset } = {
        limit: 50,
        offset: 0,
        ...parsed,
      };

      const conditions: string[] = [];
      const args: any[] = [];

      if (entityType) {
        conditions.push('entity_type = ?');
        args.push(entityType);
      }
      if (action) {
        conditions.push('action = ?');
        args.push(action);
      }
      if (search) {
        conditions.push('(entity_type LIKE ? OR action LIKE ? OR details LIKE ?)');
        const term = `%${search}%`;
        args.push(term, term, term);
      }
      if (startDate) {
        conditions.push('created_at >= ?');
        args.push(startDate);
      }
      if (endDate) {
        conditions.push('created_at <= ?');
        args.push(endDate + 'T23:59:59');
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM audit_events ${whereClause}`,
        args
      );
      const total = countResult?.total ?? 0;

      // Get paginated events
      const events = query<{
        id: number;
        entityType: string;
        entityId: number | null;
        action: string;
        details: string | null;
        createdAt: string;
      }>(
        `SELECT id, entity_type, entity_id, action, details, created_at
         FROM audit_events ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...args, limit, offset]
      );

      // Parse details JSON
      const parsed_events = events.map((e) => ({
        ...e,
        details: e.details ? (() => { try { return JSON.parse(e.details as string); } catch { return null; } })() : null,
      }));

      return createSuccessResponse({ events: parsed_events, total });
    } catch (err) {
      return createErrorResponse(err instanceof Error ? err.message : 'Failed to list audit events');
    }
  });
}
