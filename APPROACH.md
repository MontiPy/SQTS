# How to Build SQTS from Scratch

A comprehensive guide to building the Supplier Quality Tracking System (SQTS) -- an Electron desktop application for tracking supplier progress against projects and activities. This document describes the architecture, patterns, database design, and business logic needed to rebuild the application, along with recommended improvements over the current implementation.

**Audience:** A developer familiar with TypeScript, React, and Electron who wants to build this system from first principles.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture](#3-architecture)
4. [Directory Structure](#4-directory-structure)
5. [Shared Type System](#5-shared-type-system)
6. [Database Design](#6-database-design)
7. [Electron Main Process](#7-electron-main-process)
8. [Business Logic Engines](#8-business-logic-engines)
9. [React Frontend](#9-react-frontend)
10. [Development Phases](#10-development-phases)
11. [Key Patterns & Conventions](#11-key-patterns--conventions)
12. [Common Pitfalls](#12-common-pitfalls)
13. [Testing & Verification](#13-testing--verification)
14. [Recommended Improvements](#14-recommended-improvements)

---

## 1. Project Overview

### What It Does

SQTS is a desktop tool for quality engineers who manage supplier readiness across automotive or manufacturing projects. The core workflow:

1. **Define activity templates** -- reusable checklists of milestones and tasks (e.g., "PPAP Submission", "Tool Readiness")
2. **Create projects** with milestones (e.g., PA2, PA3, SOP) and add activities from the template library
3. **Apply projects to suppliers** -- each supplier gets their own instance of the project with independent schedule tracking
4. **Track progress** -- mark milestones/tasks as complete, override dates, lock items, manage exceptions
5. **Propagate changes** -- when project dates change, push updates to all supplier instances (respecting locks and overrides)

### Who It's For

Single-user, offline-first. Designed for a quality engineer or program manager working from their laptop, not a team collaboration tool. No server, no accounts, no network dependency.

### Key Capabilities

- **Activity Template Library** with schedule items, applicability rules, and version tracking
- **Project management** with milestones, activities, and date anchoring (items derive dates from other items or milestones)
- **Supplier project instances** with per-supplier overrides, locks, and scope control
- **Schedule computation engine** -- wave-based topological sort that resolves date dependencies
- **Propagation engine** -- pushes project changes to supplier instances with configurable skip policies
- **Applicability rules** -- conditionally include/exclude activities based on supplier NMR rank or part PA rank
- **Import/Export** -- JSON-based data exchange with match/merge analysis
- **Dashboard** -- overdue items, due-soon items, filters by supplier/project/status
- **Reports** -- supplier progress, project progress, overdue/due-soon lists with CSV export
- **Settings** -- configurable ranks, propagation policies, date formats, business days

---

## 2. Technology Stack

### Current Dependencies (with rationale)

| Dependency | Version | Why |
|---|---|---|
| **Electron** | ^33.2.1 | Desktop app shell with native file dialogs, system tray, auto-update support |
| **React** | ^18.3.1 | Component-based UI with good TypeScript support |
| **React DOM** | ^18.3.1 | React renderer for web (Electron's Chromium) |
| **React Router DOM** | ^7.1.1 | Client-side routing (SPA navigation within Electron) |
| **sql.js** | ^1.13.0 | SQLite compiled to WASM -- no native binaries, no rebuild headaches, works everywhere |
| **date-fns** | ^4.1.0 | Modular date arithmetic (add days, format, parse) -- tree-shakeable unlike moment.js |
| **TypeScript** | ^5.7.2 | Type safety across main/renderer/shared boundary |
| **Vite** | ^6.0.5 | Fast dev server with HMR, clean build output, Electron plugin ecosystem |
| **vite-plugin-electron** | ^0.28.7 | Compiles main process + preload alongside renderer |
| **Tailwind CSS** | ^3.4.17 | Utility-first CSS -- fast iteration, consistent spacing/colors |
| **Radix UI** | Various | Accessible, unstyled primitives (Dialog, Select, Tabs, Toast, etc.) |
| **class-variance-authority** | ^0.7.1 | Typed component variants (button sizes, colors) |
| **clsx + tailwind-merge** | ^2.1.1 / ^2.5.5 | Smart class merging (avoids `bg-red bg-blue` conflicts) |
| **lucide-react** | ^0.469.0 | Clean SVG icon library |
| **electron-builder** | ^25.1.8 | Packages app into .exe (NSIS), .dmg, .AppImage |

### Recommended Additions

| Addition | Why |
|---|---|
| **Vitest** | Unit testing for scheduler, applicability, and propagation engines. Same Vite config, fast, TypeScript-native. |
| **TanStack Query (React Query)** | Eliminates manual `useState`/`useEffect` data fetching. Provides caching, stale-while-revalidate, and automatic refetch on window focus. Currently every page re-fetches on mount. |
| **Zod** | Runtime validation at the IPC boundary. Currently handlers trust renderer input without validation. Zod schemas can be shared between preload type definitions and handler validation. |

---

## 3. Architecture

### Process Separation

Electron apps have three execution contexts with strict boundaries:

```
+-----------------------------------------------------------------------+
|                      Electron Main Process                             |
|  electron/main.ts        - App lifecycle, window creation              |
|  electron/database.ts    - sql.js WASM database (in-memory + file)     |
|  electron/handlers.ts    - IPC handlers (~68 channels)                 |
|  electron/scheduler.ts   - Date computation engine                     |
|  electron/engine/        - Propagation, applicability engines          |
|  electron/import/        - Import parser, analyzer, executor           |
|  electron/export/        - Export data assembler                       |
+-----------------------------+-----------------------------------------+
                              | IPC via contextBridge
+-----------------------------+-----------------------------------------+
|  electron/preload.ts  - Exposes window.sqts API                        |
|                         107 methods across 19 namespaces               |
|                         Every method returns Promise<APIResponse<T>>   |
+-----------------------------+-----------------------------------------+
                              |
+-----------------------------+-----------------------------------------+
|                      React Renderer Process                            |
|  src/App.tsx           - Routes (15 paths)                             |
|  src/pages/            - Feature pages (Dashboard, Suppliers, etc.)    |
|  src/components/       - Reusable UI (Radix + Tailwind)                |
|  shared/types.ts       - Shared TypeScript interfaces                  |
+-----------------------------------------------------------------------+
```

### Data Flow

```
User clicks "Save" in UI
  -> React component calls window.sqts.projects.update(params)
  -> preload.ts invokes ipcRenderer.invoke('projects:update', params)
  -> main process handler receives via ipcMain.handle('projects:update', ...)
  -> handler validates, runs SQL, calls saveDatabase()
  -> returns APIResponse<Project> { success: true, data: {...} }
  -> React component receives response, updates local state
  -> UI re-renders with new data
```

### IPC Contract

Every IPC call follows the same pattern:

```typescript
// Preload exposes typed method
window.sqts.projects.update(params: UpdateProjectParams): Promise<APIResponse<Project>>

// Handler returns standardized envelope
interface APIResponse<T = any> {
  success: boolean;
  data?: T;       // Present on success
  error?: string; // Present on failure
}
```

The renderer never has direct access to Node.js APIs, the database, or the filesystem. All communication goes through the preload bridge.

---

## 4. Directory Structure

The recommended structure improves on the current implementation by splitting the monolithic `handlers.ts` into domain modules:

```
supplier-tracking/
├── electron/                          # Main process code
│   ├── main.ts                        # App lifecycle, window creation
│   ├── database.ts                    # sql.js init, query/run helpers, migrations
│   ├── preload.ts                     # contextBridge API surface (CJS output)
│   ├── scheduler.ts                   # Date computation engine
│   │
│   ├── handlers/                      # [IMPROVED] Split by domain
│   │   ├── index.ts                   # registerHandlers() - imports all domain modules
│   │   ├── suppliers.ts               # Supplier CRUD + location codes
│   │   ├── projects.ts                # Project CRUD + milestones + propagation
│   │   ├── activities.ts              # Activity templates + schedule items + applicability
│   │   ├── supplier-instances.ts      # Supplier projects + activity/schedule instances
│   │   ├── import-export.ts           # Import/export + database backup
│   │   ├── settings.ts               # Settings + dashboard + reports
│   │   └── shared.ts                  # createSuccessResponse, createErrorResponse, audit helpers
│   │
│   ├── engine/
│   │   ├── propagation.ts            # Project -> supplier instance change propagation
│   │   ├── applicability.ts          # [IMPROVED] Extract from handlers.ts
│   │   └── template-sync.ts          # [IMPROVED] Extract from handlers.ts
│   │
│   ├── import/
│   │   ├── parser.ts                 # Parse JSON import file
│   │   ├── analyzer.ts               # Match/diff analysis
│   │   └── executor.ts               # Apply import changes
│   │
│   ├── export/
│   │   └── assembler.ts              # Build export JSON
│   │
│   └── migrations/                    # Numbered SQL files (001-015+)
│       ├── 001_initial_schema.sql
│       ├── 002_add_project_anchor_date.sql
│       └── ...
│
├── shared/                            # Shared between main and renderer
│   ├── types/                         # [IMPROVED] Split into domain files
│   │   ├── index.ts                   # Re-exports everything
│   │   ├── core.ts                    # Supplier, Project, ActivityTemplate
│   │   ├── schedule.ts               # ScheduleItem, AnchorType, ScheduleItemKind
│   │   ├── instances.ts              # SupplierProject, SupplierActivityInstance, etc.
│   │   ├── applicability.ts          # Rules, clauses, operators, comparators
│   │   ├── import-export.ts          # Exported* types, ImportAnalysis, MatchResult
│   │   ├── dashboard.ts              # DashboardData, ActionableItem, filters
│   │   ├── reports.ts                # Progress types, ReportScheduleItem
│   │   ├── settings.ts               # AppSettings, Setting
│   │   └── api.ts                    # APIResponse, param types
│   └── channels.ts                    # [IMPROVED] IPC channel name constants
│
├── src/                               # React renderer
│   ├── App.tsx                        # Route definitions
│   ├── main.tsx                       # React entry point + BrowserRouter
│   ├── index.css                      # Global styles + CSS variables
│   │
│   ├── components/
│   │   ├── Layout.tsx                 # Two-column layout wrapper
│   │   ├── Sidebar.tsx                # Navigation sidebar
│   │   │
│   │   ├── ui/                        # shadcn/ui primitives
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── radio-group.tsx
│   │   │   ├── breadcrumb.tsx
│   │   │   ├── status-badge.tsx
│   │   │   ├── toast.tsx
│   │   │   └── toaster.tsx
│   │   │
│   │   ├── suppliers/                 # Supplier-specific dialogs
│   │   ├── projects/                  # Project-specific dialogs
│   │   ├── activities/                # Activity template dialogs
│   │   └── activity-templates/        # Template editing components
│   │
│   ├── hooks/
│   │   └── use-toast.ts               # Toast notification hook
│   │
│   ├── lib/
│   │   ├── utils.ts                   # cn() class merge utility
│   │   └── format.ts                  # [IMPROVED] Single formatDate implementation
│   │
│   ├── types/
│   │   └── global.d.ts               # Window.sqts type declaration
│   │
│   └── pages/
│       ├── Dashboard.tsx
│       ├── Suppliers/
│       │   ├── SuppliersList.tsx
│       │   └── SupplierDetail.tsx
│       ├── Projects/
│       │   ├── ProjectsList.tsx
│       │   ├── ProjectDetail.tsx
│       │   ├── ProjectConfigureDates.tsx
│       │   ├── AddActivityDialog.tsx
│       │   ├── ScheduleItemDialog.tsx
│       │   ├── EditProjectScheduleItemDialog.tsx
│       │   └── PropagationPreviewModal.tsx
│       ├── SupplierProjects/
│       │   └── SupplierProjectDetail.tsx
│       ├── ActivityLibrary/
│       │   ├── ActivityLibraryPage.tsx
│       │   ├── ActivityTemplatesList.tsx
│       │   └── ActivityTemplateDetail.tsx
│       ├── Parts/
│       │   └── PartsList.tsx
│       ├── ProjectTemplates/
│       │   ├── ProjectTemplatesPage.tsx
│       │   ├── CreateTemplateDialog.tsx
│       │   ├── EditTemplateDialog.tsx
│       │   ├── ApplyTemplateDialog.tsx
│       │   └── TemplateDetailDialog.tsx
│       ├── ImportExport/
│       │   ├── ImportExportPage.tsx
│       │   ├── ExportTab.tsx
│       │   ├── ImportTab.tsx
│       │   ├── ReviewChanges.tsx
│       │   └── EditIncomingModal.tsx
│       ├── Settings/
│       │   └── SettingsPage.tsx
│       ├── Reports/
│       │   └── ReportsPage.tsx
│       └── Help/
│           └── HelpPage.tsx
│
├── package.json
├── vite.config.ts
├── tsconfig.json                      # React/renderer (ES2020, strict, noEmit)
├── tsconfig.electron.json             # Main process (ES2022, outDir: dist-electron)
├── tsconfig.node.json                 # Build tools (vite.config.ts only)
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
└── electron-builder.json
```

---

## 5. Shared Type System

### Design Principle

Types flow in dependency layers. Lower layers know nothing about higher layers:

```
Layer 1: Core entities         (Supplier, Project, ActivityTemplate)
Layer 2: Structure             (ProjectActivity, ProjectScheduleItem, ProjectMilestone)
Layer 3: Instances             (SupplierProject, SupplierActivityInstance, SupplierScheduleItemInstance)
Layer 4: Computed/Composed     (ProjectDetail, SupplierProjectDetail, ScheduleItemWithDates)
Layer 5: API contracts         (CreateParams, UpdateParams, APIResponse)
Layer 6: Feature-specific      (Dashboard, Reports, ImportExport, Settings)
```

### Key Types

**Core Entities:**

```typescript
interface Supplier {
  id: number;
  name: string;
  notes: string | null;
  nmrRank: string | null;        // Supplier-level NMR rank (primary — applicability defaults to this)
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;             // YYYY-MM-DD
}

interface Project {
  id: number;
  name: string;
  version: string;               // e.g., "v1.0"
  defaultAnchorRule: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface ActivityTemplate {
  id: number;
  name: string;
  description: string | null;
  category: string | null;       // e.g., "Quality", "Tooling"
  version: number;               // Replaces separate activity_template_versions table
  updatedAt: string | null;
  createdAt: string;
}
```

**Schedule Item Types (central to the whole system):**

```typescript
type ScheduleItemKind = 'MILESTONE' | 'TASK';

type AnchorType =
  | 'FIXED_DATE'            // Hard-coded date
  | 'SCHEDULE_ITEM'         // Offset from another item's planned date
  | 'COMPLETION'            // Offset from another item's actual date
  | 'PROJECT_MILESTONE';    // Offset from a project milestone date

interface ProjectScheduleItem {
  id: number;
  projectActivityId: number;
  templateItemId: number | null;
  kind: ScheduleItemKind;
  name: string;
  anchorType: AnchorType;
  anchorRefId: number | null;       // ID of referenced schedule item
  offsetDays: number | null;        // +/- days from anchor
  fixedDate: string | null;         // For FIXED_DATE anchor type
  overrideDate: string | null;      // Manual override
  overrideEnabled: boolean;
  projectMilestoneId: number | null; // For PROJECT_MILESTONE anchor type
  sortOrder: number;
  createdAt: string;
}
```

**Supplier Instances:**

```typescript
type ActivityStatus = 'Not Started' | 'In Progress' | 'Under Review' | 'Blocked' | 'Complete' | 'Not Required';
// Under Review = submitted but not yet approved (e.g., PPAP submitted, awaiting OEM approval)
type ScopeOverride = 'REQUIRED' | 'NOT_REQUIRED' | null;

interface SupplierScheduleItemInstance {
  id: number;
  supplierActivityInstanceId: number;
  projectScheduleItemId: number;
  plannedDate: string | null;       // Computed or overridden
  actualDate: string | null;        // When actually completed
  status: ActivityStatus;
  plannedDateOverride: boolean;     // If true, propagation skips this
  scopeOverride: ScopeOverride;
  locked: boolean;                  // If true, propagation skips this
  notes: string | null;             // Per-item context (e.g., "Submitted 2/3, waiting for OEM review")
  createdAt: string;
}
```

**Applicability System:**

```typescript
type ApplicabilityOperator = 'ALL' | 'ANY';
type ApplicabilitySubject = 'SUPPLIER_NMR' | 'PART_PA';
type ApplicabilityComparator = 'IN' | 'NOT_IN' | 'EQ' | 'NEQ' | 'GTE' | 'LTE';

interface ActivityTemplateApplicabilityRule {
  id: number;
  activityTemplateId: number;
  operator: ApplicabilityOperator;  // ALL clauses must match, or ANY clause
  enabled: boolean;
  createdAt: string;
}

interface ActivityTemplateApplicabilityClause {
  id: number;
  ruleId: number;
  subjectType: ApplicabilitySubject;
  comparator: ApplicabilityComparator;
  value: string;                    // e.g., "A1,A2" for IN, or "Critical" for EQ
  createdAt: string;
}
```

**The API Envelope:**

```typescript
interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### Full Entity Hierarchy

```
Supplier
  ├── SupplierLocationCode (supplier number + location code)
  │     └── Part (part number + PA rank)
  └── SupplierProject (project applied to this supplier)
        ├── SupplierActivityInstance (per activity)
        │     ├── SupplierScheduleItemInstance (milestones/tasks with dates)
        │     └── SupplierActivityAttachment (links/documents)
        └── Part (backward compat reference)

Project
  ├── ProjectMilestone (PA2, PA3, SOP, etc.)
  └── ProjectActivity (activity from template library)
        └── ProjectScheduleItem (milestone/task with anchor rules)

ActivityTemplate (global library)
  ├── ActivityTemplateScheduleItem (default structure)
  ├── ActivityTemplateApplicabilityRule
  │     └── ActivityTemplateApplicabilityClause
  └── ActivityTemplateVersion (version tracking)

ProjectTemplate (reusable project structure)
  ├── ProjectTemplateMilestone
  └── ProjectTemplateActivity (references ActivityTemplate)
```

---

## 6. Database Design

### Engine Choice: sql.js (WASM)

sql.js compiles SQLite to WebAssembly. The entire database lives in memory and is serialized to a file on disk after each write.

**Why sql.js over better-sqlite3:**
- No native compilation step (no `node-gyp`, no Python dependency)
- No Electron version mismatch issues (native modules must match Electron's Node version)
- Works identically on Windows, macOS, and Linux
- Single `.wasm` file, no binary distribution headaches

**Trade-off:** The entire database must fit in memory. For a single-user desktop app tracking hundreds of suppliers and thousands of schedule items, this is not a practical concern.

### Initialization

```typescript
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';

export async function getDatabase(): Promise<SqlJsDatabase> {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'supplier-tracking.db');

  // Load WASM binary
  const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath).buffer;

  const SQL = await initSqlJs({ wasmBinary });

  // Load existing or create new
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  return db;
}
```

### Persistence

```typescript
export function saveDatabase(): void {
  if (db && dbPath) {
    const data = db.export();
    const tmpPath = dbPath + '.tmp';
    fs.writeFileSync(tmpPath, Buffer.from(data));
    fs.renameSync(tmpPath, dbPath);  // Atomic write — prevents corruption on crash
  }
}
```

The current implementation calls `saveDatabase()` after every `run()` call outside a transaction. **Improvement:** debounce saves to batch rapid writes (see Section 14).

### Query Helpers

```typescript
// Returns array of row objects
export function query<T = any>(sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

// Returns first row or null
export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  const results = query<T>(sql, params);
  return results[0] ?? null;
}

// Executes INSERT/UPDATE/DELETE, returns metadata
export function run(sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  db.run(sql, params);
  const lastId = query<{ id: number }>('SELECT last_insert_rowid() as id')[0]?.id || 0;
  const changes = query<{ changes: number }>('SELECT changes() as changes')[0]?.changes || 0;
  if (transactionDepth === 0) saveDatabase();
  return { lastInsertRowid: lastId, changes };
}
```

### Transaction Support

```typescript
let transactionDepth = 0;

export function beginTransaction(): void {
  if (transactionDepth === 0) db.run('BEGIN TRANSACTION');
  transactionDepth++;
}

export function commitTransaction(): void {
  transactionDepth--;
  if (transactionDepth === 0) {
    db.run('COMMIT');
    saveDatabase();
  }
}

export function rollbackTransaction(): void {
  transactionDepth = 0;
  db.run('ROLLBACK');
  // Do NOT save after rollback — the in-memory state is correct after ROLLBACK
  // Saving would be wasteful and misleading
}
```

**Recommended addition -- `withTransaction()` utility:**

```typescript
export async function withTransaction<T>(fn: () => T): Promise<T> {
  beginTransaction();
  try {
    const result = fn();
    commitTransaction();
    return result;
  } catch (error) {
    rollbackTransaction();
    throw error;
  }
}
```

### Case Conversion

Database columns use `snake_case`; TypeScript uses `camelCase`. Two recursive helpers handle conversion:

```typescript
export function toCamelCase<T>(obj: any): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase) as any;
  const result: any = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = toCamelCase(obj[key]);
  }
  return result;
}

export function toSnakeCase<T>(obj: any): T {
  // Inverse: replace uppercase with _lowercase
  // Same recursive structure
}
```

### Migration System

Migrations are numbered SQL files in `electron/migrations/`. A `migrations` table tracks which have been applied:

```sql
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The runner reads all `.sql` files from the directory, sorts by name, skips already-applied ones, and executes each in sequence. If any migration fails, it throws immediately (no partial state).

### Complete Schema (23 tables)

Listed in dependency order. All tables use `id INTEGER PRIMARY KEY AUTOINCREMENT` and `created_at TEXT NOT NULL DEFAULT (datetime('now'))`.

#### Core Entities

```sql
-- 1. Suppliers
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  notes TEXT,
  nmr_rank TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Activity Templates (version column replaces separate activity_template_versions table)
CREATE TABLE activity_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Projects
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  default_anchor_rule TEXT,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Project Structure

```sql
-- 4. Project Milestones (PA2, PA3, SOP, etc.)
CREATE TABLE project_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 5. Project Activities (links project to activity template)
CREATE TABLE project_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  activity_template_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  template_version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id)
);

-- 6. Project Schedule Items (milestones and tasks with anchor rules)
CREATE TABLE project_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_activity_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('MILESTONE', 'TASK')),
  name TEXT NOT NULL,
  anchor_type TEXT NOT NULL CHECK(anchor_type IN ('FIXED_DATE', 'SCHEDULE_ITEM', 'COMPLETION', 'PROJECT_MILESTONE')),
  anchor_ref_id INTEGER,
  offset_days INTEGER,
  fixed_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  template_item_id INTEGER,
  override_date TEXT,
  override_enabled INTEGER NOT NULL DEFAULT 0,
  project_milestone_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_activity_id) REFERENCES project_activities(id) ON DELETE CASCADE,
  FOREIGN KEY (anchor_ref_id) REFERENCES project_schedule_items(id),
  FOREIGN KEY (project_milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL
);
```

#### Supplier Instances

```sql
-- 7. Supplier Projects (project applied to a supplier)
CREATE TABLE supplier_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  project_version TEXT NOT NULL,
  supplier_project_nmr_rank TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE(supplier_id, project_id)
);

-- 8. Supplier Activity Instances
CREATE TABLE supplier_activity_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_project_id INTEGER NOT NULL,
  project_activity_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Not Started'
    CHECK(status IN ('Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete', 'Not Required')),
  scope_override TEXT CHECK(scope_override IN ('REQUIRED', 'NOT_REQUIRED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_project_id) REFERENCES supplier_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (project_activity_id) REFERENCES project_activities(id)
);

-- 9. Supplier Schedule Item Instances (the actual tracked items)
CREATE TABLE supplier_schedule_item_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_activity_instance_id INTEGER NOT NULL,
  project_schedule_item_id INTEGER NOT NULL,
  planned_date TEXT,
  actual_date TEXT,
  status TEXT NOT NULL DEFAULT 'Not Started'
    CHECK(status IN ('Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete', 'Not Required')),
  planned_date_override INTEGER NOT NULL DEFAULT 0,
  scope_override TEXT CHECK(scope_override IN ('REQUIRED', 'NOT_REQUIRED')),
  locked INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_activity_instance_id) REFERENCES supplier_activity_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (project_schedule_item_id) REFERENCES project_schedule_items(id)
);
```

#### Activity Template System

```sql
-- 10. Activity Template Schedule Items (default structure)
CREATE TABLE activity_template_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_template_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('MILESTONE', 'TASK')),
  name TEXT NOT NULL,
  anchor_type TEXT NOT NULL CHECK(anchor_type IN ('FIXED_DATE', 'SCHEDULE_ITEM', 'COMPLETION', 'PROJECT_MILESTONE')),
  anchor_ref_id INTEGER,
  offset_days INTEGER,
  project_milestone_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (anchor_ref_id) REFERENCES activity_template_schedule_items(id)
);

