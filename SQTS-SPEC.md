# SQTS — Supplier Quality Tracking System

## Project Specification

**Purpose:** This document is the authoritative spec for building SQTS. It should be read alongside `APPROACH.md`, which contains the detailed architecture, database schema, code patterns, and implementation guidance. This spec defines *what* to build, *in what order*, and *why* — while APPROACH.md defines *how*.

**Current state:** Starting from an empty directory. There is no existing code. Build everything from scratch following this spec and the patterns in APPROACH.md.

---

## 1. What SQTS Is

SQTS is a **single-user, offline-first desktop application** for a supplier quality engineer managing **6-15 suppliers across 7+ concurrent projects** in an automotive/manufacturing environment. The engineer follows **OEM/company-standard activity templates** (PPAP, tool readiness, process validation, etc.) and needs to track each supplier's progress against project milestones.

The core problem SQTS solves: when project milestone dates shift (which happens frequently), hundreds of downstream schedule items across dozens of supplier-project combinations need to be recomputed. Doing this manually in Excel is error-prone and time-consuming. SQTS automates this through a scheduling engine, propagation system, and applicability rules.

### Core Workflow

```
1. Define activity templates (once, reuse everywhere)
   → "PPAP Submission" template with 8 milestones/tasks, each with anchor rules

2. Create a project with milestones
   → "Model Year 2027" with PA2 (Mar 15), PA3 (Jun 1), SOP (Sep 15)

3. Add activities from the template library to the project
   → Attach "PPAP Submission", "Tool Readiness", "Process Validation" to MY2027

4. Apply the project to suppliers
   → Apply MY2027 to Acme, Beta Corp, Gamma Industries
   → Each supplier gets their own instance with computed dates
   → Applicability rules auto-include/exclude activities based on supplier rank

5. Track progress per supplier
   → Mark items complete, record actual dates, override planned dates, lock items

6. When dates change, propagate
   → PA3 moves from Jun 1 to Jul 15
   → Click propagate → preview changes across all suppliers → apply
   → Locked/overridden/completed items are protected
```

### Scale

- 6-15 active suppliers
- 7+ concurrent projects
- ~15-25 schedule items per activity, ~3-6 activities per project
- Potentially 100+ supplier-project combinations
- Hundreds of individual schedule item instances to track

---

## 2. Technology Stack

Defined in APPROACH.md Section 2. Key decisions:

| Technology | Why |
|---|---|
| **Electron** | Desktop app, offline-first, native file dialogs |
| **React 18 + TypeScript** | Component UI with type safety |
| **Vite + vite-plugin-electron** | Fast dev server, handles main/renderer/preload builds |
| **sql.js (WASM)** | SQLite in memory, no native binary rebuild issues |
| **Tailwind CSS + Radix UI** | Utility CSS + accessible primitives |
| **date-fns** | Modular date arithmetic |
| **React Router DOM** | SPA routing within Electron |

### Required additions (implement as you encounter need):

| Addition | Why |
|---|---|
| **Vitest** | Unit tests for scheduler, applicability, and propagation engines |
| **Zod** | Runtime validation at IPC handler boundary |
| **TanStack Query** | Replace manual useState/useEffect data fetching with caching |

---

## 3. Architecture

Defined in APPROACH.md Section 3. The critical constraint:

```
Main Process (Node.js)     ←→  IPC Bridge (preload.ts)  ←→  Renderer (React)
  - Database (sql.js)              - contextBridge              - UI components
  - Business logic engines         - Typed API surface          - State management
  - File system access             - Promise<APIResponse<T>>    - No Node.js access
```

**Every IPC call returns `APIResponse<T>`** with `{ success, data?, error? }`. The renderer never touches the database or filesystem directly.

**Preload must output CommonJS** (`.cjs`). Electron's preload scripts do not support ES modules.

**Foreign keys must be enabled** on every database connection: `PRAGMA foreign_keys = ON`.

See APPROACH.md Sections 3-4 for full architecture and directory structure.

---

## 4. Database Schema

Defined in APPROACH.md Section 6. **~19 tables** in the initial migration, with Parts, Location Codes, and Project Templates added via later migrations as their phases are built. The schema should be implemented via numbered migration files (`001_initial_schema.sql`, etc.).

The complete schema, indexing strategy, naming conventions, and migration system are specified in APPROACH.md. Follow them exactly.

