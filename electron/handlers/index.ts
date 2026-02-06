import { registerSupplierHandlers } from './suppliers';
import { registerProjectHandlers } from './projects';
import { registerActivityHandlers } from './activities';
import { registerSupplierInstanceHandlers } from './supplier-instances';
import { registerPropagationHandlers } from './propagation';
import { registerImportExportHandlers } from './import-export';
import { registerSettingsHandlers } from './settings';

export function registerHandlers() {
  registerSupplierHandlers();
  registerProjectHandlers();
  registerActivityHandlers();
  registerSupplierInstanceHandlers();
  registerPropagationHandlers();
  registerImportExportHandlers();
  registerSettingsHandlers();
}
