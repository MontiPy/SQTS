import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import type { SupplierLocationCode, Part } from '@shared/types';

// --- Zod Schemas ---

const createLocationCodeSchema = z.object({
  supplierId: z.number().int().positive(),
  supplierNumber: z.string().min(1, 'Supplier number is required'),
  locationCode: z.string().min(1, 'Location code is required'),
});

const updateLocationCodeSchema = z.object({
  supplierNumber: z.string().min(1).optional(),
  locationCode: z.string().min(1).optional(),
});

const createPartSchema = z.object({
  supplierProjectId: z.number().int().positive(),
  locationCodeId: z.number().int().positive().optional().nullable(),
  partNumber: z.string().min(1, 'Part number is required'),
  description: z.string().optional().nullable(),
  paRank: z.string().optional().nullable(),
});

const updatePartSchema = z.object({
  locationCodeId: z.number().int().positive().optional().nullable(),
  partNumber: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  paRank: z.string().optional().nullable(),
});

export function registerPartsHandlers() {
  // ==========================================
  // Location Codes
  // ==========================================

  ipcMain.handle('location-codes:list', async (_, supplierId: unknown) => {
    try {
      const validId = z.number().int().positive().parse(supplierId);
      const codes = query<SupplierLocationCode>(
        'SELECT * FROM supplier_location_codes WHERE supplier_id = ? ORDER BY location_code',
        [validId]
      );
      return createSuccessResponse(codes);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('location-codes:get', async (_, id: unknown) => {
    try {
      const validId = z.number().int().positive().parse(id);
      const code = queryOne<SupplierLocationCode>(
        'SELECT * FROM supplier_location_codes WHERE id = ?',
        [validId]
      );
      if (!code) {
        return createErrorResponse('Location code not found');
      }
      return createSuccessResponse(code);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('location-codes:create', async (_, params: unknown) => {
    try {
      const validated = createLocationCodeSchema.parse(params);

      run(
        `INSERT INTO supplier_location_codes (supplier_id, supplier_number, location_code)
         VALUES (?, ?, ?)`,
        [validated.supplierId, validated.supplierNumber, validated.locationCode]
      );

      const code = queryOne<SupplierLocationCode>(
        'SELECT * FROM supplier_location_codes WHERE id = last_insert_rowid()'
      );
      createAuditEvent('location_code', code!.id, 'create', {
        supplierId: validated.supplierId,
        locationCode: validated.locationCode,
      });
      return createSuccessResponse(code);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('location-codes:update', async (_, id: number, params: unknown) => {
    try {
      const validated = updateLocationCodeSchema.parse(params);

      const updates: string[] = [];
      const values: any[] = [];

      if (validated.supplierNumber !== undefined) {
        updates.push('supplier_number = ?');
        values.push(validated.supplierNumber);
      }
      if (validated.locationCode !== undefined) {
        updates.push('location_code = ?');
        values.push(validated.locationCode);
      }

      if (updates.length === 0) {
        return createErrorResponse('No fields to update');
      }

      values.push(id);
      run(`UPDATE supplier_location_codes SET ${updates.join(', ')} WHERE id = ?`, values);

      const code = queryOne<SupplierLocationCode>(
        'SELECT * FROM supplier_location_codes WHERE id = ?',
        [id]
      );
      createAuditEvent('location_code', id, 'update', validated);
      return createSuccessResponse(code);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('location-codes:delete', async (_, id: unknown) => {
    try {
      const validId = z.number().int().positive().parse(id);
      // Check if any parts reference this location code
      const partCount = queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM parts WHERE location_code_id = ?',
        [validId]
      );

      if (partCount && partCount.count > 0) {
        return createErrorResponse(
          `Cannot delete location code: ${partCount.count} part(s) are using this location code. Remove or reassign parts first.`
        );
      }

      run('DELETE FROM supplier_location_codes WHERE id = ?', [validId]);
      createAuditEvent('location_code', validId, 'delete');
      return createSuccessResponse({ id: validId });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // ==========================================
  // Parts
  // ==========================================

  ipcMain.handle('parts:list', async (_, supplierProjectId: unknown) => {
    try {
      const validId = z.number().int().positive().parse(supplierProjectId);
      const parts = query<Part & { locationCode?: string; supplierNumber?: string }>(
        `SELECT p.*, slc.location_code AS locationCode, slc.supplier_number AS supplierNumber
         FROM parts p
         LEFT JOIN supplier_location_codes slc ON p.location_code_id = slc.id
         WHERE p.supplier_project_id = ?
         ORDER BY p.part_number`,
        [validId]
      );
      return createSuccessResponse(parts);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('parts:get', async (_, id: unknown) => {
    try {
      const validId = z.number().int().positive().parse(id);
      const part = queryOne<Part>(
        'SELECT * FROM parts WHERE id = ?',
        [validId]
      );
      if (!part) {
        return createErrorResponse('Part not found');
      }
      return createSuccessResponse(part);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('parts:create', async (_, params: unknown) => {
    try {
      const validated = createPartSchema.parse(params);

      run(
        `INSERT INTO parts (supplier_project_id, location_code_id, part_number, description, pa_rank)
         VALUES (?, ?, ?, ?, ?)`,
        [
          validated.supplierProjectId,
          validated.locationCodeId || null,
          validated.partNumber,
          validated.description || null,
          validated.paRank || null,
        ]
      );

      const part = queryOne<Part>('SELECT * FROM parts WHERE id = last_insert_rowid()');
      createAuditEvent('part', part!.id, 'create', {
        partNumber: validated.partNumber,
        supplierProjectId: validated.supplierProjectId,
      });
      return createSuccessResponse(part);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('parts:update', async (_, id: number, params: unknown) => {
    try {
      const validated = updatePartSchema.parse(params);

      const updates: string[] = [];
      const values: any[] = [];

      if (validated.partNumber !== undefined) {
        updates.push('part_number = ?');
        values.push(validated.partNumber);
      }
      if (validated.description !== undefined) {
        updates.push('description = ?');
        values.push(validated.description);
      }
      if (validated.paRank !== undefined) {
        updates.push('pa_rank = ?');
        values.push(validated.paRank);
      }
      if (validated.locationCodeId !== undefined) {
        updates.push('location_code_id = ?');
        values.push(validated.locationCodeId);
      }

      if (updates.length === 0) {
        return createErrorResponse('No fields to update');
      }

      values.push(id);
      run(`UPDATE parts SET ${updates.join(', ')} WHERE id = ?`, values);

      const part = queryOne<Part>('SELECT * FROM parts WHERE id = ?', [id]);
      createAuditEvent('part', id, 'update', validated);
      return createSuccessResponse(part);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  ipcMain.handle('parts:delete', async (_, id: unknown) => {
    try {
      const validId = z.number().int().positive().parse(id);
      run('DELETE FROM parts WHERE id = ?', [validId]);
      createAuditEvent('part', validId, 'delete');
      return createSuccessResponse({ id: validId });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });
}
