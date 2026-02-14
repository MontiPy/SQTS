# SQTS Feature Roadmap

## Completed

### Core Application (Phases 1-9)
- [x] Supplier CRUD with NMR ranks, contacts, location codes
- [x] Project CRUD with milestones and activity management
- [x] Activity template library with schedule items and anchoring
- [x] Template versioning (named save/restore)
- [x] Apply projects to suppliers with tracking grid
- [x] Schedule item status tracking (complete, locked, overridden, notes)
- [x] Batch status updates
- [x] Propagation engine (preview + selective apply)
- [x] Applicability rules (SUPPLIER_NMR, PART_PA)
- [x] Scheduling engine (wave-based topological sort, business days)
- [x] Parts and location codes management
- [x] Dashboard with metrics and overdue widget
- [x] Reports (overdue, due soon, supplier progress, project progress, CSV export)
- [x] Import/export (JSON) and database backup/wipe
- [x] Settings (ranks, propagation policies, date format, business days)
- [x] Help page with workflow overview

### Phase 10 — Project Templates
- [x] Project Templates page and detail view
- [x] Project Templates navigation in sidebar

### Recent Additions
- [x] **A3 — Mass Apply/Sync Templates**: Batch apply a template to multiple projects; batch sync updated templates across all projects
- [x] **A5 — Global Error Boundary**: Catches unhandled React errors with friendly fallback UI and reload
- [x] **A6 — Zod Validation**: Input validation on all IPC handlers via Zod schemas
- [x] **A7 — Database Save Debouncing**: 100ms debounce on disk writes with immediate save on quit
- [x] **B2 — Dark Mode**: System/light/dark theme picker in sidebar, persists to localStorage
- [x] **B4 — Breadcrumb Navigation**: Route-aware breadcrumbs with dynamic entity name resolution
- [x] **B6 — Supplier Detail Projects**: Shows assigned projects with activity counts and navigation
- [x] **Developer Tools**: Collapsible section in Settings for error boundary testing
- [x] **Milestone Categories**: Configurable categories in Settings for grouping milestones

### Milestone Date Grid
- [x] Backend handlers (`milestone-grid:get`, `milestone-grid:update`)
- [x] Preload + React hook (`useMilestoneGrid`, `useUpdateMilestoneDates`)
- [x] Spreadsheet-like grid component (rows = milestones grouped by category, columns = projects)
- [x] Tab system on Projects page (Projects / Milestone Dates)
- [x] Pending changes buffer with save button
- [x] `supplier_milestone_dates` table (per-supplier milestone date overrides)
- [x] Fill Row action (set one date across all suppliers for a milestone)

### Supplier Milestone Date Grid
- [x] Per-project supplier-specific milestone date overrides
- [x] Backend handlers (`supplier-milestone-grid:get`, `supplier-milestone-grid:update`, `supplier-milestone-grid:fill-row`)
- [x] Spreadsheet grid (rows = milestones, columns = suppliers) on project detail "Milestone Dates" tab
- [x] Pending changes buffer with Save/Discard

### A1. Audit Log Viewer
- [x] Collapsible section in Settings for viewing `audit_events`
- [x] Timestamped history of all data mutations
- [x] Filter by entity type, action, date range
- [x] Search by entity name
- [x] Pagination (50 events per page)
- [x] Expandable rows with full JSON details

### B1. Global Search / Command Palette (Ctrl+K)
- [x] Modal dialog triggered by Ctrl+K (Cmd+K on Mac)
- [x] Search across suppliers, projects, activity templates, project templates, parts
- [x] Fuzzy matching with ranked results (exact → starts-with → contains)
- [x] Keyboard navigation (arrow keys, Enter to select, Escape to close)
- [x] Navigate directly to the selected result

---

## Planned — Priority Order

### Wave 1 — High Value
Items that fill core workflow gaps or improve daily usability.

#### A2. File Attachments
- [ ] Backend handlers for upload/download/delete
- [ ] Preload methods + React hooks
- [ ] Attachment list on supplier activity instances
- [ ] File picker dialog, drag-and-drop support
- [ ] Store files on local filesystem with path references in DB
- **Why**: `supplier_activity_attachments` table exists — no handlers or UI yet