**Key schema changes from review:**
- `suppliers` table includes: `nmr_rank TEXT`, `contact_name TEXT`, `contact_email TEXT`, `contact_phone TEXT`
- `supplier_schedule_item_instances` includes: `notes TEXT` for per-item context
- `supplier_projects` has `UNIQUE(supplier_id, project_id)` constraint
- `activity_templates` includes `version INTEGER NOT NULL DEFAULT 1` (replaces separate versions table)
- Status enum everywhere: `'Not Started', 'In Progress', 'Under Review', 'Blocked', 'Complete', 'Not Required'`
- `project_activity_dependencies` and `project_schedule_item_dependencies` tables dropped (anchor_ref_id is sufficient)
- `settings` table with defaults included in initial migration (not deferred)

Key relationships to understand:

```
ActivityTemplate  ──creates──▸  ProjectActivity  ──instantiates──▸  SupplierActivityInstance
       │                              │                                      │
       ▼                              ▼                                      ▼
TemplateScheduleItem        ProjectScheduleItem              SupplierScheduleItemInstance
(default structure)         (anchored to project)            (per-supplier tracking)
```

**Templates** define the reusable structure. **Project items** wire them to specific project milestones. **Supplier instances** are the actual tracked items with dates, statuses, overrides, and locks.

---

## 5. Business Logic Engines

These four engines are the heart of SQTS. All are specified in detail in APPROACH.md Section 8. Implement them as **pure functions** where possible so they can be unit tested without database dependencies.

### 5.1 Scheduler Engine

Wave-based topological sort that computes planned dates for all schedule items in a project activity.

**Inputs:** Array of schedule items with anchor rules, milestone dates map, actual dates map, business days setting.

**Algorithm:** Iteratively resolve items whose dependencies are already resolved. FIXED_DATE and PROJECT_MILESTONE items resolve first (no dependencies), then items anchored to those, and so on until all items resolve or a circular dependency is detected.

**Four anchor types:**
- `FIXED_DATE` — hardcoded date
- `PROJECT_MILESTONE` — offset from a project milestone (PA2, PA3, SOP)
- `SCHEDULE_ITEM` — offset from another item's planned date
- `COMPLETION` — offset from another item's actual completion date

**Override precedence:** If an item has `overrideEnabled = true` and `overrideDate` set, return the override immediately regardless of anchor type.

**Business days:** When enabled, offset calculations skip Saturdays and Sundays.

**Circular dependency handling:** If a wave makes no progress (no new items resolved), mark remaining items with error and terminate.

**COMPLETION anchors with null actual dates:** When the anchor item has not been completed, the COMPLETION-anchored item cannot resolve. This is expected — it shows as "Pending — awaiting completion of [anchor item name]" in the UI. It is NOT a circular dependency error.

See APPROACH.md Section 8.1 for full implementation details and code.

### 5.2 Applicability Evaluator

Determines which activities should be included when applying a project to a supplier, based on the supplier's NMR rank and their parts' PA ranks.

**Rule structure:** Each activity template can have one rule with an operator (ALL or ANY) containing one or more clauses. Each clause checks SUPPLIER_NMR or PART_PA against a value using comparators: EQ, NEQ, IN, NOT_IN, GTE, LTE.

**Rank ordering:** GTE/LTE use the rank arrays from settings (e.g., `["A1","A2","B1","B2","C1"]`). Earlier entries = higher rank. A1 GTE B1 = true.

**Evaluation triggers:** When applying a project to a supplier, when NMR rank changes, when rules are modified, when PA ranks change.

See APPROACH.md Section 8.2 for full logic.

### 5.3 Propagation Engine

Two-phase (preview then apply) system for pushing project date changes to all supplier instances.

**Preview phase:** For each supplier-project, recalculate all dates using the scheduler, compare to current planned dates, check protection flags (locked, overridden, complete), classify each as willChange or wontChange with reasons.

**Apply phase:** Execute the updates for all willChange items in a single transaction.

**Supplier-selective propagation:** The PropagationPreviewModal groups changes by supplier with per-supplier checkboxes. Default all checked. Users can uncheck specific suppliers to exclude them from this propagation run.

**Protection policy (configurable in settings):**
- `skipComplete` — don't update items with status = 'Complete'
- `skipLocked` — don't update items with locked = true
- `skipOverridden` — don't update items with plannedDateOverride = true

See APPROACH.md Section 8.3 for full implementation.

### 5.4 Template Sync Engine

When activity template schedule items change, propagate structural changes to all project activities using that template, and optionally cascade to supplier instances.

**Version tracking:** Templates have version numbers. Project activities record which version they last synced to. Out-of-sync detection compares these.