-- 11. Applicability Rules
CREATE TABLE activity_template_applicability_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_template_id INTEGER NOT NULL,
  operator TEXT NOT NULL DEFAULT 'ALL' CHECK(operator IN ('ALL', 'ANY')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE
);

-- 12. Applicability Clauses
CREATE TABLE activity_template_applicability_clauses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('SUPPLIER_NMR', 'PART_PA')),
  comparator TEXT NOT NULL CHECK(comparator IN ('IN', 'NOT_IN', 'EQ', 'NEQ', 'GTE', 'LTE')),
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (rule_id) REFERENCES activity_template_applicability_rules(id) ON DELETE CASCADE
);

-- Dropped: activity_template_versions table — version is now a column on activity_templates
```

#### Attachments

```sql
-- Dropped: project_activity_dependencies — anchor_ref_id on schedule items is sufficient for dependency tracking
-- Dropped: project_schedule_item_dependencies — anchor_ref_id on schedule items is sufficient for dependency tracking

-- 13. Supplier Activity Attachments
CREATE TABLE supplier_activity_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_activity_instance_id INTEGER NOT NULL,
  label TEXT,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_activity_instance_id) REFERENCES supplier_activity_instances(id) ON DELETE CASCADE
);
```

#### Parts & Location Codes

```sql
-- 17. Supplier Location Codes
CREATE TABLE supplier_location_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  supplier_number TEXT NOT NULL,
  location_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  UNIQUE (supplier_id, supplier_number, location_code)
);

