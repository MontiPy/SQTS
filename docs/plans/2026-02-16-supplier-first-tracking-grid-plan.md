# Supplier-First Tracking Grid Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the project-first tracking grid with a supplier-first view where users select a supplier and see all their projects, activities, and schedule items.

**Architecture:** New IPC handler (`get-supplier-grid`) performs a single SQL join query keyed by supplierId, groups flat rows into Project -> Activity -> Instances hierarchy in JS. Frontend TrackingGrid.tsx is rewritten with supplier selector as primary, cascading project/activity filters, and two-level accordion (project, then activity).

**Tech Stack:** sql.js (backend query), Electron IPC, React + TanStack Query (frontend), Zod (validation), shadcn/ui (components)

---

### Task 1: Add types to shared/types.ts

**Files:**
- Modify: `shared/types.ts` (append after `SupplierMilestoneGridFillRowParams` near end of file)

**Step 1: Add the new types**

Add these interfaces to `shared/types.ts`:

```typescript
// --- Supplier Grid (supplier-first tracking) ---

export interface SupplierGridParams {
  supplierId: number;
  projectId?: number;
  activityId?: number;
}

export interface SupplierGridProject {
  projectId: number;
  projectName: string;
  supplierProjectId: number;
  activities: SupplierGridActivity[];
}

export interface SupplierGridActivity {
  activityInstanceId: number;
  projectActivityId: number;
  activityName: string;
  activityTemplateId: number;
  scheduleInstances: SupplierGridScheduleInstance[];
}

export interface SupplierGridScheduleInstance {
  id: number;
  supplierActivityInstanceId: number;
  projectScheduleItemId: number;
  plannedDate: string | null;
  actualDate: string | null;
  status: ActivityStatus;
  plannedDateOverride: boolean;
  scopeOverride: ScopeOverride;
  locked: boolean;
  notes: string | null;
  createdAt: string;
  itemName: string;
  kind: ScheduleItemKind;
  anchorType: AnchorType;
  anchorRefId: number | null;
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No new errors (types are just added, not consumed yet)

**Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add supplier-first grid types"
```

---

### Task 2: Add backend handler

**Files:**
- Modify: `electron/handlers/supplier-instances.ts` (add new handler before the closing `}` of `registerSupplierInstanceHandlers`, around line 659)

**Step 1: Add the get-supplier-grid handler**

Insert before the closing `}` of `registerSupplierInstanceHandlers()`:

