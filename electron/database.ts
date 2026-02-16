import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: SqlJsDatabase | null = null;
let dbPath: string = '';
let saveTimeout: NodeJS.Timeout | null = null;

// WASM file location fallback paths
async function getWasmPath(): Promise<string> {
  const paths = [
    // Development: node_modules
    path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'),
    // Production: extraResources
    path.join(process.resourcesPath, 'sql-wasm.wasm'),
    // Fallback: relative to executable
    path.join(path.dirname(app.getPath('exe')), 'resources/sql-wasm.wasm'),
  ];

  for (const wasmPath of paths) {
    const exists = fs.existsSync(wasmPath);
    console.log(`[SQTS] WASM path check: ${wasmPath} -> ${exists ? 'FOUND' : 'not found'}`);
    if (exists) {
      return wasmPath;
    }
  }

  throw new Error('sql-wasm.wasm not found. Checked paths: ' + paths.join(', '));
}

export async function getDatabase(): Promise<SqlJsDatabase> {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'supplier-tracking.db');

  const wasmPath = await getWasmPath();
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  // Load existing database or create new
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Run migrations
  console.log('[SQTS] Running migrations...');
  await runMigrations(db);
  console.log('[SQTS] Migrations complete');

  // Clean up any orphaned rows from unreliable sql.js CASCADE
  console.log('[SQTS] Running integrity check...');
  cleanOrphanedRows(db);

  return db;
}

// Case conversion utilities
export function toCamelCase<T>(obj: any): T {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase) as T;
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      acc[camelKey] = toCamelCase(obj[key]);
      return acc;
    }, {} as any) as T;
  }
  return obj;
}

export function toSnakeCase<T>(obj: any): T {
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase) as T;
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      acc[snakeKey] = toSnakeCase(obj[key]);
      return acc;
    }, {} as any) as T;
  }
  return obj;
}

// Query helpers
export function query<T>(sql: string, params: any[] = []): T[] {
  if (!db) throw new Error('Database not initialized');
  const results: T[] = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(toCamelCase<T>(row));
  }
  stmt.free();
  return results;
}

export function queryOne<T>(sql: string, params: any[] = []): T | null {
  const results = query<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

export function run(sql: string, params: any[] = []): void {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  scheduleSave();
}

// Transaction support
let transactionDepth = 0;

export function beginTransaction(): void {
  if (!db) throw new Error('Database not initialized');
  if (transactionDepth === 0) {
    try {
      db.run('BEGIN TRANSACTION');
    } catch (error) {
      transactionDepth = 0;
      throw error;
    }
  }
  transactionDepth++;
}

export function commitTransaction(): void {
  if (!db) throw new Error('Database not initialized');
  if (transactionDepth <= 0) {
    transactionDepth = 0;
    throw new Error('No active transaction to commit');
  }
  transactionDepth--;
  if (transactionDepth === 0) {
    try {
      db.run('COMMIT');
      db.run('PRAGMA foreign_keys = ON');
      saveDatabaseImmediately();
    } catch (error) {
      transactionDepth = 0;
      throw error;
    }
  }
}

export function rollbackTransaction(): void {
  if (!db) throw new Error('Database not initialized');
  if (transactionDepth <= 0) {
    transactionDepth = 0;
    return; // Nothing to rollback
  }
  transactionDepth--;
  if (transactionDepth === 0) {
    try {
      db.run('ROLLBACK');
      db.run('PRAGMA foreign_keys = ON');
    } catch (error) {
      transactionDepth = 0;
      throw error;
    }
  }
}

export async function withTransaction<T>(fn: () => Promise<T> | T): Promise<T> {
  beginTransaction();
  try {
    const result = await fn();
    commitTransaction();
    return result;
  } catch (error) {
    rollbackTransaction();
    throw error;
  }
}

// Debounced save (100ms)
function scheduleSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveDatabase();
  }, 100);
}

export function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmpPath = dbPath + '.tmp';
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, dbPath);
}

export async function saveDatabaseImmediately(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  saveDatabase();
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}

// Auto backup
export function autoBackup(): void {
  if (!fs.existsSync(dbPath)) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(path.dirname(dbPath), `supplier-tracking-backup-${timestamp}.db`);
  fs.copyFileSync(dbPath, backupPath);
}

