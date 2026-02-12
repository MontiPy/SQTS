import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';
import type { AppSettings } from '@shared/types';

interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

// Zod schemas
const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.boolean(), z.array(z.string())]),
});

function parseSettingValue(key: string, value: string): string | boolean | string[] {
  // Parse value based on key type
  if (key === 'nmr_ranks' || key === 'pa_ranks') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (key === 'propagation_skip_complete' || key === 'propagation_skip_locked' ||
      key === 'propagation_skip_overridden' || key === 'use_business_days' ||
      key === 'auto_propagate_template_changes' || key === 'auto_propagate_to_suppliers') {
    return value === 'true';
  }
  return value;
}

function serializeSettingValue(value: string | boolean | string[]): string {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export function registerSettingsHandlers() {
  // Get all settings as AppSettings object
  ipcMain.handle('settings:get-all', async () => {
    try {
      const settings = query<Setting>('SELECT * FROM settings');
      const settingsMap: Record<string, string> = {};
      settings.forEach((s) => {
        settingsMap[s.key] = s.value;
      });

      // Convert to AppSettings format
      const appSettings: AppSettings = {
        nmrRanks: parseSettingValue('nmr_ranks', settingsMap['nmr_ranks'] || '[]') as string[],
        paRanks: parseSettingValue('pa_ranks', settingsMap['pa_ranks'] || '[]') as string[],
        propagationSkipComplete: parseSettingValue('propagation_skip_complete', settingsMap['propagation_skip_complete'] || 'true') as boolean,
        propagationSkipLocked: parseSettingValue('propagation_skip_locked', settingsMap['propagation_skip_locked'] || 'true') as boolean,
        propagationSkipOverridden: parseSettingValue('propagation_skip_overridden', settingsMap['propagation_skip_overridden'] || 'true') as boolean,
        dateFormat: settingsMap['date_format'] || 'yyyy-MM-dd',
        useBusinessDays: parseSettingValue('use_business_days', settingsMap['use_business_days'] || 'false') as boolean,
        autoPropagateTemplateChanges: parseSettingValue('auto_propagate_template_changes', settingsMap['auto_propagate_template_changes'] || 'false') as boolean,
        autoPropagateToSuppliers: parseSettingValue('auto_propagate_to_suppliers', settingsMap['auto_propagate_to_suppliers'] || 'false') as boolean,
      };

      return createSuccessResponse(appSettings);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Get single setting
  ipcMain.handle('settings:get', async (_, key: unknown) => {
    try {
      const validKey = z.string().min(1, 'Setting key is required').parse(key);
      const setting = queryOne<Setting>('SELECT * FROM settings WHERE key = ?', [validKey]);
      if (!setting) {
        return createErrorResponse('Setting not found');
      }
      return createSuccessResponse(setting.value);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });

  // Update or create setting
  ipcMain.handle('settings:update', async (_, params: unknown) => {
    try {
      const validated = updateSettingSchema.parse(params);
      const serializedValue = serializeSettingValue(validated.value);

      run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`,
        [validated.key, serializedValue, serializedValue]
      );

      createAuditEvent('setting', null, 'update', { key: validated.key, value: serializedValue });
      return createSuccessResponse({ key: validated.key, value: validated.value });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });
}