```typescript
  // Get supplier-first grid: all projects/activities/instances for a supplier
  ipcMain.handle('supplier-instances:get-supplier-grid', async (_, supplierId: number, projectId?: number, activityId?: number) => {
    try {
      let sql = `
        SELECT sp.id as supplier_project_id, p.id as project_id, p.name as project_name,
               sai.id as activity_instance_id, sai.project_activity_id,
               at.name as activity_name, at.id as activity_template_id,
               ssii.id, ssii.supplier_activity_instance_id, ssii.project_schedule_item_id,
               ssii.planned_date, ssii.actual_date, ssii.status,
               ssii.planned_date_override, ssii.scope_override, ssii.locked, ssii.notes, ssii.created_at,
               psi.name as item_name, psi.kind, psi.anchor_type, psi.anchor_ref_id, psi.sort_order
        FROM supplier_projects sp
        JOIN projects p ON sp.project_id = p.id
        JOIN supplier_activity_instances sai ON sai.supplier_project_id = sp.id
        JOIN project_activities pa ON sai.project_activity_id = pa.id
        JOIN activity_templates at ON pa.activity_template_id = at.id
        JOIN supplier_schedule_item_instances ssii ON ssii.supplier_activity_instance_id = sai.id
        JOIN project_schedule_items psi ON ssii.project_schedule_item_id = psi.id
        WHERE sp.supplier_id = ?`;

      const params: any[] = [supplierId];

      if (projectId) {
        sql += ' AND sp.project_id = ?';
        params.push(projectId);
      }
      if (activityId) {
        sql += ' AND pa.activity_template_id = ?';
        params.push(activityId);
      }

      sql += ' ORDER BY p.name, at.name, psi.sort_order';

      const rows = query<{
        supplierProjectId: number;
        projectId: number;
        projectName: string;
        activityInstanceId: number;
        projectActivityId: number;
        activityName: string;
        activityTemplateId: number;
        id: number;
        supplierActivityInstanceId: number;
        projectScheduleItemId: number;
        plannedDate: string | null;
        actualDate: string | null;
        status: string;
        plannedDateOverride: number;
        scopeOverride: string | null;
        locked: number;
        notes: string | null;
        createdAt: string;
        itemName: string;
        kind: string;
        anchorType: string;
        anchorRefId: number | null;
        sortOrder: number;
      }>(sql, params);

      // Group flat rows into Project -> Activity -> Instances
      const projectMap = new Map<number, {
        projectId: number;
        projectName: string;
        supplierProjectId: number;
        activities: Map<number, {
          activityInstanceId: number;
          projectActivityId: number;
          activityName: string;
          activityTemplateId: number;
          scheduleInstances: any[];
        }>;
      }>();

      for (const row of rows) {
        if (!projectMap.has(row.projectId)) {
          projectMap.set(row.projectId, {
            projectId: row.projectId,
            projectName: row.projectName,
            supplierProjectId: row.supplierProjectId,
            activities: new Map(),
          });
        }
        const proj = projectMap.get(row.projectId)!;

        if (!proj.activities.has(row.activityInstanceId)) {
          proj.activities.set(row.activityInstanceId, {
            activityInstanceId: row.activityInstanceId,
            projectActivityId: row.projectActivityId,
            activityName: row.activityName,
            activityTemplateId: row.activityTemplateId,
            scheduleInstances: [],
          });
        }
        const act = proj.activities.get(row.activityInstanceId)!;

        act.scheduleInstances.push({
          id: row.id,
          supplierActivityInstanceId: row.supplierActivityInstanceId,
          projectScheduleItemId: row.projectScheduleItemId,
          plannedDate: row.plannedDate,
          actualDate: row.actualDate,
          status: row.status,
          plannedDateOverride: !!row.plannedDateOverride,
          scopeOverride: row.scopeOverride,
          locked: !!row.locked,
          notes: row.notes,
          createdAt: row.createdAt,
          itemName: row.itemName,
          kind: row.kind,
          anchorType: row.anchorType,
          anchorRefId: row.anchorRefId,
        });
      }

      const result = Array.from(projectMap.values()).map(proj => ({
        ...proj,
        activities: Array.from(proj.activities.values()),
      }));

      return createSuccessResponse(result);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add electron/handlers/supplier-instances.ts
git commit -m "feat: add get-supplier-grid IPC handler"
```

---

### Task 3: Wire up preload + hook

**Files:**
- Modify: `electron/preload.ts:127` (add `getSupplierGrid` method to `supplierInstances` block)
- Modify: `shared/types.ts` (import `SupplierGridParams` was already added in Task 1)
- Modify: `src/hooks/use-supplier-instances.ts` (add `useSupplierGridBySupplier` hook after existing `useSupplierGrid`)

**Step 1: Add preload method**

In `electron/preload.ts`, inside the `supplierInstances` block (after `getGrid` line ~127), add:

```typescript
    getSupplierGrid: (supplierId: number, projectId?: number, activityId?: number) => ipcRenderer.invoke('supplier-instances:get-supplier-grid', supplierId, projectId, activityId),
```

