import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import type { Supplier } from '@shared/types';

// Zod validation schemas
const createSupplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  notes: z.string().optional().nullable(),
  nmrRank: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal('')),
  contactPhone: z.string().optional().nullable(),
});

const updateSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().optional().nullable(),
  nmrRank: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal('')),
  contactPhone: z.string().optional().nullable(),
});

const searchSuppliersSchema = z.object({
  search: z.string().optional(),
  nmrRank: z.string().optional().nullable(),
});

export function registerSupplierHandlers() {
  // List suppliers with optional search/filter
  ipcMain.handle('suppliers:list', async (_, params?: unknown) => {
    try {
      const validated = params ? searchSuppliersSchema.parse(params) : {};

      let sql = 'SELECT * FROM suppliers';
      const conditions: string[] = [];
      const values: any[] = [];

      if (validated.search) {
        conditions.push('(name LIKE ? OR notes LIKE ?)');
        const searchPattern = `%${validated.search}%`;
        values.push(searchPattern, searchPattern);
      }

      if (validated.nmrRank) {
        conditions.push('nmr_rank = ?');
        values.push(validated.nmrRank);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY name';

      const suppliers = query<Supplier>(sql, values);
      return createSuccessResponse(suppliers);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('suppliers:get', async (_, id: number) => {
    try {
      const supplier = queryOne<Supplier>('SELECT * FROM suppliers WHERE id = ?', [id]);
      if (!supplier) {
        return createErrorResponse('Supplier not found');
      }
      return createSuccessResponse(supplier);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('suppliers:create', async (_, params: unknown) => {
    try {
      const validated = createSupplierSchema.parse(params);

      run(
        `INSERT INTO suppliers (name, notes, nmr_rank, contact_name, contact_email, contact_phone)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          validated.name,
          validated.notes || null,
          validated.nmrRank || null,
          validated.contactName || null,
          validated.contactEmail || null,
          validated.contactPhone || null,
        ]
      );

      const supplier = queryOne<Supplier>('SELECT * FROM suppliers WHERE id = last_insert_rowid()');
      createAuditEvent('supplier', supplier!.id, 'create', { name: validated.name });
      return createSuccessResponse(supplier);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('suppliers:update', async (_, id: number, params: unknown) => {
    try {
      const validated = updateSupplierSchema.parse(params);

      const updates: string[] = [];
      const values: any[] = [];

      if (validated.name !== undefined) {
        updates.push('name = ?');
        values.push(validated.name);
      }
      if (validated.notes !== undefined) {
        updates.push('notes = ?');
        values.push(validated.notes);
      }
      if (validated.nmrRank !== undefined) {
        updates.push('nmr_rank = ?');
        values.push(validated.nmrRank);
      }
      if (validated.contactName !== undefined) {
        updates.push('contact_name = ?');
        values.push(validated.contactName);
      }
      if (validated.contactEmail !== undefined) {
        updates.push('contact_email = ?');
        values.push(validated.contactEmail || null);
      }
      if (validated.contactPhone !== undefined) {
        updates.push('contact_phone = ?');
        values.push(validated.contactPhone);
      }

      if (updates.length === 0) {
        return createErrorResponse('No fields to update');
      }

      values.push(id);
      run(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`, values);

      const supplier = queryOne<Supplier>('SELECT * FROM suppliers WHERE id = ?', [id]);
      createAuditEvent('supplier', id, 'update', validated);
      return createSuccessResponse(supplier);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('suppliers:delete', async (_, id: number) => {
    try {
      // Check if supplier has projects (cascade check)
      const projectCount = queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM supplier_projects WHERE supplier_id = ?',
        [id]
      );

      if (projectCount && projectCount.count > 0) {
        return createErrorResponse(
          `Cannot delete supplier: ${projectCount.count} project(s) are associated with this supplier. Remove projects first.`
        );
      }

      run('DELETE FROM suppliers WHERE id = ?', [id]);
      createAuditEvent('supplier', id, 'delete');
      return createSuccessResponse({ id });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
}