**Sync operations:** Add new items, remove deleted items, update names, remap anchor references using an ID translation map.

**Cascade:** If auto-propagation settings are enabled, template changes flow: template → project activities → supplier instances.

See APPROACH.md Section 8.4 for full implementation.

---

## 6. Build Phases — Priority Order

**The user is currently tracking suppliers in Excel. The primary goal is to get off Excel as fast as possible.** Build phases are ordered by impact on the user's daily workflow, not by architectural elegance.

### Phase 1: Project Scaffolding + Database Layer

**Goal:** App launches from an empty directory, database works, navigation exists. This phase creates the entire project structure.

**Project initialization:**
- [ ] `npm init` and install all dependencies (see APPROACH.md Section 2 for exact versions)
- [ ] Create directory structure as specified in APPROACH.md Section 4
- [ ] Configure `vite.config.ts` with vite-plugin-electron for main process + preload
- [ ] Configure three tsconfig files:
  - `tsconfig.json` — React renderer (ES2020, strict, noEmit)
  - `tsconfig.electron.json` — Main process (ES2022, outDir: dist-electron)
  - `tsconfig.node.json` — Build tools (vite.config.ts only)
- [ ] Configure `tailwind.config.js` with CSS variable theming (HSL values in :root)
- [ ] Configure `postcss.config.js`
- [ ] Configure `eslint.config.js`
- [ ] Configure `electron-builder.json` for packaging (include sql.js WASM in extraResources)
- [ ] Create `src/index.css` with CSS variable definitions for theming (see APPROACH.md Section 9 for color variables)
- [ ] Add `package.json` scripts: `dev`, `build`, `preview`, `type-check`, `lint`, `verify`, `test`

**Electron main process:**
- [ ] `electron/main.ts` — App lifecycle, window creation (1280x800 default, 1024x600 min), dev/prod URL loading
- [ ] `app.requestSingleInstanceLock()` — prevent multiple instances accessing the same database file
- [ ] `mainWindow.webContents.on('did-fail-load')` — fallback to reload index.html for deep route failures in production
- [ ] `electron/preload.ts` — Empty contextBridge shell, outputs as CommonJS (.cjs)
- [ ] `electron/database.ts` — sql.js WASM initialization with multiple fallback paths for WASM file location
- [ ] Query helpers: `query<T>()`, `queryOne<T>()`, `run()` with automatic save
- [ ] Transaction support: `beginTransaction()`, `commitTransaction()`, `rollbackTransaction()`, `withTransaction()`
- [ ] **Atomic database writes:** `saveDatabase()` writes to temp file then renames (not direct writeFileSync). 100ms debounce + `saveDatabaseImmediately()` for app quit and after transactions.
- [ ] **`rollbackTransaction()` must NOT call `saveDatabase()`** — the in-memory state after ROLLBACK is correct
- [ ] `toCamelCase<T>()` / `toSnakeCase<T>()` recursive converters
- [ ] `autoBackup()` — copies database file to timestamped backup before destructive operations
- [ ] Migration runner — reads numbered .sql files from `electron/migrations/`, tracks applied migrations in `migrations` table, executes in order
- [ ] `electron/migrations/001_initial_schema.sql` — ~19 tables + ~19 indexes + settings defaults as specified in APPROACH.md Section 6
- [ ] `PRAGMA foreign_keys = ON` in `getDatabase()`

**Shared types:**
- [ ] `shared/types.ts` (or split into domain files under `shared/types/`) — all TypeScript interfaces as specified in APPROACH.md Section 5. Start with core entities, schedule types, instance types, API response types. Add feature-specific types as needed in later phases.

**React renderer shell:**
- [ ] `src/main.tsx` — React entry point with BrowserRouter
- [ ] `src/App.tsx` — Route definitions for all pages (placeholder components for pages not yet built)
- [ ] `src/components/Layout.tsx` — Two-column layout with **collapsible sidebar** (icon-only ~60px / full ~220px, preference stored in localStorage)
- [ ] `src/components/Sidebar.tsx` — Navigation with primary group (Dashboard, Suppliers, Projects, **Activity Templates**, Parts, Reports) and secondary group (Project Templates, Import/Export, Settings, Help)
- [ ] `src/components/ui/` — Install shadcn/ui primitives: Button, Card, Dialog, Input, Label, Textarea, Table, Select, Tabs, Switch, RadioGroup, Breadcrumb, **StatusBadge** (with paired icons for accessibility), **LoadingSpinner**, **EmptyState**, Toast/Toaster (see APPROACH.md Section 9 for component inventory and CVA variant patterns)
- [ ] `src/lib/utils.ts` — `cn()` class merge utility (clsx + tailwind-merge)
- [ ] `src/lib/format.ts` — Single `formatDate()` implementation used everywhere
- [ ] `src/hooks/use-toast.ts` — Toast notification hook
- [ ] `src/types/global.d.ts` — Window.sqts type declaration