#### C6. Bulk Import from Excel/CSV
- [x] CSV export already exists in Reports (overdue, supplier progress, project progress)
- [ ] CSV/Excel **import** parser (suppliers, parts, milestones)
- [ ] Column mapping UI
- [ ] Preview before import with validation
- [ ] Error reporting per row
- **Why**: Most users have existing data in spreadsheets; export works, import is missing

#### C7. Print / PDF Export
- [ ] Print-friendly CSS for supplier-project detail, tracking grid, reports
- [ ] Export to PDF via Electron's `webContents.printToPDF()`
- [ ] Page header/footer with project name and date
- **Why**: Share status with stakeholders who don't have SQTS

### Wave 2 — Polish & Visualization
Items that improve the experience and add visual insight.

#### C1. Dashboard Charts & Visualizations
- [ ] Install recharts or chart.js
- [ ] Supplier progress bar chart (% complete per supplier)
- [ ] Overdue trend line (overdue count over time)
- [ ] Project timeline / Gantt-style view
- [ ] Add to Dashboard and/or Reports page
- **Why**: At-a-glance program health for management reviews

#### B3. Keyboard Shortcuts
- [x] Ctrl+K — command palette (implemented with B1)
- [x] Escape — close dialogs and command palette
- [x] Arrow keys — command palette navigation
- [ ] Ctrl+N — create new (context-aware: supplier, project, template)
- [ ] Ctrl+S — save current form/settings
- [ ] Shortcut help overlay (Ctrl+/)
- **Why**: Power-user efficiency

#### C4. Supplier Scorecard
- [ ] Per-supplier performance summary page/card
- [ ] Metrics: on-time %, total items tracked, average days late
- [ ] NMR rank history over time
- [ ] Comparison view across suppliers
- **Why**: Data-driven supplier performance conversations

#### C5. Activity History / Comments
- [ ] Per schedule-item comment thread with timestamps
- [ ] Status change history log (who changed what, when)
- [ ] Inline comment entry on supplier-project detail page
- [ ] DB table for comments/history
- **Why**: Context for why dates slipped or items were blocked

### Wave 3 — Advanced Features
Items that add significant capability but require more effort.

#### B5. Pagination for Large Datasets
- [x] Audit Log: full pagination with LIMIT/OFFSET and page controls
- [ ] Suppliers list, Projects list, Tracking grid, Reports
- [ ] Page size selector (25/50/100)
- **Why**: Prevents UI slowdown with hundreds of supplier-project combinations

#### C2. Calendar View for Schedule Items
- [ ] Monthly calendar component
- [ ] Planned/actual dates as colored dots
- [ ] Click date to see items due that day
- [ ] Filter by supplier/project
- **Why**: Timeline perspective the grid view doesn't provide

#### C3. Notification Center / Alerts
- [ ] Notification bell icon in sidebar or header
- [ ] Items due today, newly overdue, propagation results pending
- [ ] Mark as read/dismiss
- [ ] Badge count on bell icon
- **Why**: Proactive awareness without checking Reports

#### C8. Drag-and-Drop Reordering
- [ ] Schedule items within a template
- [ ] Milestones within a project
- [ ] Activities within a project
- [ ] Use @dnd-kit/core or similar library
- **Why**: More intuitive than manual sort order entry

#### C9. Undo / Redo
- [ ] Ctrl+Z / Ctrl+Y for recent actions
- [ ] Soft-delete backing for reversible deletes
- [ ] Action stack with configurable depth
- [ ] Visual undo toast ("Item deleted. Undo?")
- **Why**: Safety net for accidental changes

### Deferred
Items parked for future consideration.

#### A4. Obsidian Sync
- [ ] Export per-supplier markdown with YAML frontmatter
- [ ] Dashboard markdown with aggregated status
- [ ] Wiki-link syntax between notes
- [ ] Configurable vault path in Settings
- **Reason**: Niche use case — revisit based on demand

#### C10. Multi-Window Support
- [ ] Open detail pages in separate Electron windows
- [ ] Side-by-side supplier comparison
- [ ] Window state persistence
- **Reason**: Complex Electron work — revisit when core features are stable
