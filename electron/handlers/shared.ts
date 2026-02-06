import type { APIResponse } from '@shared/types';
import { run } from '../database';

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