**Handler infrastructure:**
- [ ] `electron/handlers/shared.ts` — `createSuccessResponse<T>()`, `createErrorResponse()`, `createAuditEvent()`
- [ ] `electron/handlers/index.ts` — `registerHandlers()` that imports and calls all domain handler registrations
- [ ] `shared/channels.ts` — IPC channel name constants (typed, used by both handlers and preload)

**Verify:** `npm run dev` launches the Electron app. Collapsible sidebar navigation renders. Database file is created in userData. App closes and restarts without data loss. `npm run verify` passes (type-check + lint).

### Phase 2: Core CRUD

**Goal:** Can create and manage the three core entities.

- [ ] Shared TypeScript types for Supplier, Project, ActivityTemplate (see APPROACH.md Section 5)
- [ ] Supplier CRUD handlers + list/detail pages (including nmr_rank, contact fields)
- [ ] Project CRUD handlers + list/detail pages with milestone management
- [ ] Activity Template CRUD handlers + **full-page** schedule item management (not dialog — 15-25 items with anchor rules need a full page with editable table and inline editing)
- [ ] Preload API surface for these domains
- [ ] Dialog-based create/edit/delete pattern for simple entities (see APPROACH.md Section 11). **Exception:** Activity template schedule items use full-page editing.
- [ ] Toast notifications for success/error feedback
- [ ] Search/filter on list pages
- [ ] **Empty states on all list pages** with icon + message + CTA button

**Verify:** Can create suppliers, projects with milestones, activity templates with schedule items. All persist across app restart.

### Phase 3: Schedule Item Anchoring + Date Computation

**Goal:** Dates compute automatically based on anchor rules.

- [ ] ProjectScheduleItem CRUD with all four anchor types (FIXED_DATE, SCHEDULE_ITEM, COMPLETION, PROJECT_MILESTONE)
- [ ] Scheduler engine implementation (iterative dependency resolution)
- [ ] ProjectConfigureDates page — UI for editing anchor types, offset days, fixed dates, milestone references
- [ ] Circular dependency validation (run before saving, show error in UI)
- [ ] Override date support (overrideEnabled + overrideDate)
- [ ] Business days toggle from settings

**Verify:** Create a chain of 5+ schedule items with mixed anchor types. Change a milestone date. All downstream dates recompute correctly. Business days skip weekends. Overrides take precedence. Circular dependencies show clear error.

### Phase 4: Apply Project to Supplier

**Goal:** Each supplier gets their own trackable instance of a project.

- [ ] "Apply Project" handler — creates SupplierProject + SupplierActivityInstances + SupplierScheduleItemInstances (wrapped in transaction)
- [ ] **Initial UI:** Show checklist of activities with checkboxes when applying (manual selection — no rule engine yet). Pre-check all by default.
- [ ] Compute initial planned dates via scheduler during apply
- [ ] SupplierProjectDetail page — shows activities as collapsible sections, each with schedule items
- [ ] **Summary stats on collapsed activity headers:** "PPAP Submission [3/8 Complete] [2 Overdue]"
- [ ] **Batch status update:** checkboxes on schedule item rows + "Mark Selected Complete" button with date picker
- [ ] **Overdue visual treatment:** amber/orange indicator overlay on items where planned_date < today AND status NOT IN (Complete, Not Required). Distinct from Blocked (red). Uses clock icon.
- [ ] Status updates on schedule items (Not Started → In Progress → Under Review → Complete)
- [ ] Actual date recording when status = Complete
- [ ] **Per-item notes** — editable text field on each supplier schedule item instance
- [ ] Per-item date override (plannedDateOverride flag)
- [ ] Per-item lock (prevents propagation from changing this item)
- [ ] Per-item scope override (REQUIRED / NOT_REQUIRED)
- [ ] Inline status dropdowns and date pickers directly in table rows (not requiring dialogs for individual field changes)
- [ ] Supplier detail page — shows all projects applied to this supplier with progress indicators
- [ ] **Basic overdue items list page** (simple query: planned_date < today AND status NOT IN Complete, Not Required)

