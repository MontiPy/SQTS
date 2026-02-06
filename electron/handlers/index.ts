import { registerSupplierHandlers } from './suppliers';
import { registerProjectHandlers } from './projects';
import { registerActivityHandlers } from './activities';
import { registerSupplierInstanceHandlers } from './supplier-instances';
import { registerPropagationHandlers } from './propagation';
import { registerImportExportHandlers } from './import-export';
import { registerSettingsHandlers } from './settings';
import { registerDashboardHandlers } from './dashboard';

export function registerHandlers() {
  console.log('[SQTS] Registering all IPC handlers...');
  registerSupplierHandlers();
  console.log('[SQTS] Supplier handlers registered');
  registerProjectHandlers();
  console.log('[SQTS] Project handlers registered');
  registerActivityHandlers();
  console.log('[SQTS] Activity handlers registered');
  registerSupplierInstanceHandlers();
  console.log('[SQTS] Supplier instance handlers registered');
  registerPropagationHandlers();
  console.log('[SQTS] Propagation handlers registered');
  registerImportExportHandlers();
  console.log('[SQTS] Import/export handlers registered');
  registerSettingsHandlers();
  console.log('[SQTS] Settings handlers registered');
  registerDashboardHandlers();
  console.log('[SQTS] Dashboard handlers registered');
  console.log('[SQTS] All handlers registered successfully');
}
