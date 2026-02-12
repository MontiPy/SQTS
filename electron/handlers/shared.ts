import { z, ZodSchema, ZodError } from 'zod';
import type { APIResponse } from '@shared/types';
import { run } from '../database';

// Common Zod schemas for reuse across handlers
export const idSchema = z.number().int().positive('ID must be a positive integer');

/**
 * Validates input against a Zod schema.
 * Returns parsed data on success, or an error response on validation failure.
 */
export function validateInput<T>(schema: ZodSchema<T>, args: unknown): { success: true; data: T } | { success: false; response: APIResponse<never> } {
  try {
    return { success: true, data: schema.parse(args) };
  } catch (err) {
    if (err instanceof ZodError) {
      return { success: false, response: createErrorResponse(`Validation error: ${err.errors.map(e => e.message).join(', ')}`) };
    }
    throw err;
  }
}

export function createSuccessResponse<T>(data: T): APIResponse<T> {
  return {
    success: true,
    data,
  };
}

export function createErrorResponse(error: string): APIResponse {
  return {
    success: false,
    error,
  };
}

export function createAuditEvent(
  entityType: string,
  entityId: number | null,
  action: string,
  details?: any
): void {
  const detailsJson = details ? JSON.stringify(details) : null;
  run(
    'INSERT INTO audit_events (entity_type, entity_id, action, details) VALUES (?, ?, ?, ?)',
    [entityType, entityId, action, detailsJson]
  );
}