**Verify:** Apply a project with 3 activities to a supplier. See all schedule items with computed dates. Mark items complete (including batch), override dates, lock items. Progress percentage updates correctly. Overdue items highlighted. Notes persist. Everything persists.

### Phase 5: Propagation Engine

**Goal:** Project date changes push to supplier instances with user control.

- [ ] Propagation policy settings (skipComplete, skipLocked, skipOverridden)
- [ ] `previewPropagation(projectId)` — returns willChange/wontChange with reasons
- [ ] `propagateChanges(projectId, supplierIds?)` — applies changes in transaction
- [ ] PropagationPreviewModal in UI — shows what will change and what's protected, with confirm/cancel
- [ ] **Supplier-selective propagation:** per-supplier checkboxes on PropagationPreviewModal (default all checked, user can uncheck specific suppliers)
- [ ] Trigger propagation prompt when project milestones are edited (confirmation dialog, not just toast)
- [ ] Propagation result summary (X updated, Y skipped, Z errors)
- [ ] Store propagation events in audit_events table with summary payload

**Verify:** Apply MY2027 to 3 suppliers. Lock one item on Supplier A, override a date on Supplier B, complete an item on Supplier C. Move PA3 by 2 weeks. Preview shows correct willChange/wontChange grouped by supplier. Uncheck Supplier B. Apply. Supplier B untouched. Locked/overridden/complete items untouched on A and C. Other items updated.

**THIS IS THE MVP.** At this point, the user can stop using Excel. Phases 1-5 give the user the complete create → track → propagate workflow. These phases must be solid before proceeding.

### Phase 6: Applicability Rules

**Goal:** Activities auto-include/exclude based on supplier rank when applying a project.

**Note:** The manual checkbox approach from Phase 4 remains the primary interface. This phase adds the automated rule engine as an enhancement.

- [ ] Applicability rule CRUD on activity templates (rule with operator + clauses)
- [ ] Applicability evaluator engine (ALL/ANY operators, 6 comparators, rank ordering)
- [ ] Applicability preview in "Apply Project" dialog — shows which activities will be included/excluded for this supplier based on their NMR rank, with checkboxes still available for manual override
- [ ] Re-evaluation triggers when NMR rank changes
- [ ] Settings page: configurable rank arrays (NMR ranks, PA ranks)

**Verify:** Create rule "Enhanced Inspection only for NMR rank B1 or worse." Apply project to A1 supplier — activity auto-unchecked. Apply to B2 supplier — activity auto-checked. Change supplier rank from A1 to B1 — activity flagged as newly applicable. User can still manually override any checkbox.

### Phase 7: Template Sync + Versioning

**Goal:** User can manually refresh project activities from updated templates.

**Simplified approach:** Manual "Refresh from Template" action only. No automatic cascade from template → projects → suppliers. When a template changes, the user explicitly clicks "Refresh from Template" on each project activity that uses it.

- [ ] Activity template version tracking (version column on activity_templates, bump on change)
- [ ] Out-of-sync detection (badge on project activities showing version mismatch)
- [ ] `syncFromTemplate` handler — two-pass insertion (create items, then wire anchors)
- [ ] Sync preserves project-level overrides on schedule items

**Verify:** Add a new task to the PPAP template. See out-of-sync indicator on projects using it. Sync. New task appears in project schedule items with correct anchoring. Propagate to suppliers. New task appears in supplier instances with computed dates.

### Phase 8: Dashboard + Reports

**Goal:** At-a-glance status across all suppliers and projects.

- [ ] Dashboard page with summary cards (overdue count, due-soon count, blocked count)
- [ ] Dashboard filters: date range, supplier, project, status
- [ ] Actionable items table (overdue + due soon, sorted by urgency)
- [ ] Reports page with tabs:
  - Overview (total counts, completion rates)
  - Supplier progress (per-supplier completion % across projects)
  - Project progress (per-project completion % across suppliers)
  - Overdue items (filterable list)
  - Due soon items (filterable list)
- [ ] CSV export for all report tables

**Verify:** With real data across multiple suppliers and projects, dashboard shows correct counts. Filters work. Reports export clean CSVs.

### Phase 9: Parts + Location Codes

**Goal:** Track specific parts per supplier-project with PA ranks.

- [ ] Supplier location codes CRUD (supplier number + location code per supplier)
- [ ] Parts CRUD (part number, description, PA rank, linked to supplier-project and location code)
- [ ] Parts list page with supplier-project selector
- [ ] PA rank integration with applicability evaluator