-- 18. Parts
CREATE TABLE parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_project_id INTEGER NOT NULL,
  supplier_location_code_id INTEGER NOT NULL,
  part_number TEXT NOT NULL,
  description TEXT,
  pa_rank TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_project_id) REFERENCES supplier_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_location_code_id) REFERENCES supplier_location_codes(id) ON DELETE CASCADE,
  UNIQUE(supplier_location_code_id, part_number)
);
```

#### Settings, Audit, Project Templates

**Note:** The settings table and its default values are included in the initial migration (`001_initial_schema.sql`) — not deferred to a later phase. The scheduler, propagation, and applicability engines all depend on settings values.

**Note:** Parts, Location Codes, and Project Templates tables are deferred to later migrations as their phases are built. They are shown here for reference but are NOT in the initial migration.

```sql
-- 14. Settings (key-value store) — INCLUDED IN INITIAL MIGRATION
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default settings (inserted in initial migration):
INSERT INTO settings (key, value) VALUES ('nmr_ranks', '["A1","A2","B1","B2","C1"]');
INSERT INTO settings (key, value) VALUES ('pa_ranks', '["Critical","High","Medium","Low"]');
INSERT INTO settings (key, value) VALUES ('propagation_skip_complete', 'true');
INSERT INTO settings (key, value) VALUES ('propagation_skip_locked', 'true');
INSERT INTO settings (key, value) VALUES ('propagation_skip_overridden', 'true');
INSERT INTO settings (key, value) VALUES ('date_format', 'MM/DD/YYYY');
INSERT INTO settings (key, value) VALUES ('use_business_days', 'false');
INSERT INTO settings (key, value) VALUES ('auto_propagate_template_changes', 'false');
INSERT INTO settings (key, value) VALUES ('auto_propagate_to_suppliers', 'false');

-- 15. Audit Events
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  payload TEXT,                    -- JSON stringified before/after
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 21-23. Project Templates
CREATE TABLE project_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE project_template_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (template_id) REFERENCES project_templates(id) ON DELETE CASCADE
);

CREATE TABLE project_template_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  activity_template_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (template_id) REFERENCES project_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_template_id) REFERENCES activity_templates(id) ON DELETE CASCADE,
  UNIQUE(template_id, activity_template_id)
);
```

Plus the `migrations` tracking table (created automatically by the migration runner).

### Indexing Strategy

```sql
-- Foreign key lookups (JOIN performance)
CREATE INDEX idx_project_activities_project ON project_activities(project_id);
CREATE INDEX idx_project_schedule_items_activity ON project_schedule_items(project_activity_id);
CREATE INDEX idx_supplier_projects_supplier ON supplier_projects(supplier_id);
CREATE INDEX idx_supplier_projects_project ON supplier_projects(project_id);
CREATE INDEX idx_supplier_activity_instances_supplier_project ON supplier_activity_instances(supplier_project_id);
CREATE INDEX idx_supplier_schedule_item_instances_activity ON supplier_schedule_item_instances(supplier_activity_instance_id);
CREATE INDEX idx_parts_supplier_project ON parts(supplier_project_id);
CREATE INDEX idx_parts_supplier_location_code ON parts(supplier_location_code_id);