Also add `SupplierGridParams` to the type imports at top of preload.ts (though it's not directly used as a param type here since the method takes positional args).

**Step 2: Add React hook**

In `src/hooks/use-supplier-instances.ts`, after the existing `useSupplierGrid` function (line ~71), add:

```typescript
// Supplier-first grid: all projects/activities for a supplier
export function useSupplierGridBySupplier(supplierId: number, projectId?: number, activityId?: number) {
  return useQuery<SupplierGridProject[]>({
    queryKey: ['supplier-grid-by-supplier', supplierId, projectId, activityId],
    queryFn: async () => {
      const response: APIResponse<SupplierGridProject[]> = await window.sqts.supplierInstances.getSupplierGrid(supplierId, projectId, activityId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch supplier grid');
      }
      return response.data;
    },
    enabled: !!supplierId,
  });
}
```

Add `SupplierGridProject` to the type import at the top of the file.

**Step 3: Update mutation cache invalidation**

In `src/hooks/use-supplier-instances.ts`, in every `onSuccess` callback for the mutation hooks (`useUpdateInstanceStatus`, `useBatchUpdateStatus`, `useUpdateInstanceNotes`, `useToggleOverride`, `useToggleLock`), add:

```typescript
queryClient.invalidateQueries({ queryKey: ['supplier-grid-by-supplier'] });
```

alongside the existing `['supplier-grid']` invalidation.

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add electron/preload.ts src/hooks/use-supplier-instances.ts
git commit -m "feat: add supplier grid preload method and React hook"
```

---

### Task 4: Rewrite TrackingGrid.tsx

**Files:**
- Modify: `src/pages/SupplierProjects/TrackingGrid.tsx` (full rewrite)

**Step 1: Rewrite the component**

Replace the entire contents of `TrackingGrid.tsx`. The new version:

1. **Imports**: Replace `useProjects` with `useSuppliers`, replace `useSupplierGrid` with `useSupplierGridBySupplier`, add `useSupplierProjects` for cascading project filter, keep all mutation hooks and UI imports.

2. **State**: Replace `selectedProjectId` with `selectedSupplierId`. Add `selectedProjectId` as optional filter. Keep `selectedActivityId` as optional filter (only shown when project is selected). Add `expandedProjects` and `expandedActivities` sets for the two-level accordion. Keep all existing state for `expandedMilestones`, `selectedInstances`, batch operations, notes editing, override editing.

3. **Selectors bar**:
   - Supplier dropdown (required, lists all suppliers from `useSuppliers`)
   - Project dropdown (optional, shows only projects this supplier is assigned to via `useSupplierProjects(selectedSupplierId)`, hidden until supplier is selected)
   - Activity dropdown (optional, shows activity templates from the grid data for the selected project, hidden until project is selected)

4. **Grid rendering** (three-level accordion):
   - Level 1: Project rows with expand/collapse chevron, project name, aggregate stats (complete/total, overdue count, progress bar), link to `/supplier-projects/{supplierId}/{projectId}`
   - Level 2: Activity sub-headers with activity name and stats
   - Level 3: Milestone/Task rows using the existing `renderItemRow` and inline milestone rendering (same as current)

5. **All interactions** preserved exactly: status changes, batch updates, notes, lock, override, milestone child task expansion.

The full component code is large (~700 lines) — the implementer should follow the structure of the existing `TrackingGrid.tsx` but with the hierarchy flipped. Key structural changes:
- Outer loop: `gridData.map(project => ...)` instead of `supplierGroups.map(group => ...)`
- Inner loop: `project.activities.map(activity => ...)` with its own accordion
- Innermost: Same milestone grouping via `buildMilestoneGroups()` per activity's `scheduleInstances`

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Run dev server and manually verify**

Run: `npx vite` (or however dev is started)
Verify:
- Supplier dropdown populates with all suppliers
- Selecting a supplier loads project accordions
- Project filter narrows to one project
- Activity filter (when project selected) narrows further
- Expanding project shows activities, expanding activity shows milestones/tasks
- Status change, batch update, notes, lock, override all work
- Navigation link goes to correct supplier-project detail page

**Step 4: Commit**

```bash
git add src/pages/SupplierProjects/TrackingGrid.tsx
git commit -m "feat: rewrite tracking grid to supplier-first flow"
```

---

### Task 5: Final verification and cleanup

**Files:**
- All modified files

**Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All 86 tests pass (no test changes needed — existing tests are for engines, not UI)

**Step 3: Production build**

Run: `npx vite build`
Expected: Clean build with no errors

**Step 4: Commit any fixups**

If any issues found, fix and commit.
