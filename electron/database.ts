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
    db.run('BEGIN TRANSACTION');
  }
  transactionDepth++;
}

export function commitTransaction(): void {
  if (!db) throw new Error('Database not initialized');
  transactionDepth--;
  if (transactionDepth === 0) {
    db.run('COMMIT');
    saveDatabaseImmediately();
  }
}

export function rollbackTransaction(): void {
  if (!db) throw new Error('Database not initialized');
  transactionDepth--;
  if (transactionDepth === 0) {
    db.run('ROLLBACK');
    // Do NOT save after rollback - in-memory state is already correct
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
];

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