-- Audit log queries
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);

-- Applicability
CREATE INDEX idx_activity_template_rules_template ON activity_template_applicability_rules(activity_template_id);
CREATE INDEX idx_activity_template_rule_clauses_rule ON activity_template_applicability_clauses(rule_id);

-- Dropped: dependency table indexes (tables were dropped — anchor_ref_id is sufficient)

-- Attachments
CREATE INDEX idx_supplier_activity_attachments_instance ON supplier_activity_attachments(supplier_activity_instance_id);

-- Location codes
CREATE INDEX idx_supplier_location_codes_supplier ON supplier_location_codes(supplier_id);

-- Milestones
CREATE INDEX idx_project_milestones_project ON project_milestones(project_id);
CREATE INDEX idx_project_schedule_items_milestone ON project_schedule_items(project_milestone_id);

-- Templates
CREATE INDEX idx_template_milestones_template ON project_template_milestones(template_id);
CREATE INDEX idx_template_activities_template ON project_template_activities(template_id);
```

**Total: ~19 indexes across ~19 tables.** (Parts, Location Codes, and Project Templates indexes are added via later migrations as their phases are built.)

### Naming Conventions

- Tables: `snake_case`, plural (`suppliers`, `project_activities`)
- Columns: `snake_case` (`supplier_id`, `created_at`, `planned_date_override`)
- Foreign keys: `{referenced_table_singular}_id` (e.g., `supplier_id`, `project_activity_id`)
- Booleans: stored as `INTEGER` (0/1) with `NOT NULL DEFAULT 0`
- Dates: stored as `TEXT` in `YYYY-MM-DD` format
- Timestamps: stored as `TEXT` via `datetime('now')`
- Enums: `TEXT` with `CHECK` constraints

---

## 7. Electron Main Process

### App Lifecycle (`main.ts`)

```typescript
import { app, BrowserWindow } from 'electron';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Prevent multiple instances from accessing the same database file
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  await runMigrations();       // Init database, apply pending migrations
  registerHandlers();          // Register all IPC handlers

  const mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    minWidth: 1024, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),  // CJS required!
      contextIsolation: true,    // Security: renderer can't access Node
      nodeIntegration: false,    // Security: no require() in renderer
      sandbox: false,            // Required for sql.js WASM to work
    },
  });

  // Deep route fallback — prevents white screen on Ctrl+R in production
  mainWindow.webContents.on('did-fail-load', () => {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');  // Vite dev server
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase();
    app.quit();
  }
});

app.on('before-quit', () => closeDatabase());
```

### Preload API Surface (`preload.ts`)

The preload script bridges renderer and main process via `contextBridge.exposeInMainWorld()`. It exposes a single object `window.sqts` with 19 namespaces and 107 methods.

**Structure:**

```typescript
contextBridge.exposeInMainWorld('sqts', {
  versions: { node, chrome, electron },

  suppliers: {
    list:          () => ipcRenderer.invoke('suppliers:list'),
    listWithStats: () => ipcRenderer.invoke('suppliers:list-with-stats'),
    get:           (id) => ipcRenderer.invoke('suppliers:get', id),
    create:        (params) => ipcRenderer.invoke('suppliers:create', params),
    update:        (params) => ipcRenderer.invoke('suppliers:update', params),
    delete:        (id) => ipcRenderer.invoke('suppliers:delete', id),
  },

  projects: { /* list, listWithStats, get, getDetail, create, update, delete,
                 previewPropagation, propagateChanges */ },

  projectMilestones: { /* list, create, update, delete, bulkUpdate */ },
  projectTemplates:  { /* list, get, create, update, delete, addMilestone,
                          deleteMilestone, addActivity, deleteActivity, applyToProject */ },
  projectActivities: { /* list, get, create, update, delete, syncFromTemplate, batchCreate */ },
  scheduleItems:     { /* list, get, create, update, delete */ },

  activityTemplates: {
    /* list, listWithCounts, get, create, update, delete, duplicate,
       applyToAllProjects, getSyncStatus */
    scheduleItems:   { /* list, create, update, delete */ },
    applicability:   { /* get, upsertRule, deleteRule, createClause,
                          updateClause, deleteClause */ },
  },

  supplierProjects:                { /* list, listBySupplier, listBySupplierWithProgress,
                                        getDetail, apply, update */ },
  supplierActivityInstances:       { /* update */ },
  supplierScheduleItemInstances:   { /* update */ },
  supplierActivityAttachments:     { /* list, create, delete */ },
  supplierLocationCodes:           { /* list, create, delete */ },

  parts:       { /* list, create, update, delete */ },
  exportData:  { /* generateJson, saveToFile, fullDatabase */ },
  importData:  { /* selectFile, parseFile, analyze, execute */ },
  audit:       { /* list */ },
  settings:    { /* getAll, update, exportDatabase, importDatabase, wipeDatabase */ },
  dashboard:   { /* getData */ },
  reports:     { /* getOverview, getSupplierProgress, getProjectProgress,
                    getOverdueItems, getDueSoonItems */ },
});
```

**Key detail:** The preload must output as CommonJS (`.cjs`). Electron's preload scripts don't support ES modules. The Vite config handles this:

```typescript
// vite.config.ts - preload entry
{
  entry: 'electron/preload.ts',
  vite: {
    build: {
      rollupOptions: {
        output: [{ format: 'cjs', entryFileNames: 'preload.cjs' }]
      }
    }
  }
}
```

### Handler Architecture

**Current state:** All ~68 handlers live in a single 4,736-line `handlers.ts` file.

**Recommended:** Split into domain modules with a shared utilities file:

```typescript
// electron/handlers/shared.ts
export function createSuccessResponse<T>(data: T): APIResponse<T> {
  return { success: true, data };
}

export function createErrorResponse(error: string): APIResponse {
  return { success: false, error };
}

export function createAuditEvent(entityType: string, entityId: number,
                                  action: string, payload: any): void {
  run(`INSERT INTO audit_events (entity_type, entity_id, action, payload)
       VALUES (?, ?, ?, ?)`,
    [entityType, entityId, action, JSON.stringify(payload)]);
}