**Verify:** Add parts with PA ranks. Applicability rules using PART_PA comparators work correctly.

### Phase 10: Project Templates

**Goal:** Reusable project structures that can be stamped out quickly.

- [ ] Project template CRUD (name, description, milestones, activity references)
- [ ] "Apply Template to Project" with REPLACE_ALL and MERGE_ADD strategies
- [ ] Template management page

**Verify:** Create a template with 4 milestones and 5 activities. Apply to a new project. All milestones and activities created with correct structure.

### Phase 11: Import/Export

**Goal:** Data portability and backup.

- [ ] Export assembler — selective (specific entities) and full database export as JSON
- [ ] Import parser — read JSON, validate structure
- [ ] Import analyzer — match by name, detect new/updated/unchanged entities
- [ ] Import executor — apply changes with conflict resolution (wrapped in transaction)
- [ ] Import/export page with review step before applying import
- [ ] Database-level backup/restore/wipe in settings (with auto-backup before destructive ops)

**Verify:** Export data. Wipe database. Import. All data restored correctly. Export from one instance, import into another — entities merge by name.

### Phase 12: Settings + Polish

**Goal:** Configurable behavior and professional finish.

- [ ] Settings page: rank management, propagation toggles, date format, business days
- [ ] Help page with usage documentation
- [ ] Breadcrumb navigation on detail pages
- [ ] Empty states with friendly messages and CTAs
- [ ] Audit log viewing per entity (from audit_events table)
- [ ] Global error boundary (graceful error recovery, not white screen)
- [ ] Keyboard shortcut: Ctrl+Shift+I for DevTools

### Phase 13: Obsidian Sync (Future)

**Goal:** Export SQTS status data as markdown files into an Obsidian vault.

- [ ] Settings field: Obsidian vault path
- [ ] "Export to Obsidian" button in toolbar/settings
- [ ] Generates one markdown file per supplier (with frontmatter, milestones, overdue/in-progress/upcoming items, progress %)
- [ ] Generates a dashboard markdown file (aggregated status across all suppliers)
- [ ] Uses `[[Supplier Name]]` wiki-link syntax for Obsidian cross-referencing
- [ ] Files written to `{vault}/SQTS-Sync/` directory
- [ ] Read-only warning banner in generated files

This phase is deferred. Do not build until Phases 1-8 are complete and stable.

---

## 7. Quality Standards

### Code Quality

- **TypeScript strict mode** — no `any` types except at the sql.js boundary where row results need casting
- **All multi-step database operations wrapped in transactions** — use `withTransaction()` utility
- **Handler pattern:** try/catch → createSuccessResponse / createErrorResponse → audit event for mutations
- **Dynamic SQL update pattern** for all update handlers (build SET clause from provided fields only)
- **snake_case in database, camelCase in TypeScript** — convert at handler layer with `toCamelCase`/`toSnakeCase`
- **Dates as YYYY-MM-DD strings everywhere** — never pass Date objects across IPC

### Testing

- **Vitest for unit tests** on the three core engines (scheduler, applicability, propagation)
- **Test the scheduler** exhaustively: all 4 anchor types, business days, overrides, circular dependencies, multi-wave resolution
- **Test applicability** with all 6 comparators, ALL/ANY operators, rank ordering edge cases
- **Test propagation** protection policies: locked, overridden, complete items must be skipped correctly
- **Integration tests** using in-memory sql.js database for handler testing
- **Run `npm run verify`** (type-check + lint + test) before committing

### Performance

- **Debounce saveDatabase()** — 100ms delay, batch rapid writes. Call `saveDatabaseImmediately()` on app quit and after transactions.
- **Database indexes** — follow the indexing strategy in APPROACH.md Section 6 (23 indexes across 23 tables)
- **Composite indexes** for dashboard/report queries (see APPROACH.md Section 14)
- **TanStack Query** for frontend data caching — eliminate redundant IPC calls on page navigation

### Error Handling

- **Global React ErrorBoundary** wrapping routes — show friendly error message with "Try Again" button, not white screen
- **Structured error codes** in APIResponse: NOT_FOUND, VALIDATION, CONFLICT, CONSTRAINT, INTERNAL
- **Zod validation** at handler boundary — validate all params before touching the database
- **Toast notifications** for all user-facing errors with descriptive messages

---

## 8. UI/UX Guidelines

### Layout

Two-column layout: **collapsible** sidebar (navigation) + scrollable main content area. Sidebar has icon-only mode (~60px) and full mode (~220px). Toggle button at bottom of sidebar. Collapsed preference persisted in localStorage.

