import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

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
    if (fs.existsSync(wasmPath)) {
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
  await runMigrations(db);

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

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
    return;
  }

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const name = file.replace('.sql', '');
    const stmt = database.prepare('SELECT 1 FROM migrations WHERE name = ?');
    stmt.bind([name]);
    const exists = stmt.step();
    stmt.free();

    if (!exists) {
      console.log(`Running migration: ${name}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      database.exec(sql);
      database.run('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [
        name,
        new Date().toISOString(),
      ]);
    }
  }

  saveDatabase();
}