// Inline migrations — Vite bundles everything into a single JS file,
// so .sql files on disk are not available at runtime. Migrations are
// embedded as string constants here.
const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '001_initial_schema',
    sql: `
-- Suppliers
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  notes TEXT,
  nmr_rank TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_suppliers_nmr_rank ON suppliers(nmr_rank);

-- Activity Templates
CREATE TABLE activity_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activity_templates_category ON activity_templates(category);

-- Activity Template Schedule Items
CREATE TABLE activity_template_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_template_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('MILESTONE', 'TASK')),
  name TEXT NOT NULL,
  anchor_type TEXT NOT NULL CHECK(anchor_type IN ('FIXED_DATE', 'SCHEDULE_ITEM', 'COMPLETION', 'PROJECT_MILESTONE')),
  anchor_ref_id INTEGER,
  offset_days INTEGER,
  fixed_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (anchor_ref_id) REFERENCES activity_template_schedule_items(id) ON DELETE SET NULL
);
CREATE INDEX idx_template_schedule_items_template ON activity_template_schedule_items(activity_template_id);
CREATE INDEX idx_template_schedule_items_anchor ON activity_template_schedule_items(anchor_ref_id);

-- Activity Template Applicability Rules
CREATE TABLE activity_template_applicability_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_template_id INTEGER NOT NULL,
  operator TEXT NOT NULL CHECK(operator IN ('ALL', 'ANY')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE
);
CREATE INDEX idx_applicability_rules_template ON activity_template_applicability_rules(activity_template_id);

-- Activity Template Applicability Clauses
CREATE TABLE activity_template_applicability_clauses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('SUPPLIER_NMR', 'PART_PA')),
  comparator TEXT NOT NULL CHECK(comparator IN ('IN', 'NOT_IN', 'EQ', 'NEQ', 'GTE', 'LTE')),
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (rule_id) REFERENCES activity_template_applicability_rules(id) ON DELETE CASCADE
);
CREATE INDEX idx_applicability_clauses_rule ON activity_template_applicability_clauses(rule_id);

-- Projects
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL DEFAULT 'v1.0',
  default_anchor_rule TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- Project Milestones
CREATE TABLE project_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX idx_project_milestones_project ON project_milestones(project_id);

-- Project Activities
CREATE TABLE project_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  activity_template_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  template_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE
);
CREATE INDEX idx_project_activities_project ON project_activities(project_id);
CREATE INDEX idx_project_activities_template ON project_activities(activity_template_id);

-- Project Schedule Items
CREATE TABLE project_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_activity_id INTEGER NOT NULL,
  template_item_id INTEGER,
  kind TEXT NOT NULL CHECK(kind IN ('MILESTONE', 'TASK')),
  name TEXT NOT NULL,
  anchor_type TEXT NOT NULL CHECK(anchor_type IN ('FIXED_DATE', 'SCHEDULE_ITEM', 'COMPLETION', 'PROJECT_MILESTONE')),
  anchor_ref_id INTEGER,
  offset_days INTEGER,
  fixed_date TEXT,
  override_date TEXT,
  override_enabled INTEGER NOT NULL DEFAULT 0,
  project_milestone_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_activity_id) REFERENCES project_activities(id) ON DELETE CASCADE,
  FOREIGN KEY (template_item_id) REFERENCES activity_template_schedule_items(id) ON DELETE SET NULL,
  FOREIGN KEY (anchor_ref_id) REFERENCES project_schedule_items(id) ON DELETE SET NULL,
  FOREIGN KEY (project_milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL
);
CREATE INDEX idx_project_schedule_items_activity ON project_schedule_items(project_activity_id);
CREATE INDEX idx_project_schedule_items_anchor ON project_schedule_items(anchor_ref_id);
CREATE INDEX idx_project_schedule_items_milestone ON project_schedule_items(project_milestone_id);

-- Supplier Projects
CREATE TABLE supplier_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  project_version TEXT NOT NULL,
  supplier_project_nmr_rank TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(supplier_id, project_id)
);
CREATE INDEX idx_supplier_projects_supplier ON supplier_projects(supplier_id);
CREATE INDEX idx_supplier_projects_project ON supplier_projects(project_id);

-- Supplier Activity Instances
CREATE TABLE supplier_activity_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_project_id INTEGER NOT NULL,
  project_activity_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete', 'Not Required')),
  scope_override TEXT CHECK(scope_override IN ('REQUIRED', 'NOT_REQUIRED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_project_id) REFERENCES supplier_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (project_activity_id) REFERENCES project_activities(id) ON DELETE CASCADE
);
CREATE INDEX idx_supplier_activity_instances_supplier_project ON supplier_activity_instances(supplier_project_id);
CREATE INDEX idx_supplier_activity_instances_project_activity ON supplier_activity_instances(project_activity_id);

-- Supplier Schedule Item Instances
CREATE TABLE supplier_schedule_item_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_activity_instance_id INTEGER NOT NULL,
  project_schedule_item_id INTEGER NOT NULL,
  planned_date TEXT,
  actual_date TEXT,
  status TEXT NOT NULL DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete', 'Not Required')),
  planned_date_override INTEGER NOT NULL DEFAULT 0,
  scope_override TEXT CHECK(scope_override IN ('REQUIRED', 'NOT_REQUIRED')),
  locked INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_activity_instance_id) REFERENCES supplier_activity_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (project_schedule_item_id) REFERENCES project_schedule_items(id) ON DELETE CASCADE
);
CREATE INDEX idx_supplier_schedule_item_instances_activity ON supplier_schedule_item_instances(supplier_activity_instance_id);
CREATE INDEX idx_supplier_schedule_item_instances_project_item ON supplier_schedule_item_instances(project_schedule_item_id);
CREATE INDEX idx_supplier_schedule_item_instances_status ON supplier_schedule_item_instances(status);
CREATE INDEX idx_supplier_schedule_item_instances_planned_date ON supplier_schedule_item_instances(planned_date);

-- Supplier Activity Attachments
CREATE TABLE supplier_activity_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_activity_instance_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_activity_instance_id) REFERENCES supplier_activity_instances(id) ON DELETE CASCADE
);
CREATE INDEX idx_supplier_activity_attachments_instance ON supplier_activity_attachments(supplier_activity_instance_id);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('nmr_ranks', '["A1","A2","B1","B2","C1"]'),
  ('pa_ranks', '["Critical","High","Medium","Low"]'),
  ('propagation_skip_complete', 'true'),
  ('propagation_skip_locked', 'true'),
  ('propagation_skip_overridden', 'true'),
  ('date_format', 'yyyy-MM-dd'),
  ('use_business_days', 'false'),
  ('auto_propagate_template_changes', 'false'),
  ('auto_propagate_to_suppliers', 'false');

-- Audit Events
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  user_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_events_created ON audit_events(created_at);
`,
  },
  {
    name: '002_template_versions',
    sql: `
CREATE TABLE template_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_template_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version_number INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE
);
CREATE INDEX idx_template_versions_template ON template_versions(activity_template_id);
`,
  },
  {
    name: '003_parts_location_codes',
    sql: `-- Supplier Location Codes
CREATE TABLE supplier_location_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  supplier_number TEXT NOT NULL,
  location_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  UNIQUE(supplier_id, location_code)
);
CREATE INDEX idx_supplier_location_codes_supplier ON supplier_location_codes(supplier_id);

-- Parts
CREATE TABLE parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_project_id INTEGER NOT NULL,
  location_code_id INTEGER,
  part_number TEXT NOT NULL,
  description TEXT,
  pa_rank TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_project_id) REFERENCES supplier_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (location_code_id) REFERENCES supplier_location_codes(id) ON DELETE SET NULL
);
CREATE INDEX idx_parts_supplier_project ON parts(supplier_project_id);
CREATE INDEX idx_parts_location_code ON parts(location_code_id);
CREATE INDEX idx_parts_pa_rank ON parts(pa_rank);
`,
  },
  {
    name: '004_milestone_presets',
    sql: `CREATE TABLE milestone_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  milestones TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`,
  },
  {
    name: '005_project_templates',
    sql: `ALTER TABLE project_milestones ADD COLUMN category TEXT;

CREATE TABLE project_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE project_template_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_template_id INTEGER NOT NULL,
  category TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (project_template_id) REFERENCES project_templates(id) ON DELETE CASCADE
);
CREATE INDEX idx_ptm_template ON project_template_milestones(project_template_id);

CREATE TABLE project_template_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_template_id INTEGER NOT NULL,
  activity_template_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (project_template_id) REFERENCES project_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE
);
CREATE INDEX idx_pta_template ON project_template_activities(project_template_id);
CREATE INDEX idx_pta_activity ON project_template_activities(activity_template_id);

DROP TABLE IF EXISTS milestone_presets;

INSERT OR IGNORE INTO settings (key, value) VALUES ('milestone_categories', '["PA","NMR","Build Event"]');`,
  },
  {
    name: '006_supplier_milestone_dates',
    sql: `CREATE TABLE supplier_milestone_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_project_id INTEGER NOT NULL,
  project_milestone_id INTEGER NOT NULL,
  date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_project_id) REFERENCES supplier_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (project_milestone_id) REFERENCES project_milestones(id) ON DELETE CASCADE,
  UNIQUE(supplier_project_id, project_milestone_id)
);
CREATE INDEX idx_smd_supplier_project ON supplier_milestone_dates(supplier_project_id);
CREATE INDEX idx_smd_milestone ON supplier_milestone_dates(project_milestone_id);`,
  },
  {
    name: '007_anchor_milestone_name',
    sql: `ALTER TABLE activity_template_schedule_items ADD COLUMN anchor_milestone_name TEXT;`,
  },
];