**Primary nav:** Dashboard, Suppliers, Projects, **Activity Templates**, Parts, Reports
**Secondary nav:** Project Templates, Import/Export, Settings, Help

### Interaction Patterns

- **Most create/edit operations use modal dialogs** — not separate pages. **Exceptions:** Activity template schedule item management uses a full-page editable table (15-25 items with anchor rules cannot fit in a modal). Import review uses a dedicated page tab.
- **List pages** have search input + create button in header, data table below
- **Detail pages** use tabs for different aspects (e.g., Supplier detail has Projects tab, Location Codes tab)
- **Breadcrumb navigation** on all detail pages
- **Toast notifications** for success/error after every mutation
- **Confirmation dialogs** for destructive operations (delete, wipe, propagation apply)
- **Empty states** with helpful message and CTA button when lists are empty (from Phase 2 onward, not deferred)
- **Loading states** — centered spinner on every page during async data fetching

### Styling

- **Tailwind CSS** with CSS variable theming (HSL values in :root)
- **shadcn/ui component convention** — Radix primitives + Tailwind + CVA variants
- **`cn()` utility** for class merging (clsx + tailwind-merge)
- **Status badges** with color AND icon for colorblind accessibility: Complete (green, checkmark), In Progress (blue, circle), Under Review (purple/indigo, eye), Blocked (red, triangle), Not Started (gray, dash), Not Required (muted, cross)
- **Overdue visual treatment:** amber/orange indicator overlay on items where planned_date < today AND status NOT IN (Complete, Not Required). Uses clock icon. Distinct from Blocked (red).
- **Consistent spacing** using Tailwind's spacing scale
- **No custom CSS unless absolutely necessary** — use Tailwind utilities

---

## 9. Key Technical Decisions

These decisions are already made. Do not revisit unless you encounter a fundamental blocker.

| Decision | Rationale |
|---|---|
| sql.js over better-sqlite3 | No native compilation, no Electron version mismatch, works on all platforms |
| Single SQLite file in userData | Simple, portable, backupable. Entire database in memory is fine for this scale. |
| BrowserRouter (not HashRouter) | Works in Electron with `base: './'` in Vite config. Current implementation is stable. |
| Preload as CommonJS (.cjs) | Electron requirement. Vite config handles the output format. |
| No server, no auth, no network | Single-user desktop tool. Complexity of auth/sync is not justified. |
| JSON for import/export | Human-readable, debuggable. Not trying to sync with other systems (yet). |

---

## 10. Known Pitfalls to Avoid

From APPROACH.md Section 12. Be aware of these during development:

1. **WASM file location** differs between dev (node_modules) and production (packaged). Use multiple fallback paths in `getDatabase()`. Ensure `electron-builder.json` includes the WASM file via `extraResources` or `files` configuration.

2. **Preload must be CommonJS** — Electron's preload scripts do not support ES modules. Configure Vite to output preload as `.cjs` format. If you accidentally output ESM, you'll get "Cannot use import statement outside a module."

3. **Foreign keys off by default** — SQLite does not enforce foreign keys unless you run `PRAGMA foreign_keys = ON` on every connection. Without it, `ON DELETE CASCADE` won't work and you can insert invalid references.

4. **Propagation cascades** — propagation can trigger COMPLETION-anchored items to need recalculation. Implement iterative propagation (re-run scheduler until no changes) rather than single pass.

5. **Transaction wrapping** — wrap ALL multi-step operations in transactions: apply project to supplier, sync from template, import execution, batch creates, template duplication. Without transactions, a failure partway through leaves the database inconsistent.

6. **BrowserRouter in Electron** — works with `base: './'` in Vite config. All navigation is client-side SPA routing. If you encounter issues in production builds, HashRouter is the fallback.

7. **Date handling** — all dates stored and transmitted as `YYYY-MM-DD` strings. When parsing for arithmetic, always use `new Date(dateString + 'T00:00:00')` (local time) to avoid timezone shifts. Never pass JavaScript Date objects across IPC.

8. **Duplicate code prevention** — define `formatDate()` once in `src/lib/format.ts`, IPC channel names once in `shared/channels.ts`, response helpers once in `electron/handlers/shared.ts`. Do not duplicate these across files.

9. **Atomic database writes** — always write to a `.tmp` file first, then `fs.renameSync()` over the real path. This prevents corruption if the app crashes mid-write. The `saveDatabase()` helper must implement this pattern.