// electron/handlers/index.ts
export function registerHandlers(): void {
  registerSupplierHandlers();
  registerProjectHandlers();
  registerActivityHandlers();
  registerSupplierInstanceHandlers();
  registerImportExportHandlers();
  registerSettingsHandlers();
}
```

Each handler follows the same pattern:

```typescript
ipcMain.handle('suppliers:create', async (_event, params: CreateSupplierParams) => {
  try {
    const { name, notes } = params;
    if (!name?.trim()) return createErrorResponse('Name is required');

    const result = run(
      'INSERT INTO suppliers (name, notes) VALUES (?, ?)',
      [name.trim(), notes || null]
    );

    const supplier = queryOne('SELECT * FROM suppliers WHERE id = ?',
                              [result.lastInsertRowid]);
    return createSuccessResponse(toCamelCase<Supplier>(supplier));
  } catch (error) {
    console.error('Error creating supplier:', error);
    return createErrorResponse(String(error));
  }
});
```

### Dynamic SQL Update Pattern

All update handlers use a dynamic field builder to support partial updates:

```typescript
ipcMain.handle('suppliers:update', async (_event, params: UpdateSupplierParams) => {
  const { id, name, notes } = params;
  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }

  if (updates.length === 0) return createErrorResponse('No fields to update');

  values.push(id);
  run(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`, values);

  const updated = queryOne('SELECT * FROM suppliers WHERE id = ?', [id]);
  return createSuccessResponse(toCamelCase<Supplier>(updated));
});
```

---

## 8. Business Logic Engines

### 8.1 Scheduler Engine (Iterative Dependency Resolution)

The scheduler computes planned dates for all schedule items in a project activity. Items can depend on other items' dates, forming a dependency graph.

**COMPLETION anchors with null actual dates:** When the anchor item has not been completed (actual_date is null), the COMPLETION-anchored item cannot resolve. This is expected behavior — the item shows as "Pending — awaiting completion of [anchor item name]" in the UI. It is NOT treated as a circular dependency error. The scheduler simply leaves it unresolved and moves on.

**Algorithm: Wave-based resolution**

```
Input: Array of ProjectScheduleItem (potentially with circular dependencies)

Wave 1: Resolve all FIXED_DATE and PROJECT_MILESTONE items
         (they have no item-to-item dependencies)

Wave 2: Resolve items depending on Wave 1 results

Wave N: Resolve items depending on Wave N-1 results

Termination: When all items resolved, OR no progress in a wave
             (circular dependency detected)
```

**Implementation:**

```typescript
export function calculateScheduleDates(
  scheduleItems: ProjectScheduleItem[],
  useBusinessDays: boolean = false,
  actualDates?: Map<number, string | null>,
  milestoneDates?: Map<number, string | null>
): ScheduleItemWithDates[] {

  const resolvedDates = new Map<number, string>();  // itemId -> YYYY-MM-DD
  const results: ScheduleItemWithDates[] = [];
  const unprocessed = new Set(scheduleItems.map(item => item.id));

  while (unprocessed.size > 0) {
    let progress = false;

    for (const item of scheduleItems) {
      if (!unprocessed.has(item.id)) continue;

      const date = calculatePlannedDate(item, resolvedDates, useBusinessDays,
                                         actualDates, milestoneDates);

      if (date !== null) {
        resolvedDates.set(item.id, date);
        unprocessed.delete(item.id);
        progress = true;
        results.push({ ...item, plannedDate: date });
      }
    }

    if (!progress) {
      // Circular dependency -- mark remaining as errors
      for (const item of scheduleItems) {
        if (unprocessed.has(item.id)) {
          results.push({ ...item, plannedDate: null,
            error: 'Cannot compute date - circular dependency or missing anchor' });
        }
      }
      break;
    }
  }

  return scheduleItems.map(item =>
    results.find(r => r.id === item.id) || { ...item, plannedDate: null }
  );
}
```

**Date computation per anchor type:**

| Anchor Type | Resolution |
|---|---|
| `FIXED_DATE` | Return `item.fixedDate` directly |
| `SCHEDULE_ITEM` | Look up `anchorRefId` in `resolvedDates` map, add `offsetDays` |
| `COMPLETION` | Look up `anchorRefId` in `actualDates` map, add `offsetDays` |
| `PROJECT_MILESTONE` | Look up `projectMilestoneId` in `milestoneDates` map, add `offsetDays` |

**Override precedence:** If `item.overrideEnabled && item.overrideDate`, return the override immediately (before checking anchor type).

**Business days:** When `useBusinessDays` is true, offset calculation skips Saturdays and Sundays:

```typescript
function addDays(dateString: string, offsetDays: number, useBusinessDays: boolean): string {
  const date = new Date(dateString + 'T00:00:00');  // Local time

  if (!useBusinessDays) {
    date.setDate(date.getDate() + offsetDays);
  } else {
    const direction = offsetDays >= 0 ? 1 : -1;
    let remaining = Math.abs(offsetDays);
    while (remaining > 0) {
      date.setDate(date.getDate() + direction);
      if (date.getDay() !== 0 && date.getDay() !== 6) remaining--;
    }
  }

  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
```

**Circular dependency validation:**

```typescript
export function validateScheduleItems(items: ProjectScheduleItem[]): string[] {
  // Build dependency graph: itemId -> anchorRefId
  // Check for self-references
  // Check for cycles using visited-set traversal
  // Returns array of error messages (empty if valid)
}
```

### 8.2 Applicability Evaluator

Determines which activities should be included for a specific supplier project based on rules.

**Rule structure:**
- Each activity template can have one rule with an operator (`ALL` or `ANY`)
- Each rule has one or more clauses
- Each clause checks a subject (`SUPPLIER_NMR` or `PART_PA`) against a value using a comparator

**Evaluation logic:**

```typescript
function evaluateApplicabilityRule(
  rule: ActivityTemplateApplicabilityRule,
  clauses: ActivityTemplateApplicabilityClause[],
  context: { supplierNmrRank: string | null; partPaRanks: string[] }
): boolean {
  if (!rule.enabled) return true;  // Disabled rule = always include

  const results = clauses.map(clause => {
    const subject = clause.subjectType === 'SUPPLIER_NMR'
      ? context.supplierNmrRank
      : context.partPaRanks;
    return compareWithComparator(subject, clause.comparator, clause.value, rankOrder);
  });

  return rule.operator === 'ALL'
    ? results.every(Boolean)
    : results.some(Boolean);
}
```

**Comparators:**

| Comparator | Behavior |
|---|---|
| `EQ` | Exact string match |
| `NEQ` | Not equal |
| `IN` | Value is in comma-separated list |
| `NOT_IN` | Value is not in comma-separated list |
| `GTE` | Value rank >= target rank (uses configured rank order) |
| `LTE` | Value rank <= target rank |

**Rank ordering:** `GTE`/`LTE` comparators use the rank arrays from settings (e.g., `["A1","A2","B1","B2","C1"]`) where earlier entries are "higher" rank. Index position determines comparison.

**Evaluation triggers:**
- When a project is applied to a supplier
- When supplier NMR rank changes
- When applicability rules are modified
- When parts/PA ranks change

### 8.3 Propagation Engine

When project schedule items change (dates, anchors, milestones), the propagation engine pushes those changes to all supplier instances.

**Supplier-selective propagation:** The preview groups changes by supplier with per-supplier checkboxes. Default all checked. Users can uncheck specific suppliers to exclude them from this propagation run. This is critical — when PA3 moves, some suppliers may be ahead of schedule and the user doesn't want to push new dates to them.

**Two-phase approach: Preview then Apply**

**Phase 1: Preview** (`previewPropagation(projectId)`)

```
1. Find all supplier_projects for this project
2. For each supplier project:
   a. Get all supplier_schedule_item_instances
   b. Get master project_schedule_items
   c. Get project milestone dates
   d. Build actual dates map from supplier instances
   e. Recalculate all dates using the scheduler engine
   f. Compare current planned_date vs recalculated date
   g. Check protection flags (locked, overridden, complete)
   h. Classify each instance as willChange or wontChange
3. Return PropagationPreview { willChange[], wontChange[] }
```

**Phase 2: Apply** (`propagateChanges(projectId)`)

```
1. Get preview
2. For each willChange item:
   UPDATE supplier_schedule_item_instances
   SET planned_date = ?
   WHERE id = ?
3. Return PropagationResult { updated[], skipped[], errors[] }
```

**Protection policy (configurable in settings):**

```typescript
interface PropagationPolicy {
  skipComplete: boolean;    // Don't update items with status = 'Complete'
  skipLocked: boolean;      // Don't update items with locked = true
  skipOverridden: boolean;  // Don't update items with plannedDateOverride = true
  useBusinessDays: boolean; // Use business day offsets in recalculation
}
```

**Decision tree per instance:**

```
Is instance locked?          -> Skip (reason: "Locked")
Is instance overridden?      -> Skip (reason: "Manually overridden")
Is instance complete?        -> Skip (reason: "Already complete")
Is new date same as current? -> No change needed
Otherwise                    -> Update planned_date
```

### 8.4 Template Sync Engine

**Simplified approach (post-review):** Template sync is manual only. When a template changes, the user explicitly clicks "Refresh from Template" on each project activity. There is no automatic cascade from template → projects → suppliers. The `auto_propagate_template_changes` and `auto_propagate_to_suppliers` settings exist in the database but the automatic behavior is deferred.

When an activity template's schedule items change, those changes can propagate to project activities and then to supplier instances.

**Version tracking:**
- `activity_template_versions` table stores the current version number
- `project_activities.template_version` records which version was last synced
- Comparison reveals out-of-sync projects

**Sync flow:**

```
1. Template schedule items change
2. bumpTemplateVersion() increments version number
3. If auto_propagate_template_changes = true:
   a. Find all project_activities using this template
   b. For each: sync schedule items (add new, remove deleted, update names)
   c. Two-pass insertion: first create items, then wire anchor references
   d. If auto_propagate_to_suppliers = true:
      e. For each affected project: run propagateChanges()
```

**Sync operation details:**
- New template items are added to project activities
- Removed template items are deleted from project activities (cascades to supplier instances)
- Anchor references are remapped using an ID translation map
- The sync preserves project-level overrides on schedule items

---

## 9. React Frontend

### Entry Point

```typescript
// src/main.tsx
import { BrowserRouter } from 'react-router-dom';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
```

### Routing

```typescript
// src/App.tsx
function App() {
  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/suppliers" element={<SuppliersList />} />
          <Route path="/suppliers/:id" element={<SupplierDetail />} />
          <Route path="/supplier-projects/:id" element={<SupplierProjectDetailPage />} />
          <Route path="/projects" element={<ProjectsList />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:projectId/configure-dates" element={<ProjectConfigureDates />} />
          <Route path="/activity-library" element={<ActivityLibraryPage />} />
          <Route path="/parts" element={<PartsList />} />
          <Route path="/project-templates" element={<ProjectTemplatesPage />} />
          <Route path="/import-export" element={<ImportExportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </Layout>
      <Toaster />
    </>
  );
}
```

### Layout

Two-column layout: collapsible sidebar + scrollable main content area. Sidebar has icon-only mode (~60px) and full mode (~220px). Toggle button at bottom of sidebar. Collapsed preference persisted in localStorage.

```typescript
// src/components/Layout.tsx
export function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sidebar-collapsed') === 'true'
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => {
        setCollapsed(!collapsed);
        localStorage.setItem('sidebar-collapsed', String(!collapsed));
      }} />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
```

The sidebar has two navigation groups:
- **Primary:** Dashboard, Suppliers, Projects, Activity Templates, Parts, Reports
- **Secondary:** Project Templates, Import/Export, Settings, Help

### UI Component Library (shadcn/ui pattern)

Components live in `src/components/ui/` and follow the shadcn/ui convention:
- Built on Radix UI primitives (accessible, unstyled)
- Styled with Tailwind CSS
- Variants managed with `class-variance-authority` (CVA)
- Class merging via `cn()` utility (`clsx` + `tailwind-merge`)

```typescript
// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Component inventory:**

| Component | Radix Primitive | Purpose |
|---|---|---|
| Button | n/a | Actions with 6 variants (default, destructive, outline, secondary, ghost, link) |
| Card | n/a | Content containers |
| Dialog | @radix-ui/react-dialog | Modal overlays for CRUD forms |
| Input | n/a | Text fields |
| Label | @radix-ui/react-label | Form labels |
| Textarea | n/a | Multi-line text |
| Table | n/a | Data tables (Header, Body, Row, Cell) |
| Select | @radix-ui/react-select | Dropdown selectors |
| Tabs | @radix-ui/react-tabs | Tab panels |
| Switch | n/a | Toggle switches |
| RadioGroup | n/a | Radio buttons |
| Breadcrumb | n/a | Navigation breadcrumbs |
| StatusBadge | n/a | Status indicators with paired icons for accessibility: Complete (green, checkmark), In Progress (blue, circle), Under Review (purple/indigo, eye), Blocked (red, triangle), Not Started (gray, dash), Not Required (muted, cross). Overdue is a visual overlay (amber/orange clock icon), not a status. |
| LoadingSpinner | n/a | Centered spinner for async loading states, used on every page |
| EmptyState | n/a | Icon + message + CTA button for empty lists, used from Phase 2 onward |
| Toast/Toaster | @radix-ui/react-toast | Notification system |

**Theming:** All colors use CSS variables with HSL values, defined in `index.css` and referenced in `tailwind.config.js`:

```css
/* index.css */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* ... */
}
```

```javascript
// tailwind.config.js
colors: {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
  // ...
}
```

### Page Architecture Pattern

Every page follows the same structure:

```typescript
export function EntityList() {
  const [data, setData] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const response = await window.sqts.entity.list();
    if (response.success && response.data) setData(response.data);
    setLoading(false);
  }

  async function handleSubmit(params: CreateEntityParams) {
    const response = editing
      ? await window.sqts.entity.update({ id: editing.id, ...params })
      : await window.sqts.entity.create(params);

    if (response.success) {
      await loadData();          // Refresh list
      setDialogOpen(false);      // Close dialog
      toast({ title: 'Saved' }); // Notify user
    } else {
      toast({ variant: 'destructive', description: response.error });
    }
  }

  const filtered = data.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header with title + create button */}
      {/* Search input */}
      {/* Data table with filtered results */}
      {/* CRUD dialog */}
    </div>
  );
}
```

### State Management

**Current:** All local state via `useState` + `useEffect`. No Redux, no Zustand, no contexts. Every page fetches its own data on mount.

**Recommendation:** Replace with TanStack Query for automatic caching, stale-while-revalidate, and refetch on window focus. This eliminates redundant IPC calls when navigating between pages.

### Error Handling

**Current pattern:**

```typescript
const response = await window.sqts.entity.method(params);
if (response.success && response.data) {
  // Handle data
} else {
  toast({ variant: 'destructive', description: response.error || 'Something went wrong' });
}
```

No error boundaries. Unhandled promise rejections go to the console.

**Recommendation:** Add a global `ErrorBoundary` component wrapping routes, and consider structured error codes in `APIResponse` (see Section 14).

### Key Pages Overview

| Page | Lines | Complexity | Key Features |
|---|---|---|---|
| Dashboard | ~317 | Medium | Summary cards, filters (date range, supplier, project, status), actionable items table |
| SupplierDetail | ~720 | High | Projects tab (progress cards), location codes, "Apply Project" dialog with applicability preview |
| ProjectDetail | ~300+ | High | Activities tab, milestones tab, suppliers tab, audit log, propagation actions |
| SupplierProjectDetail | ~300+ | High | Collapsible activities, schedule item tracking, overrides, locks, status changes |
| ActivityLibraryPage | ~500+ | High | Template CRUD, schedule items, applicability rules, sync status, duplicate |
| ProjectConfigureDates | ~300+ | High | Anchor type editing, offset configuration, date override controls |
| SettingsPage | ~200+ | Medium | Rank management, propagation toggles, date format, database export/import/wipe |
| ReportsPage | ~150+ | Medium | Five tabs with tables and CSV export |
| ImportExportPage | ~200+ | Medium | Export/import tabs, match/merge review, edit incoming records |

---

## 10. Development Phases

Build in this order. Each phase adds a self-contained feature layer that can be tested before moving to the next.

### Phase 1: Project Scaffolding + Database Layer
- Initialize Electron + Vite + React + TypeScript project
- Verify vite-plugin-electron compatibility with Vite version (pin Vite 5 if Vite 6 has issues)
- Configure three tsconfig files (renderer, main, node)
- Set up Tailwind CSS with CSS variable theming
- Install Radix UI primitives and lucide-react icons
- Create Layout + **collapsible** Sidebar + Router skeleton with placeholder pages
- Build LoadingSpinner and EmptyState UI primitives
- Build StatusBadge with paired icons for accessibility
- Configure electron-builder for packaging with **complete WASM extraResources config**
- Implement `database.ts` with sql.js WASM initialization and **atomic writes** (temp file + rename)
- Implement `app.requestSingleInstanceLock()` in main.ts
- Add `did-fail-load` fallback on BrowserWindow for deep route failures
- Build query/queryOne/run helpers with automatic save
- Implement transaction support (begin/commit/rollback — **rollback does NOT save**)
- Implement toCamelCase/toSnakeCase converters
- Build migration runner
- Write initial schema migration (001) — **~19 tables with settings defaults**
- Verify: database creates, persists, reloads

### Phase 2: Core CRUD (Suppliers, Projects, Activity Templates)
- Create shared types for core entities
- Implement handlers for supplier CRUD (including nmr_rank, contact fields)
- Implement handlers for project CRUD with milestones
- Implement handlers for activity template CRUD with schedule items
- Build preload API surface for these domains
- Build list/detail pages with dialog-based create/edit/delete
- **Empty states on all list pages from this phase onward**
- Activity template schedule item management: **full-page editable table** (not dialog)
- Verify: can create, list, update, delete all three entity types

### Phase 3: Schedule Item Anchoring
- Implement ProjectScheduleItem CRUD with anchor type support
- Build the scheduler engine (iterative dependency resolution)
- Build ProjectConfigureDates page with anchor editing UI
- Support FIXED_DATE, SCHEDULE_ITEM, COMPLETION anchor types
- Add circular dependency validation
- COMPLETION anchors with null actual dates show as "Pending" (not error)
- Verify: dates compute correctly through dependency chains

### Phase 4: Project Milestones
- Add PROJECT_MILESTONE anchor type
- Create project_milestones table and handlers
- Link schedule items to milestones via project_milestone_id
- Build milestone management UI in project detail
- Verify: milestone date changes propagate through anchored items

### Phase 5: Apply Project to Supplier
- Implement "apply" handler that creates SupplierProject + instances
- **Initial UI:** Show checklist of activities with checkboxes (manual selection, no rule engine yet)
- Copy project activities and schedule items to supplier instances
- Compute initial planned dates via scheduler
- Build SupplierProjectDetail page with schedule item tracking
- **Batch status update:** checkboxes on rows + "Mark Selected Complete" with date picker
- **Summary stats on collapsed activity headers:** "PPAP Submission [3/8 Complete] [2 Overdue]"
- **Overdue visual treatment:** amber/orange indicator on items past planned date
- **Notes field** on supplier schedule item instances — editable per item
- Inline status dropdowns and date pickers directly in table rows
- Implement status updates (Not Started -> In Progress -> Under Review -> Complete)
- Implement actual date recording
- **Basic overdue items list page** (planned_date < today AND status NOT IN Complete, Not Required)
- Verify: supplier gets correct initial dates, can track progress

### Phase 6: Propagation Engine
- Implement PropagationPolicy from settings
- Build previewPropagation() with willChange/wontChange classification
- Build propagateChanges() with protection logic
- Build PropagationPreviewModal in UI with **per-supplier checkboxes** (supplier-selective propagation)
- Store propagation events in audit_events table with summary payload
- Add propagation triggers when project milestones are edited
- Verify: project date changes push to suppliers, locks/overrides respected

**THIS IS THE MVP.** At this point, the user can stop using Excel. Phases 1-6 give the user the complete create → track → propagate workflow. These phases must be solid before proceeding.

### Phase 7: Applicability Rules
- **Note:** The manual checkbox approach from Phase 5 remains the primary interface. This phase adds the automated rule engine as an enhancement.
- Create applicability rule/clause tables (if not already in initial migration)
- Build rule evaluation engine with ALL/ANY operators
- Implement GTE/LTE rank comparison using settings rank arrays
- Add applicability preview in "Apply Project" dialog
- Auto-evaluate on NMR rank change and rule modification
- Verify: activities correctly included/excluded based on rules

### Phase 8: Template Sync
- **Manual "Refresh from Template" only.** No automatic cascade from template → projects → suppliers.
- Implement version bumping on template changes (uses version column on activity_templates)
- Build sync detection (out-of-sync badge)
- Implement syncFromTemplate handler (two-pass insertion)
- Verify: user can manually refresh project activities from updated templates

### Phase 9: Parts & Location Codes
- Create supplier_location_codes and parts tables via new migration
- Implement parts CRUD with location code association
- Build PartsList page with supplier project selector
- Wire PA rank to applicability evaluation
- Verify: parts with PA ranks affect activity applicability

### Phase 10: Settings UI
- Implement settings handlers (get/update with upsert) — settings table already exists
- Build SettingsPage with rank management, propagation toggles
- Wire settings into scheduler (business days) and propagation (skip policies)
- Verify: settings changes affect system behavior

### Phase 11: Dashboard & Reports
- Build dashboard query with filters (date range, supplier, project, status)
- Implement summary calculations (overdue, due soon, blocked counts)
- Build actionable items query with multi-table JOINs
- Build reports: overview, supplier progress, project progress, overdue/due-soon lists
- Add CSV export for report tables
- Verify: dashboard shows correct metrics, reports export cleanly

### Phase 12: Import/Export
- Build export assembler (selective and full database export)
- Build import parser — database backup/restore is the primary use case
- Build import/export UI
- Add database-level backup/restore via settings
- Verify: round-trip export then import preserves data

### Phase 13: Project Templates
- Create project template tables via new migration
- Implement template CRUD with milestones and activities
- Build "apply template to project" with REPLACE_ALL and MERGE_ADD strategies
- Build template management UI
- Verify: templates create correct project structure

### Phase 14: Polish
- Add help page with documentation
- Implement breadcrumb navigation
- Audit log viewing per entity
- Keyboard shortcuts (DevTools toggle: Ctrl+Shift+I)
- Final type-check and lint pass

---

## 11. Key Patterns & Conventions

### snake_case / camelCase Boundary

**Rule:** Database columns are `snake_case`. TypeScript interfaces are `camelCase`. Conversion happens at the handler layer.

```typescript
// Handler returns data to renderer
const row = queryOne('SELECT * FROM suppliers WHERE id = ?', [id]);
return createSuccessResponse(toCamelCase<Supplier>(row));