// Integrity check: clean up orphaned rows left by unreliable sql.js CASCADE
function cleanOrphanedRows(database: SqlJsDatabase): void {
  // Orphaned supplier_schedule_item_instances (project_schedule_item deleted)
  const orphanedByPSI = database.exec(
    `SELECT COUNT(*) as c FROM supplier_schedule_item_instances
     WHERE project_schedule_item_id NOT IN (SELECT id FROM project_schedule_items)`
  );
  const countPSI = orphanedByPSI[0]?.values[0]?.[0] as number || 0;
  if (countPSI > 0) {
    console.log(`[SQTS] Cleaning ${countPSI} orphaned supplier_schedule_item_instances (missing project_schedule_item)`);
    database.run(
      `DELETE FROM supplier_schedule_item_instances
       WHERE project_schedule_item_id NOT IN (SELECT id FROM project_schedule_items)`
    );
  }

  // Orphaned supplier_schedule_item_instances (supplier_activity_instance deleted)
  const orphanedBySAI = database.exec(
    `SELECT COUNT(*) as c FROM supplier_schedule_item_instances
     WHERE supplier_activity_instance_id NOT IN (SELECT id FROM supplier_activity_instances)`
  );
  const countSAI = orphanedBySAI[0]?.values[0]?.[0] as number || 0;
  if (countSAI > 0) {
    console.log(`[SQTS] Cleaning ${countSAI} orphaned supplier_schedule_item_instances (missing supplier_activity_instance)`);
    database.run(
      `DELETE FROM supplier_schedule_item_instances
       WHERE supplier_activity_instance_id NOT IN (SELECT id FROM supplier_activity_instances)`
    );
  }

  // Orphaned supplier_activity_instances (supplier_project deleted)
  const orphanedSAI = database.exec(
    `SELECT COUNT(*) as c FROM supplier_activity_instances
     WHERE supplier_project_id NOT IN (SELECT id FROM supplier_projects)`
  );
  const countSP = orphanedSAI[0]?.values[0]?.[0] as number || 0;
  if (countSP > 0) {
    console.log(`[SQTS] Cleaning ${countSP} orphaned supplier_activity_instances (missing supplier_project)`);
    database.run(
      `DELETE FROM supplier_activity_instances
       WHERE supplier_project_id NOT IN (SELECT id FROM supplier_projects)`
    );
  }

  // Orphaned supplier_activity_instances (project_activity deleted)
  const orphanedSAIPA = database.exec(
    `SELECT COUNT(*) as c FROM supplier_activity_instances
     WHERE project_activity_id NOT IN (SELECT id FROM project_activities)`
  );
  const countPA = orphanedSAIPA[0]?.values[0]?.[0] as number || 0;
  if (countPA > 0) {
    console.log(`[SQTS] Cleaning ${countPA} orphaned supplier_activity_instances (missing project_activity)`);
    database.run(
      `DELETE FROM supplier_activity_instances
       WHERE project_activity_id NOT IN (SELECT id FROM project_activities)`
    );
  }

  // Orphaned supplier_milestone_dates
  const orphanedSMD1 = database.exec(
    `SELECT COUNT(*) as c FROM supplier_milestone_dates
     WHERE supplier_project_id NOT IN (SELECT id FROM supplier_projects)`
  );
  const countSMD1 = orphanedSMD1[0]?.values[0]?.[0] as number || 0;
  if (countSMD1 > 0) {
    console.log(`[SQTS] Cleaning ${countSMD1} orphaned supplier_milestone_dates (missing supplier_project)`);
    database.run(
      `DELETE FROM supplier_milestone_dates
       WHERE supplier_project_id NOT IN (SELECT id FROM supplier_projects)`
    );
  }

  const orphanedSMD2 = database.exec(
    `SELECT COUNT(*) as c FROM supplier_milestone_dates
     WHERE project_milestone_id NOT IN (SELECT id FROM project_milestones)`
  );
  const countSMD2 = orphanedSMD2[0]?.values[0]?.[0] as number || 0;
  if (countSMD2 > 0) {
    console.log(`[SQTS] Cleaning ${countSMD2} orphaned supplier_milestone_dates (missing project_milestone)`);
    database.run(
      `DELETE FROM supplier_milestone_dates
       WHERE project_milestone_id NOT IN (SELECT id FROM project_milestones)`
    );
  }

  const totalCleaned = countPSI + countSAI + countSP + countPA + countSMD1 + countSMD2;
  if (totalCleaned > 0) {
    console.log(`[SQTS] Integrity check: cleaned ${totalCleaned} total orphaned rows`);
  } else {
    console.log('[SQTS] Integrity check: no orphaned rows found');
  }

  // Repair: supplier_projects missing supplier_activity_instances for project_activities
  // (e.g., activity was added to project after supplier was applied)
  const missingActivityInstances = database.exec(
    `SELECT sp.id as supplier_project_id, pa.id as project_activity_id
     FROM supplier_projects sp
     JOIN project_activities pa ON pa.project_id = sp.project_id
     WHERE NOT EXISTS (
       SELECT 1 FROM supplier_activity_instances sai
       WHERE sai.supplier_project_id = sp.id AND sai.project_activity_id = pa.id
     )`
  );

  if (missingActivityInstances.length > 0 && missingActivityInstances[0].values.length > 0) {
    const missingRows = missingActivityInstances[0].values;
    console.log(`[SQTS] Repair: ${missingRows.length} missing supplier_activity_instances`);

    for (const mRow of missingRows) {
      const supplierProjectId = mRow[0] as number;
      const projectActivityId = mRow[1] as number;

      database.run(
        `INSERT INTO supplier_activity_instances (supplier_project_id, project_activity_id, status, scope_override)
         VALUES (?, ?, 'Not Started', NULL)`,
        [supplierProjectId, projectActivityId]
      );

      // Get the new activity instance ID
      const newIdResult = database.exec('SELECT last_insert_rowid() as id');
      const newActivityInstanceId = newIdResult[0]?.values[0]?.[0] as number;

      // Create schedule item instances for this activity
      const schedItems = database.exec(
        `SELECT id FROM project_schedule_items WHERE project_activity_id = ? ORDER BY sort_order`,
        [projectActivityId]
      );

      if (schedItems.length > 0) {
        for (const siRow of schedItems[0].values) {
          const projectScheduleItemId = siRow[0] as number;
          database.run(
            `INSERT OR IGNORE INTO supplier_schedule_item_instances
             (supplier_activity_instance_id, project_schedule_item_id, planned_date, actual_date, status, planned_date_override, scope_override, locked, notes)
             VALUES (?, ?, NULL, NULL, 'Not Started', 0, NULL, 0, NULL)`,
            [newActivityInstanceId, projectScheduleItemId]
          );
        }
      }

      console.log(`[SQTS] Repair: created activity_instance for supplier_project ${supplierProjectId}, project_activity ${projectActivityId}`);
    }
  }

  // Repair: project_schedule_items with PROJECT_MILESTONE anchor but null project_milestone_id
  // Attempt to resolve using the template item's anchor_milestone_name, falling back to item's own name
  const unlinkedMilestoneItems = database.exec(
    `SELECT psi.id, psi.project_activity_id, psi.template_item_id,
            atsi.anchor_milestone_name, pa.project_id, psi.name
     FROM project_schedule_items psi
     JOIN project_activities pa ON psi.project_activity_id = pa.id
     LEFT JOIN activity_template_schedule_items atsi ON psi.template_item_id = atsi.id
     WHERE psi.anchor_type = 'PROJECT_MILESTONE'
       AND psi.project_milestone_id IS NULL`
  );

  if (unlinkedMilestoneItems.length > 0 && unlinkedMilestoneItems[0].values.length > 0) {
    const rows = unlinkedMilestoneItems[0].values;
    let repaired = 0;
    for (const row of rows) {
      const psiId = row[0] as number;
      const projectId = row[4] as number;
      // Use anchor_milestone_name if available, otherwise fall back to item's own name
      const milestoneName = (row[3] as string | null) || (row[5] as string);

      if (!milestoneName) continue;

      // Try matching by name, then category, then category-prefix
      // e.g., item "PA 2" matches milestone with name "PA 2", or category "PA 2", or category "PA" (prefix)
      let milestone = database.exec(
        `SELECT id FROM project_milestones
         WHERE project_id = ? AND (name = ? OR category = ?)
         ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, sort_order
         LIMIT 1`,
        [projectId, milestoneName, milestoneName, milestoneName]
      );

      // Category-prefix fallback: "PA 2" starts with category "PA"
      if (!(milestone.length > 0 && milestone[0].values.length > 0)) {
        milestone = database.exec(
          `SELECT id FROM project_milestones
           WHERE project_id = ? AND category IS NOT NULL AND ? LIKE (category || ' %')
           ORDER BY sort_order
           LIMIT 1`,
          [projectId, milestoneName]
        );
      }

      if (milestone.length > 0 && milestone[0].values.length > 0) {
        const milestoneId = milestone[0].values[0][0] as number;
        database.run(
          'UPDATE project_schedule_items SET project_milestone_id = ? WHERE id = ?',
          [milestoneId, psiId]
        );
        repaired++;
      }
    }
    if (repaired > 0) {
      console.log(`[SQTS] Repair: linked ${repaired} PROJECT_MILESTONE schedule items to their milestones`);
    }
  }

  // Repair: supplier_activity_instances that have 0 supplier_schedule_item_instances
  // but their project_activity has project_schedule_items (i.e., instances were never created)
  const emptyActivityInstances = database.exec(
    `SELECT sai.id, sai.project_activity_id
     FROM supplier_activity_instances sai
     WHERE NOT EXISTS (
       SELECT 1 FROM supplier_schedule_item_instances ssii
       WHERE ssii.supplier_activity_instance_id = sai.id
     )
     AND EXISTS (
       SELECT 1 FROM project_schedule_items psi
       WHERE psi.project_activity_id = sai.project_activity_id
     )`
  );

  if (emptyActivityInstances.length > 0 && emptyActivityInstances[0].values.length > 0) {
    const rows = emptyActivityInstances[0].values;
    console.log(`[SQTS] Repair: ${rows.length} supplier_activity_instances missing schedule item instances`);

    for (const row of rows) {
      const activityInstanceId = row[0] as number;
      const projectActivityId = row[1] as number;

      // Get the project_schedule_items for this activity
      const itemsResult = database.exec(
        `SELECT id FROM project_schedule_items WHERE project_activity_id = ? ORDER BY sort_order`,
        [projectActivityId]
      );

      if (itemsResult.length > 0) {
        for (const itemRow of itemsResult[0].values) {
          const projectScheduleItemId = itemRow[0] as number;
          database.run(
            `INSERT OR IGNORE INTO supplier_schedule_item_instances
             (supplier_activity_instance_id, project_schedule_item_id, planned_date, actual_date, status, planned_date_override, scope_override, locked, notes)
             VALUES (?, ?, NULL, NULL, 'Not Started', 0, NULL, 0, NULL)`,
            [activityInstanceId, projectScheduleItemId]
          );
        }
        console.log(`[SQTS] Repair: created ${itemsResult[0].values.length} instances for activity_instance ${activityInstanceId}`);
      }
    }
  }
}

// Migration runner
async function runMigrations(database: SqlJsDatabase): Promise<void> {
  // Create migrations table if not exists
  database.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of MIGRATIONS) {
    const stmt = database.prepare('SELECT 1 FROM migrations WHERE name = ?');
    stmt.bind([migration.name]);
    const exists = stmt.step();
    stmt.free();

    if (!exists) {
      console.log(`[SQTS] Running migration: ${migration.name}`);
      database.exec(migration.sql);
      database.run('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [
        migration.name,
        new Date().toISOString(),
      ]);
      console.log(`[SQTS] Migration ${migration.name} applied successfully`);
    } else {
      console.log(`[SQTS] Migration ${migration.name} already applied`);
    }
  }

  saveDatabase();
}
