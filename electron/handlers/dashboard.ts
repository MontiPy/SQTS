import { ipcMain } from 'electron';
import { query } from '../database';
import { createSuccessResponse, createErrorResponse } from './shared';
import type { OverdueItem, DashboardStats } from '@shared/types';

export function registerDashboardHandlers() {
  // Get dashboard stats
  ipcMain.handle('dashboard:stats', async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Overdue count
      const overdueResult = query<{ count: number }>(
        `SELECT COUNT(*) as count FROM supplier_schedule_item_instances ssii
         WHERE ssii.planned_date < ?
         AND ssii.planned_date IS NOT NULL
         AND ssii.status NOT IN ('Complete', 'Not Required')`,
        [today]
      );

      // Due soon count (next 7 days)
      const dueSoonResult = query<{ count: number }>(
        `SELECT COUNT(*) as count FROM supplier_schedule_item_instances ssii
         WHERE ssii.planned_date >= ? AND ssii.planned_date <= ?
         AND ssii.planned_date IS NOT NULL
         AND ssii.status NOT IN ('Complete', 'Not Required')`,
        [today, weekFromNow]
      );

      // In progress count
      const inProgressResult = query<{ count: number }>(
        `SELECT COUNT(*) as count FROM supplier_schedule_item_instances ssii
         WHERE ssii.status = 'In Progress'`,
        []
      );

      // Recently updated (last 24 hours) - use created_at as a proxy since we don't track updated_at on instances
      const recentResult = query<{ count: number }>(
        `SELECT COUNT(*) as count FROM supplier_schedule_item_instances ssii
         WHERE ssii.actual_date >= ?`,
        [yesterday]
      );

      const stats: DashboardStats = {
        overdue: overdueResult[0]?.count ?? 0,
        dueSoon: dueSoonResult[0]?.count ?? 0,
        inProgress: inProgressResult[0]?.count ?? 0,
        recentlyUpdated: recentResult[0]?.count ?? 0,
      };

      return createSuccessResponse(stats);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Get overdue items list
  ipcMain.handle('dashboard:overdue', async (_, params?: {
    supplierId?: number;
    projectId?: number;
  }) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      let sql = `
        SELECT
          ssii.id as instance_id,
          s.name as supplier_name,
          s.id as supplier_id,
          p.name as project_name,
          p.id as project_id,
          at.name as activity_name,
          psi.name as item_name,
          ssii.planned_date,
          ssii.status,
          CAST(julianday(?) - julianday(ssii.planned_date) AS INTEGER) as days_overdue
        FROM supplier_schedule_item_instances ssii
        JOIN supplier_activity_instances sai ON ssii.supplier_activity_instance_id = sai.id
        JOIN supplier_projects sp ON sai.supplier_project_id = sp.id
        JOIN suppliers s ON sp.supplier_id = s.id
        JOIN projects p ON sp.project_id = p.id
        JOIN project_activities pa ON sai.project_activity_id = pa.id
        JOIN activity_templates at ON pa.activity_template_id = at.id
        JOIN project_schedule_items psi ON ssii.project_schedule_item_id = psi.id
        WHERE ssii.planned_date < ?
        AND ssii.planned_date IS NOT NULL
        AND ssii.status NOT IN ('Complete', 'Not Required')
      `;

      const sqlParams: any[] = [today, today];

      if (params?.supplierId) {
        sql += ' AND s.id = ?';
        sqlParams.push(params.supplierId);
      }

      if (params?.projectId) {
        sql += ' AND p.id = ?';
        sqlParams.push(params.projectId);
      }

      sql += ' ORDER BY ssii.planned_date ASC, s.name ASC';

      const items = query<OverdueItem>(sql, sqlParams);

      return createSuccessResponse(items);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
}