// Handler receives data from renderer
const { supplierProjectNmrRank } = params;  // camelCase from renderer
run('UPDATE supplier_projects SET supplier_project_nmr_rank = ? WHERE id = ?',
    [supplierProjectNmrRank, id]);  // snake_case in SQL
```

### APIResponse with Consistent Error Handling

```typescript
// Success
{ success: true, data: { id: 1, name: "Acme Corp", ... } }

// Error
{ success: false, error: "Supplier not found" }
```

Every handler is wrapped in try/catch:

```typescript
try {
  // ... business logic ...
  return createSuccessResponse(result);
} catch (error) {
  console.error('Error in handler:', error);
  return createErrorResponse(String(error));
}
```

### Dynamic SQL Updates (Partial Update Pattern)

Every update handler builds the SET clause dynamically based on which fields are provided:

```typescript
const updates: string[] = [];
const values: any[] = [];

if (name !== undefined) { updates.push('name = ?'); values.push(name); }
if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }

if (updates.length === 0) return createErrorResponse('No fields to update');

values.push(id);
run(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`, values);
```

### Dialog-Based CRUD (Frontend)

All create/edit operations use modal dialogs:
1. User clicks "Create" or "Edit" button
2. Dialog opens with form fields
3. User fills in fields and clicks "Save"
4. Component calls `window.sqts.entity.create()` or `.update()`
5. On success: close dialog, refresh list, show toast
6. On error: show destructive toast with error message

### Boolean SQLite Mapping

SQLite has no boolean type. Booleans are stored as `INTEGER` (0 or 1):

```sql
planned_date_override INTEGER NOT NULL DEFAULT 0
locked INTEGER NOT NULL DEFAULT 0
```

In handlers, convert with `Boolean()`:

```typescript
const instance = {
  ...toCamelCase(row),
  locked: Boolean(row.locked),
  plannedDateOverride: Boolean(row.planned_date_override),
};
```

### Date Handling

All dates stored and transmitted as `YYYY-MM-DD` strings. Never use JavaScript `Date` objects across the IPC boundary.

```typescript
// Parse for arithmetic (always local time)
const date = new Date(dateString + 'T00:00:00');

// Format for display (done in each page currently)
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}
```

### Settings Upsert

Settings use SQLite's `ON CONFLICT` for upsert:

```sql
INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
```

---

## 12. Common Pitfalls

### sql.js Memory

The entire database is in memory. `db.export()` serializes to a `Uint8Array` on every save. For a database under 50MB this is fine. If the database grows beyond that:
- Consider batching saves (debounce `saveDatabase()`)
- Monitor memory usage with Electron's `process.memoryUsage()`
- For truly large datasets, switch to better-sqlite3 (requires native rebuild)

### WASM File Location

sql.js needs its `.wasm` file at runtime. The path differs between development (node_modules) and production (packaged app). The current code tries multiple paths:

```typescript
const possiblePaths = [
  path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
  path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', file),
];
```

**In production builds:** Ensure the WASM file is included via `electron-builder.json`'s `extraResources` or `files` configuration.

### Preload Must Be CommonJS

Electron's preload scripts must be CommonJS format (`.cjs`). The Vite config explicitly outputs the preload as CJS:

```typescript
output: [{ format: 'cjs', entryFileNames: 'preload.cjs' }]
```

The main process references this:

```typescript
preload: path.join(__dirname, 'preload.cjs')
```

If you accidentally output ES module format, you'll get a cryptic "Cannot use import statement outside a module" error.

### Foreign Key Enforcement

SQLite does not enforce foreign keys by default. You must enable them on every connection:

```sql
PRAGMA foreign_keys = ON;
```

This is done once in `getDatabase()`. Without it, you can insert rows with invalid foreign key references, and `ON DELETE CASCADE` won't work.

### Circular Dependencies in Schedule Items

Schedule items can reference each other via `anchor_ref_id`. Without validation, you can create cycles (A depends on B, B depends on A). The scheduler handles this gracefully (detects no-progress and returns error), but the UI should prevent it by running `validateScheduleItems()` before saving.

### Propagation Side Effects

Propagation can trigger a cascade:
1. Project date changes
2. Propagation updates supplier planned dates
3. Those updates might affect COMPLETION-anchored items in the same supplier
4. Which might need another round of propagation

The current implementation does a single pass. Deep dependency chains may need multiple propagation rounds or a recursive approach.

### Missing Transaction Wrapping

Only one handler currently uses transactions (`handleProjectTemplateApplyToProject`). Many multi-step operations should be wrapped:
- Applying a project to a supplier (creates supplier_project + activity instances + schedule item instances)
- Syncing from template (deletes old items, creates new items, rewires anchors)
- Import execution (creates/updates many entities)

Without transactions, a failure partway through leaves the database in an inconsistent state.

### BrowserRouter in Electron

The app uses `BrowserRouter` from react-router-dom. In Electron, this works during development (Vite dev server handles routing). In production, loading from a file (`index.html`), navigation to `/suppliers` would try to load a non-existent file. The Vite config sets `base: './'` which helps, but `HashRouter` is technically more reliable in Electron packaged apps. The current implementation works because Electron loads from `loadFile()` and all navigation is client-side SPA routing. A `did-fail-load` handler on the BrowserWindow reloads `index.html` as a fallback for deep route failures.

### Atomic Database Writes

Never use `fs.writeFileSync(dbPath, ...)` directly. Write to `dbPath + '.tmp'` then `fs.renameSync()`. This prevents database corruption if the app crashes during write.

### Single Instance Lock

Call `app.requestSingleInstanceLock()` early in main.ts. Without it, two app instances can open the same database file simultaneously, leading to corruption.

### Vite Plugin Compatibility

Verify `vite-plugin-electron` works with your Vite major version before starting. Pin Vite 5 if Vite 6 has issues with the plugin.

### COMPLETION Anchors Are Not Errors

When `actual_date` is null on the anchor item, the dependent COMPLETION-anchored item is simply unresolvable. Don't mark it as a circular dependency. The scheduler leaves it unresolved and the UI shows "Pending — awaiting completion of [anchor item name]."

---

## 13. Testing & Verification

### Vitest Setup

Add Vitest for unit testing the pure-logic modules:

```bash
npm install -D vitest
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
```

```json
// package.json
"scripts": {
  "test": "vitest",
  "test:run": "vitest run"
}
```

### Priority Test Targets

**1. Scheduler Engine** (highest value -- pure function, complex logic)

```typescript
// electron/scheduler.test.ts
import { calculateScheduleDates, validateScheduleItems } from './scheduler';

describe('calculateScheduleDates', () => {
  it('resolves FIXED_DATE items in first wave', () => {
    const items = [
      { id: 1, anchorType: 'FIXED_DATE', fixedDate: '2026-03-01', /* ... */ },
    ];
    const result = calculateScheduleDates(items);
    expect(result[0].plannedDate).toBe('2026-03-01');
  });

  it('resolves SCHEDULE_ITEM chain', () => {
    const items = [
      { id: 1, anchorType: 'FIXED_DATE', fixedDate: '2026-03-01' },
      { id: 2, anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 5 },
      { id: 3, anchorType: 'SCHEDULE_ITEM', anchorRefId: 2, offsetDays: 10 },
    ];
    const result = calculateScheduleDates(items);
    expect(result[1].plannedDate).toBe('2026-03-06');
    expect(result[2].plannedDate).toBe('2026-03-16');
  });

  it('detects circular dependencies', () => {
    const items = [
      { id: 1, anchorType: 'SCHEDULE_ITEM', anchorRefId: 2 },
      { id: 2, anchorType: 'SCHEDULE_ITEM', anchorRefId: 1 },
    ];
    const result = calculateScheduleDates(items);
    expect(result[0].error).toContain('circular');
  });

  it('handles business days correctly', () => {
    // Friday + 1 business day = Monday
    const items = [
      { id: 1, anchorType: 'FIXED_DATE', fixedDate: '2026-02-06' }, // Friday
      { id: 2, anchorType: 'SCHEDULE_ITEM', anchorRefId: 1, offsetDays: 1 },
    ];
    const result = calculateScheduleDates(items, true);
    expect(result[1].plannedDate).toBe('2026-02-09'); // Monday
  });

  it('respects overrideDate when overrideEnabled', () => {
    const items = [
      { id: 1, anchorType: 'FIXED_DATE', fixedDate: '2026-03-01',
        overrideEnabled: true, overrideDate: '2026-04-01' },
    ];
    const result = calculateScheduleDates(items);
    expect(result[0].plannedDate).toBe('2026-04-01');
  });
});
```

**2. Applicability Evaluator**

```typescript
describe('evaluateApplicabilityRule', () => {
  it('ALL operator requires all clauses to match', () => { /* ... */ });
  it('ANY operator requires at least one clause', () => { /* ... */ });
  it('GTE comparator uses rank order', () => { /* ... */ });
  it('IN comparator checks comma-separated list', () => { /* ... */ });
  it('disabled rule always returns true', () => { /* ... */ });
});
```

**3. Propagation Logic**

```typescript
describe('shouldPropagateToInstance', () => {
  it('skips locked instances', () => {
    const instance = { locked: true, plannedDateOverride: false, status: 'Not Started' };
    const policy = { skipLocked: true, skipOverridden: true, skipComplete: true };
    expect(shouldPropagateToInstance(instance, policy)).toBe(false);
  });

  it('allows propagation when no protection flags', () => { /* ... */ });
  it('respects policy toggle for complete items', () => { /* ... */ });
});
```

### Integration Test Pattern

For handlers that touch the database, initialize an in-memory sql.js database in `beforeEach`:

```typescript
import initSqlJs from 'sql.js';

let db;
beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  // Run schema migrations
});

afterEach(() => db.close());
```

### `npm run verify`

The existing verification command runs type-check + lint:

```bash
npm run verify  # Equivalent to: npm run type-check && npm run lint
```

With tests added:

```bash
npm run verify  # type-check && lint && vitest run
```

---

## 14. Recommended Improvements

### Critical Priority

#### Auto-Backup Before Database Import/Wipe

**Problem:** The settings page allows database import (replace) and wipe (delete all data). A misclick or corrupted import file can destroy all data with no recovery path.

**Solution:** Before any destructive database operation, automatically copy the current `.db` file to a timestamped backup:

```typescript
function autoBackup(): string {
  const backupDir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `supplier-tracking-${timestamp}.db`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}
```

Call `autoBackup()` at the start of `handleSettingsImportDatabase()` and `handleSettingsWipeDatabase()`.

**Impact:** Prevents permanent data loss. Minimal implementation effort.

#### Transaction Wrapping for Multi-Step Operations

**Problem:** Many handlers perform multiple INSERT/UPDATE/DELETE operations without transactions. If an error occurs mid-operation, the database is left in an inconsistent state. Each non-transactional `run()` call also triggers `saveDatabase()`, creating unnecessary I/O.

**Solution:** Implement `withTransaction()` utility and wrap all multi-step handlers:

```typescript
export async function withTransaction<T>(fn: () => T): Promise<T> {
  beginTransaction();
  try {
    const result = fn();
    commitTransaction();  // Only saves to disk once
    return result;
  } catch (error) {
    rollbackTransaction();
    throw error;
  }
}

// Usage
const result = await withTransaction(() => {
  // Multiple inserts/updates -- no intermediate disk writes
  run('INSERT INTO ...', [...]);
  run('INSERT INTO ...', [...]);
  run('UPDATE ...', [...]);
  return someResult;
});
```

**Handlers that need transactions:**
- `supplier-projects:apply` (creates supplier_project + activity instances + schedule items)
- `project-activities:sync-from-template` (deletes old, creates new, rewires anchors)
- `import:execute` (bulk entity creation)
- `project-activities:batch-create` (multi-project, multi-activity creation)
- `activity-templates:duplicate` (copies template + schedule items + rules)

**Impact:** Data consistency + significant performance improvement (one disk write per operation instead of N).

---

### High Priority

#### Split handlers.ts into Domain Modules

**Problem:** `handlers.ts` is 4,736 lines in a single file. Finding, modifying, and reviewing handler code requires scrolling through thousands of lines. IDE performance suffers.

**Solution:** Split into ~6 domain files under `electron/handlers/`:

| File | Handlers | Est. Lines |
|---|---|---|
| `suppliers.ts` | Supplier CRUD, location codes | ~400 |
| `projects.ts` | Project CRUD, milestones, propagation, templates | ~800 |
| `activities.ts` | Activity templates, schedule items, applicability, sync | ~1200 |
| `supplier-instances.ts` | Supplier projects, activity instances, schedule instances, parts, attachments | ~1000 |
| `import-export.ts` | Export/import operations | ~500 |
| `settings.ts` | Settings, dashboard, reports | ~800 |

Each file exports a `registerXxxHandlers()` function. The index re-exports and calls all of them.

**Impact:** Developer productivity. No functional changes.

#### TanStack Query for Frontend Data Caching

**Problem:** Every page re-fetches its data on mount via `useEffect`. Navigating from SuppliersList to SupplierDetail and back re-fetches the entire supplier list. No stale-while-revalidate, no background refresh.

**Solution:** Replace `useState`/`useEffect` data fetching with TanStack Query:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function SuppliersList() {
  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await window.sqts.suppliers.listWithStats();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: (params) => window.sqts.suppliers.create(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
```

**Impact:** Faster page transitions (cached data shown immediately), automatic refetch, simpler component code, eliminates ~50 duplicated `loadData()` functions.

#### Vitest with Tests for Core Engines

**Problem:** No tests exist. The scheduler, applicability, and propagation engines contain complex logic that is easy to break during refactoring.

**Solution:** Add Vitest with unit tests for:
1. `scheduler.ts` -- date computation, business days, circular dependency detection
2. Applicability evaluator -- ALL/ANY operators, all 6 comparators, rank ordering
3. `propagation.ts` -- protection policy, change classification

**Impact:** Confidence in refactoring. Catches regressions in date computation and rule evaluation.

#### Global Error Boundary

**Problem:** No React error boundary exists. An uncaught render error crashes the entire app with a white screen.

**Solution:** Wrap routes in an error boundary:

```typescript
import { Component, ErrorInfo, ReactNode } from 'react';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  state = { hasError: false, error: undefined };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <Button onClick={() => this.setState({ hasError: false })}>Try Again</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Impact:** Graceful error recovery instead of white screen crashes.

#### Debounce/Batch saveDatabase() Calls

**Problem:** Every `run()` call outside a transaction triggers `fs.writeFileSync()`, serializing the entire database to disk. Batch operations (like applying a project to a supplier) can trigger dozens of saves.

**Solution:** Debounce saves with a short delay:

```typescript
let saveTimer: NodeJS.Timeout | null = null;

export function saveDatabase(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (db && dbPath) {
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    }
    saveTimer = null;
  }, 100);  // 100ms debounce
}

export function saveDatabaseImmediately(): void {
  if (saveTimer) clearTimeout(saveTimer);
  if (db && dbPath) {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}
```

Call `saveDatabaseImmediately()` on app quit and after transactions. Use the debounced version for individual `run()` calls.

**Impact:** Significant I/O reduction. A 20-insert operation goes from 20 disk writes to 1.

---

### Medium Priority

#### Shared IPC Channel Constants

**Problem:** Channel names like `'suppliers:list'` are string literals duplicated in handlers.ts and preload.ts. A typo in either location silently breaks the channel.

**Solution:** Define channel names as shared constants:

```typescript
// shared/channels.ts
export const CHANNELS = {
  SUPPLIERS_LIST: 'suppliers:list',
  SUPPLIERS_GET: 'suppliers:get',
  SUPPLIERS_CREATE: 'suppliers:create',
  // ... all 68 channels
} as const;
```

Import in both preload and handlers. TypeScript catches any typos at compile time.

#### Eliminate Duplicate formatDate Implementations

**Problem:** At least 8 pages define their own `formatDate()` function with identical logic.

**Solution:** Create a single shared utility:

```typescript
// src/lib/format.ts
import { format, parseISO } from 'date-fns';

export function formatDate(dateStr: string | null, formatStr: string = 'MMM d, yyyy'): string {
  if (!dateStr) return '-';
  return format(parseISO(dateStr), formatStr);
}
```

**Impact:** Single source of truth. Honors the date format setting from AppSettings.

#### Zod Schemas for Handler Input Validation

**Problem:** Handlers trust that the renderer sends valid data. No runtime validation. A malformed `params` object can cause cryptic SQL errors or data corruption.

**Solution:** Define Zod schemas for each params type and validate at the handler boundary:

```typescript
import { z } from 'zod';

const CreateSupplierSchema = z.object({
  name: z.string().min(1).trim(),
  notes: z.string().optional(),
});

ipcMain.handle('suppliers:create', async (_event, params) => {
  const parsed = CreateSupplierSchema.safeParse(params);
  if (!parsed.success) {
    return createErrorResponse(`Validation error: ${parsed.error.message}`);
  }
  // Use parsed.data (trimmed, validated)
});
```

#### Structured Error Codes in APIResponse

**Problem:** Error messages are free-form strings. The renderer can't distinguish "not found" from "validation error" from "database constraint violation" without parsing the string.

**Solution:** Add an error code field:

```typescript
interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'CONSTRAINT' | 'INTERNAL';
}
```

#### Composite Database Indexes for Dashboard/Report Queries

**Problem:** Dashboard and report queries join multiple tables with date comparisons. Without composite indexes, these queries do full table scans on large datasets.

**Solution:** Add targeted composite indexes:

```sql
-- Dashboard: overdue items by status and date
CREATE INDEX idx_ssi_status_date ON supplier_schedule_item_instances(status, planned_date);

-- Reports: supplier progress
CREATE INDEX idx_sp_supplier_project ON supplier_projects(supplier_id, project_id);
```

#### Additional Medium-Priority Items

- **SettingsContext** for global React state (date format, business days, ranks) instead of fetching settings on every page
- **Selective propagation per supplier** (currently all-or-nothing per project)
- **Batch status updates** for schedule items (mark multiple items complete at once)
- **Global search / command palette** (Ctrl+K) for quick navigation to any entity
- **Activity/schedule item notes/comments** field for tracking context

---

### Low Priority

| Improvement | Description |
|---|---|
| Split shared/types.ts into domain files | Currently 965 lines in one file. Split into core.ts, schedule.ts, instances.ts, etc. |
| Preload API type deduplication | The SQTSAPI interface in preload.ts duplicates the contextBridge implementation. Generate one from the other. |
| Pagination for list queries | Currently all lists load everything. For large datasets, add LIMIT/OFFSET with cursor-based pagination. |
| Structured logging utility | Replace `console.log`/`console.error` with a logger that writes to file and supports log levels. |
| Persist dashboard filters in URL params | Currently filters reset on navigation. Store them in URL search params for bookmark-ability. |
| Soft-delete / undo for destructive operations | Add `deleted_at` column instead of hard DELETE. Show "Undo" toast after deletion. |
| Keyboard shortcuts | Navigate between pages, create entities, save forms without mouse. |

---

## Source Material Reference

This document was derived from analysis of the actual codebase:

| File | Lines | Purpose |
|---|---|---|
| `shared/types.ts` | 965 | All TypeScript type definitions (108 interfaces/types) |
| `electron/handlers.ts` | 4,736 | All 68 IPC handlers and business logic |
| `electron/database.ts` | 323 | Database initialization, query helpers, migrations |
| `electron/preload.ts` | 558 | API surface (107 methods, 19 namespaces) |
| `electron/scheduler.ts` | 253 | Wave-based date computation engine |
| `electron/engine/propagation.ts` | 288 | Project-to-supplier change propagation |
| `electron/migrations/` | 15 files | Schema evolution (001 through 015) |
| `src/` | ~57 files | React pages, components, and configuration |
| Config files | 8 files | Vite, TypeScript (x3), Tailwind, PostCSS, ESLint, electron-builder |