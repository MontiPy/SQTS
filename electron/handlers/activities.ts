import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run, withTransaction } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import type {
  ActivityTemplate,
  ActivityTemplateScheduleItem,
  ActivityTemplateApplicabilityRule,
  ActivityTemplateApplicabilityClause,
  TemplateVersion,
  TemplateSnapshot,
} from '@shared/types';

// Zod validation schemas
const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
});

const createTemplateScheduleItemSchema = z.object({
  activityTemplateId: z.number().int().positive(),
  kind: z.enum(['MILESTONE', 'TASK']),
  name: z.string().min(1, 'Name is required'),
  anchorType: z.enum(['FIXED_DATE', 'SCHEDULE_ITEM', 'COMPLETION', 'PROJECT_MILESTONE']),
  anchorRefId: z.number().int().nullable().optional(),
  offsetDays: z.number().int().nullable().optional(),
  fixedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const updateTemplateScheduleItemSchema = z.object({
  kind: z.enum(['MILESTONE', 'TASK']).optional(),
  name: z.string().min(1).optional(),
  anchorType: z.enum(['FIXED_DATE', 'SCHEDULE_ITEM', 'COMPLETION', 'PROJECT_MILESTONE']).optional(),
  anchorRefId: z.number().int().nullable().optional(),
  offsetDays: z.number().int().nullable().optional(),
  fixedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const createApplicabilityRuleSchema = z.object({
  activityTemplateId: z.number().int().positive(),
  operator: z.enum(['ALL', 'ANY']),
  enabled: z.boolean().optional(),
});

const updateApplicabilityRuleSchema = z.object({
  operator: z.enum(['ALL', 'ANY']).optional(),
  enabled: z.boolean().optional(),
});

const createApplicabilityClauseSchema = z.object({
  ruleId: z.number().int().positive(),
  subjectType: z.enum(['SUPPLIER_NMR', 'PART_PA']),
  comparator: z.enum(['IN', 'NOT_IN', 'EQ', 'NEQ', 'GTE', 'LTE']),
  value: z.string().min(1, 'Value is required'),
});

const updateApplicabilityClauseSchema = z.object({
  subjectType: z.enum(['SUPPLIER_NMR', 'PART_PA']).optional(),
  comparator: z.enum(['IN', 'NOT_IN', 'EQ', 'NEQ', 'GTE', 'LTE']).optional(),
  value: z.string().min(1).optional(),
});

export function registerActivityHandlers() {
  // Activity Templates
  ipcMain.handle('activity-templates:list', async () => {
    try {
      const templates = query<ActivityTemplate>(`
        SELECT at.*,
          (SELECT tv.name FROM template_versions tv
           WHERE tv.activity_template_id = at.id
           ORDER BY tv.created_at DESC LIMIT 1) AS latest_version_name
        FROM activity_templates at
        ORDER BY at.name
      `);
      return createSuccessResponse(templates);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('activity-templates:get', async (_, id: number) => {
    try {
      const template = queryOne<ActivityTemplate>('SELECT * FROM activity_templates WHERE id = ?', [id]);
      if (!template) {
        return createErrorResponse('Activity template not found');
      }
      return createSuccessResponse(template);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('activity-templates:create', async (_, params: unknown) => {
    try {
      const validated = createTemplateSchema.parse(params);

      run(
        `INSERT INTO activity_templates (name, description, category)
         VALUES (?, ?, ?)`,
        [validated.name, validated.description || null, validated.category || null]
      );

      const template = queryOne<ActivityTemplate>('SELECT * FROM activity_templates WHERE id = last_insert_rowid()');
      createAuditEvent('activity_template', template!.id, 'create', { name: validated.name });
      return createSuccessResponse(template);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('activity-templates:update', async (_, id: number, params: unknown) => {
    try {
      const validated = updateTemplateSchema.parse(params);

      const updates: string[] = [];
      const values: any[] = [];

      if (validated.name !== undefined) {
        updates.push('name = ?');
        values.push(validated.name);
      }
      if (validated.description !== undefined) {
        updates.push('description = ?');
        values.push(validated.description);
      }
      if (validated.category !== undefined) {
        updates.push('category = ?');
        values.push(validated.category);
      }

      if (updates.length === 0) {
        return createErrorResponse('No fields to update');
      }

      // Increment version on meaningful changes
      updates.push('updated_at = datetime("now")');
      updates.push('version = version + 1');
      values.push(id);
      run(`UPDATE activity_templates SET ${updates.join(', ')} WHERE id = ?`, values);

      const template = queryOne<ActivityTemplate>('SELECT * FROM activity_templates WHERE id = ?', [id]);
      createAuditEvent('activity_template', id, 'update', validated);
      return createSuccessResponse(template);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('activity-templates:delete', async (_, id: number) => {
    try {
      run('DELETE FROM activity_templates WHERE id = ?', [id]);
      createAuditEvent('activity_template', id, 'delete');
      return createSuccessResponse({ id });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('activity-templates:duplicate', async (_, id: number, newName: string) => {
    try {
      return await withTransaction(async () => {
        // Get the original template
        const original = queryOne<ActivityTemplate>('SELECT * FROM activity_templates WHERE id = ?', [id]);
        if (!original) {
          throw new Error('Template not found');
        }

        // Create new template
        run(
          `INSERT INTO activity_templates (name, description, category)
           VALUES (?, ?, ?)`,
          [newName, original.description, original.category]
        );
        const newTemplateId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!.id;

        // Copy schedule items
        const items = query<ActivityTemplateScheduleItem>(
          'SELECT * FROM activity_template_schedule_items WHERE activity_template_id = ? ORDER BY sort_order',
          [id]
        );

        const idMap = new Map<number, number>(); // old ID -> new ID

        for (const item of items) {
          run(
            `INSERT INTO activity_template_schedule_items
             (activity_template_id, kind, name, anchor_type, anchor_ref_id, offset_days, fixed_date, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [newTemplateId, item.kind, item.name, item.anchorType, null, item.offsetDays, item.fixedDate, item.sortOrder]
          );
          const newItemId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!.id;
          idMap.set(item.id, newItemId);
        }

        // Update anchor references
        for (const item of items) {
          if (item.anchorRefId && idMap.has(item.anchorRefId)) {
            const newItemId = idMap.get(item.id);
            const newAnchorRefId = idMap.get(item.anchorRefId);
            run(
              'UPDATE activity_template_schedule_items SET anchor_ref_id = ? WHERE id = ?',
              [newAnchorRefId, newItemId]
            );
          }
        }

        // Copy applicability rules and clauses
        const rule = queryOne<ActivityTemplateApplicabilityRule>(
          'SELECT * FROM activity_template_applicability_rules WHERE activity_template_id = ?',
          [id]
        );

        if (rule) {
          run(
            `INSERT INTO activity_template_applicability_rules (activity_template_id, operator, enabled)
             VALUES (?, ?, ?)`,
            [newTemplateId, rule.operator, rule.enabled]
          );
          const newRuleId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!.id;

          const clauses = query<ActivityTemplateApplicabilityClause>(
            'SELECT * FROM activity_template_applicability_clauses WHERE rule_id = ?',
            [rule.id]
          );

          for (const clause of clauses) {
            run(
              `INSERT INTO activity_template_applicability_clauses (rule_id, subject_type, comparator, value)
               VALUES (?, ?, ?, ?)`,
              [newRuleId, clause.subjectType, clause.comparator, clause.value]
            );
          }
        }

        const newTemplate = queryOne<ActivityTemplate>('SELECT * FROM activity_templates WHERE id = ?', [newTemplateId]);
        createAuditEvent('activity_template', newTemplateId, 'duplicate', { originalId: id, newName });
        return createSuccessResponse(newTemplate);
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Template Schedule Items
  ipcMain.handle('template-schedule-items:list', async (_, templateId: number) => {
    try {
      const items = query<ActivityTemplateScheduleItem>(
        'SELECT * FROM activity_template_schedule_items WHERE activity_template_id = ? ORDER BY sort_order',
        [templateId]
      );
      return createSuccessResponse(items);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('template-schedule-items:get', async (_, id: number) => {
    try {
      const item = queryOne<ActivityTemplateScheduleItem>(
        'SELECT * FROM activity_template_schedule_items WHERE id = ?',
        [id]
      );
      if (!item) {
        return createErrorResponse('Schedule item not found');
      }
      return createSuccessResponse(item);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('template-schedule-items:create', async (_, params: unknown) => {
    try {
      const validated = createTemplateScheduleItemSchema.parse(params);

      run(
        `INSERT INTO activity_template_schedule_items
         (activity_template_id, kind, name, anchor_type, anchor_ref_id, offset_days, fixed_date, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          validated.activityTemplateId,
          validated.kind,
          validated.name,
          validated.anchorType,
          validated.anchorRefId || null,
          validated.offsetDays || null,
          validated.fixedDate || null,
          validated.sortOrder || 0,
        ]
      );

      const item = queryOne<ActivityTemplateScheduleItem>(
        'SELECT * FROM activity_template_schedule_items WHERE id = last_insert_rowid()'
      );

      // Increment template version
      run(
        'UPDATE activity_templates SET version = version + 1, updated_at = datetime("now") WHERE id = ?',
        [validated.activityTemplateId]
      );

      createAuditEvent('template_schedule_item', item!.id, 'create', { name: validated.name });
      return createSuccessResponse(item);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('template-schedule-items:update', async (_, id: number, params: unknown) => {
    try {
      const validated = updateTemplateScheduleItemSchema.parse(params);

      const updates: string[] = [];
      const values: any[] = [];

      if (validated.kind !== undefined) {
        updates.push('kind = ?');
        values.push(validated.kind);
      }
      if (validated.name !== undefined) {
        updates.push('name = ?');
        values.push(validated.name);
      }
      if (validated.anchorType !== undefined) {
        updates.push('anchor_type = ?');
        values.push(validated.anchorType);
      }
      if (validated.anchorRefId !== undefined) {
        updates.push('anchor_ref_id = ?');
        values.push(validated.anchorRefId);
      }
      if (validated.offsetDays !== undefined) {
        updates.push('offset_days = ?');
        values.push(validated.offsetDays);
      }
      if (validated.fixedDate !== undefined) {
        updates.push('fixed_date = ?');
        values.push(validated.fixedDate);
      }
      if (validated.sortOrder !== undefined) {
        updates.push('sort_order = ?');
        values.push(validated.sortOrder);
      }

      if (updates.length === 0) {
        return createErrorResponse('No fields to update');
      }

      values.push(id);
      run(`UPDATE activity_template_schedule_items SET ${updates.join(', ')} WHERE id = ?`, values);

      const item = queryOne<ActivityTemplateScheduleItem>(
        'SELECT * FROM activity_template_schedule_items WHERE id = ?',
        [id]
      );

      // Increment template version
      if (item) {
        run(
          'UPDATE activity_templates SET version = version + 1, updated_at = datetime("now") WHERE id = ?',
          [item.activityTemplateId]
        );
      }

      createAuditEvent('template_schedule_item', id, 'update', validated);
      return createSuccessResponse(item);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('template-schedule-items:delete', async (_, id: number) => {
    try {
      const item = queryOne<ActivityTemplateScheduleItem>(
        'SELECT * FROM activity_template_schedule_items WHERE id = ?',
        [id]
      );

      run('DELETE FROM activity_template_schedule_items WHERE id = ?', [id]);

      // Increment template version
      if (item) {
        run(
          'UPDATE activity_templates SET version = version + 1, updated_at = datetime("now") WHERE id = ?',
          [item.activityTemplateId]
        );
      }

      createAuditEvent('template_schedule_item', id, 'delete');
      return createSuccessResponse({ id });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('template-schedule-items:reorder', async (_, items: Array<{ id: number; sortOrder: number }>) => {
    try {
      return await withTransaction(async () => {
        for (const item of items) {
          run('UPDATE activity_template_schedule_items SET sort_order = ? WHERE id = ?', [item.sortOrder, item.id]);
        }

        // Increment template version if items exist
        if (items.length > 0) {
          const firstItem = queryOne<ActivityTemplateScheduleItem>(
            'SELECT activity_template_id FROM activity_template_schedule_items WHERE id = ?',
            [items[0].id]
          );
          if (firstItem) {
            run(
              'UPDATE activity_templates SET version = version + 1, updated_at = datetime("now") WHERE id = ?',
              [firstItem.activityTemplateId]
            );
          }
        }

        return createSuccessResponse({ updated: items.length });
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Applicability Rules
  ipcMain.handle('applicability-rules:get', async (_, templateId: number) => {
    try {
      const rule = queryOne<ActivityTemplateApplicabilityRule>(
        'SELECT * FROM activity_template_applicability_rules WHERE activity_template_id = ?',
        [templateId]
      );
      return createSuccessResponse(rule);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('applicability-rules:create', async (_, params: unknown) => {
    try {
      const validated = createApplicabilityRuleSchema.parse(params);

      run(
        `INSERT INTO activity_template_applicability_rules (activity_template_id, operator, enabled)
         VALUES (?, ?, ?)`,
        [validated.activityTemplateId, validated.operator, validated.enabled ?? true]
      );

      const rule = queryOne<ActivityTemplateApplicabilityRule>(
        'SELECT * FROM activity_template_applicability_rules WHERE id = last_insert_rowid()'
      );

      createAuditEvent('applicability_rule', rule!.id, 'create', { templateId: validated.activityTemplateId });
      return createSuccessResponse(rule);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('applicability-rules:update', async (_, id: number, params: unknown) => {
    try {
      const validated = updateApplicabilityRuleSchema.parse(params);

      const updates: string[] = [];
      const values: any[] = [];

      if (validated.operator !== undefined) {
        updates.push('operator = ?');
        values.push(validated.operator);
      }
      if (validated.enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(validated.enabled);
      }

      if (updates.length === 0) {
        return createErrorResponse('No fields to update');
      }

      values.push(id);
      run(`UPDATE activity_template_applicability_rules SET ${updates.join(', ')} WHERE id = ?`, values);

      const rule = queryOne<ActivityTemplateApplicabilityRule>(
        'SELECT * FROM activity_template_applicability_rules WHERE id = ?',
        [id]
      );

      createAuditEvent('applicability_rule', id, 'update', validated);
      return createSuccessResponse(rule);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('applicability-rules:delete', async (_, id: number) => {
    try {
      run('DELETE FROM activity_template_applicability_rules WHERE id = ?', [id]);
      createAuditEvent('applicability_rule', id, 'delete');
      return createSuccessResponse({ id });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Applicability Clauses
  ipcMain.handle('applicability-clauses:list', async (_, ruleId: number) => {
    try {
      const clauses = query<ActivityTemplateApplicabilityClause>(
        'SELECT * FROM activity_template_applicability_clauses WHERE rule_id = ?',
        [ruleId]
      );
      return createSuccessResponse(clauses);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('applicability-clauses:create', async (_, params: unknown) => {
    try {
      const validated = createApplicabilityClauseSchema.parse(params);

      run(
        `INSERT INTO activity_template_applicability_clauses (rule_id, subject_type, comparator, value)
         VALUES (?, ?, ?, ?)`,
        [validated.ruleId, validated.subjectType, validated.comparator, validated.value]
      );

      const clause = queryOne<ActivityTemplateApplicabilityClause>(
        'SELECT * FROM activity_template_applicability_clauses WHERE id = last_insert_rowid()'
      );

      createAuditEvent('applicability_clause', clause!.id, 'create', { ruleId: validated.ruleId });
      return createSuccessResponse(clause);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('applicability-clauses:update', async (_, id: number, params: unknown) => {
    try {
      const validated = updateApplicabilityClauseSchema.parse(params);

      const updates: string[] = [];
      const values: any[] = [];

      if (validated.subjectType !== undefined) {
        updates.push('subject_type = ?');
        values.push(validated.subjectType);
      }
      if (validated.comparator !== undefined) {
        updates.push('comparator = ?');
        values.push(validated.comparator);
      }
      if (validated.value !== undefined) {
        updates.push('value = ?');
        values.push(validated.value);
      }

      if (updates.length === 0) {
        return createErrorResponse('No fields to update');
      }

      values.push(id);
      run(`UPDATE activity_template_applicability_clauses SET ${updates.join(', ')} WHERE id = ?`, values);

      const clause = queryOne<ActivityTemplateApplicabilityClause>(
        'SELECT * FROM activity_template_applicability_clauses WHERE id = ?',
        [id]
      );

      createAuditEvent('applicability_clause', id, 'update', validated);
      return createSuccessResponse(clause);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('applicability-clauses:delete', async (_, id: number) => {
    try {
      run('DELETE FROM activity_template_applicability_clauses WHERE id = ?', [id]);
      createAuditEvent('applicability_clause', id, 'delete');
      return createSuccessResponse({ id });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Template Versions
  ipcMain.handle('template-versions:list', async (_, templateId: number) => {
    try {
      const versions = query<TemplateVersion>(
        'SELECT * FROM template_versions WHERE activity_template_id = ? ORDER BY created_at DESC',
        [templateId]
      );
      return createSuccessResponse(versions);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('template-versions:get', async (_, id: number) => {
    try {
      const version = queryOne<TemplateVersion>(
        'SELECT * FROM template_versions WHERE id = ?',
        [id]
      );
      if (!version) {
        return createErrorResponse('Version not found');
      }
      return createSuccessResponse(version);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('template-versions:save', async (_, params: { activityTemplateId: number; name: string; description?: string }) => {
    try {
      const template = queryOne<ActivityTemplate>(
        'SELECT * FROM activity_templates WHERE id = ?',
        [params.activityTemplateId]
      );
      if (!template) {
        return createErrorResponse('Template not found');
      }

      const items = query<ActivityTemplateScheduleItem>(
        'SELECT * FROM activity_template_schedule_items WHERE activity_template_id = ? ORDER BY sort_order',
        [params.activityTemplateId]
      );

      // Build ID-to-index map for portable anchor references
      const idToIndex = new Map<number, number>();
      items.forEach((item, index) => {
        idToIndex.set(item.id, index);
      });

      const snapshot: TemplateSnapshot = {
        template: {
          name: template.name,
          description: template.description,
          category: template.category,
        },
        scheduleItems: items.map(item => ({
          kind: item.kind,
          name: item.name,
          anchorType: item.anchorType,
          anchorRefIndex: item.anchorRefId != null ? (idToIndex.get(item.anchorRefId) ?? null) : null,
          anchorMilestoneName: (item as any).anchorMilestoneName || null,
          offsetDays: item.offsetDays,
          fixedDate: item.fixedDate,
          sortOrder: item.sortOrder,
        })),
      };

      run(
        `INSERT INTO template_versions (activity_template_id, name, description, version_number, snapshot)
         VALUES (?, ?, ?, ?, ?)`,
        [params.activityTemplateId, params.name, params.description || null, template.version, JSON.stringify(snapshot)]
      );

      const version = queryOne<TemplateVersion>(
        'SELECT * FROM template_versions WHERE id = last_insert_rowid()'
      );

      createAuditEvent('template_version', version!.id, 'save', { templateId: params.activityTemplateId, name: params.name });
      return createSuccessResponse(version);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('template-versions:restore', async (_, id: number) => {
    try {
      return await withTransaction(async () => {
        const version = queryOne<TemplateVersion>(
          'SELECT * FROM template_versions WHERE id = ?',
          [id]
        );
        if (!version) {
          throw new Error('Version not found');
        }

        const snapshot: TemplateSnapshot = JSON.parse(version.snapshot);

        // Update template fields
        run(
          `UPDATE activity_templates SET name = ?, description = ?, category = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?`,
          [snapshot.template.name, snapshot.template.description, snapshot.template.category, version.activityTemplateId]
        );

        // Delete existing schedule items
        run(
          'DELETE FROM activity_template_schedule_items WHERE activity_template_id = ?',
          [version.activityTemplateId]
        );

        // Re-insert schedule items from snapshot (first pass: no anchor refs)
        const newIds: number[] = [];
        for (const item of snapshot.scheduleItems) {
          run(
            `INSERT INTO activity_template_schedule_items
             (activity_template_id, kind, name, anchor_type, anchor_ref_id, offset_days, fixed_date, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [version.activityTemplateId, item.kind, item.name, item.anchorType, null, item.offsetDays, item.fixedDate, item.sortOrder]
          );
          const newItem = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')!;
          newIds.push(newItem.id);
        }

        // Second pass: set anchor references using index mapping
        for (let i = 0; i < snapshot.scheduleItems.length; i++) {
          const item = snapshot.scheduleItems[i];
          if (item.anchorRefIndex != null && item.anchorRefIndex >= 0 && item.anchorRefIndex < newIds.length) {
            run(
              'UPDATE activity_template_schedule_items SET anchor_ref_id = ? WHERE id = ?',
              [newIds[item.anchorRefIndex], newIds[i]]
            );
          }
        }

        const template = queryOne<ActivityTemplate>(
          'SELECT * FROM activity_templates WHERE id = ?',
          [version.activityTemplateId]
        );

        createAuditEvent('template_version', id, 'restore', { templateId: version.activityTemplateId });
        return createSuccessResponse(template);
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('template-versions:delete', async (_, id: number) => {
    try {
      run('DELETE FROM template_versions WHERE id = ?', [id]);
      createAuditEvent('template_version', id, 'delete');
      return createSuccessResponse({ id });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
}