10. **Single instance lock** — call `app.requestSingleInstanceLock()` before creating windows. If another instance is already running, `app.quit()` immediately. Without this, two instances writing to the same `.db` file will corrupt data.

11. **Vite plugin compatibility** — verify `vite-plugin-electron` works with the installed Vite version (5 or 6). If not, pin the compatible version. Mismatched versions cause silent build failures or missing preload output.

12. **COMPLETION anchors are not errors** — a schedule item anchored to COMPLETION with no completion date yet should resolve to `null`, not throw. The scheduler must treat null dates as "not yet calculable" and skip downstream dependents gracefully.

13. **BrowserRouter deep route fallback** — in production Electron builds, direct navigation to a deep route (e.g., `/projects/3`) may fail because there's no server to rewrite URLs. If BrowserRouter causes issues, fall back to HashRouter. Test deep routes in packaged builds early.

14. **Rollback must not save** — after `ROLLBACK`, do NOT call `saveDatabase()`. The in-memory database has already reverted; saving would write the reverted state, which is correct, but calling save in the rollback path creates a confusing pattern. Only save on successful `COMMIT`.

---

## 11. File Structure to Create

The project should be built with this structure (see APPROACH.md Section 4 for the complete tree):

```
supplier-tracking/
├── electron/                      # Main process code
│   ├── main.ts                    # App lifecycle, window creation
│   ├── database.ts                # sql.js init, query helpers, migrations
│   ├── preload.ts                 # contextBridge API surface (CJS output)
│   ├── scheduler.ts               # Date computation engine
│   ├── handlers/                  # Split by domain from the start
│   │   ├── index.ts               # registerHandlers() - imports all domain modules
│   │   ├── suppliers.ts
│   │   ├── projects.ts
│   │   ├── activities.ts
│   │   ├── supplier-instances.ts
│   │   ├── import-export.ts
│   │   ├── settings.ts
│   │   └── shared.ts              # Response helpers, audit helpers
│   ├── engine/
│   │   ├── propagation.ts
│   │   ├── applicability.ts
│   │   └── template-sync.ts
│   ├── import/
│   │   ├── parser.ts
│   │   ├── analyzer.ts
│   │   └── executor.ts
│   ├── export/
│   │   └── assembler.ts
│   └── migrations/
│       └── 001_initial_schema.sql
├── shared/                        # Shared between main and renderer
│   ├── types.ts                   # All TypeScript interfaces (or split into domain files)
│   └── channels.ts                # IPC channel name constants
├── src/                           # React renderer
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── Sidebar.tsx
│   │   └── ui/                    # shadcn/ui primitives
│   ├── hooks/
│   │   └── use-toast.ts
│   ├── lib/
│   │   ├── utils.ts               # cn() utility
│   │   └── format.ts              # Single formatDate implementation
│   ├── types/
│   │   └── global.d.ts            # Window.sqts type declaration
│   └── pages/                     # Feature pages (build as needed per phase)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.electron.json
├── tsconfig.node.json
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
├── electron-builder.json
├── APPROACH.md                    # Detailed technical reference
└── SQTS-SPEC.md                   # This spec
```

**Important:** Split handlers into domain modules from the start. Do not create a monolithic handlers.ts file. Each domain module exports a `registerXxxHandlers()` function called from `handlers/index.ts`.

---

## 12. Definition of Done

The system is complete when:

1. **A user can define activity templates** matching their OEM's standard checklist items, with schedule items that have anchor rules defining when each is due relative to project milestones or other items.

2. **A user can create projects** with milestones (PA2, PA3, SOP, etc.) and dates, add activities from the template library, and see all schedule item dates compute automatically.

3. **A user can apply a project to a supplier** and get a complete, independent set of schedule items with computed dates. Applicability rules correctly include/exclude activities based on supplier NMR rank.

4. **A user can track progress** per supplier — marking items complete, recording actual dates, overriding planned dates, locking items — without affecting other suppliers.

5. **When milestone dates change**, a user can propagate those changes to all supplier instances with a preview step, and locked/overridden/complete items are protected.

6. **When templates change**, a user can sync those changes to projects and supplier instances with version tracking.

7. **A dashboard** shows overdue items, due-soon items, and progress across all suppliers and projects at a glance.

8. **Reports** with CSV export provide supplier progress, project progress, and overdue/due-soon lists.

9. **All data persists** in a local SQLite file with auto-backup before destructive operations.

10. **The app is stable** — error boundaries prevent crashes, transactions prevent data corruption, and core engine logic has unit test coverage.
