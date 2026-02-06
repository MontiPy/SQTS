import { ipcMain } from 'electron';
import { z } from 'zod';
import { query, queryOne, run } from '../database';
import { createSuccessResponse, createErrorResponse, createAuditEvent } from './shared';

interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

// Zod schemas
const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export function registerSettingsHandlers() {
  // Get all settings as key-value map
  ipcMain.handle('settings:get-all', async () => {
    try {
      const settings = query<Setting>('SELECT * FROM settings');
      const settingsMap: Record<string, string> = {};
      settings.forEach((s) => {
        settingsMap[s.key] = s.value;
      });
      return createSuccessResponse(settingsMap);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Get single setting
  ipcMain.handle('settings:get', async (_, key: string) => {
    try {
      const setting = queryOne<Setting>('SELECT * FROM settings WHERE key = ?', [key]);
      if (!setting) {
        return createErrorResponse('Setting not found');
      }
      return createSuccessResponse(setting.value);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });

  // Update or create setting
  ipcMain.handle('settings:update', async (_, params: unknown) => {
    try {
      const validated = updateSettingSchema.parse(params);

      run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`,
        [validated.key, validated.value, validated.value]
      );

      createAuditEvent('setting', null, 'update', { key: validated.key, value: validated.value });
      return createSuccessResponse({ key: validated.key, value: validated.value });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return createErrorResponse(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
      }
      return createErrorResponse(error.message);
    }
  });
}
