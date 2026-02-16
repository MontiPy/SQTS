# Supplier-First Tracking Grid Design

## Summary

Replace the current project-first tracking grid (`/tracking`) with a supplier-first view. The current flow (select project, see suppliers) is reversed to: select supplier, see all their projects with activities and schedule items.

## Requirements

- Primary selector: Supplier (required)
- Secondary filters: Project (optional), then Activity (optional, cascading from project)
- Grid hierarchy: Project -> Activity -> Milestones/Tasks (two-level nesting)
- All existing item-level interactions preserved (status, batch update, notes, lock, override)
- Replaces the current tracking grid (same route, no new pages)

## Approach

New backend endpoint optimized for the supplier axis. Frontend rewrite of TrackingGrid.tsx.

## Backend: New IPC Handler

**Channel**: `supplier-instances:get-supplier-grid`

**Parameters**: `supplierId: number`, `projectId?: number`, `activityId?: number`

**SQL** (single query, group in JS):

```sql
SELECT sp.id as supplier_project_id, p.id as project_id, p.name as project_name,
       sai.id as activity_instance_id, sai.project_activity_id, sai.status as activity_status,
       at.name as activity_name, at.id as activity_template_id,
       ssii.*, psi.name as item_name, psi.kind, psi.anchor_type, psi.anchor_ref_id, psi.sort_order
FROM supplier_projects sp
JOIN projects p ON sp.project_id = p.id
JOIN supplier_activity_instances sai ON sai.supplier_project_id = sp.id
JOIN project_activities pa ON sai.project_activity_id = pa.id
JOIN activity_templates at ON pa.activity_template_id = at.id
JOIN supplier_schedule_item_instances ssii ON ssii.supplier_activity_instance_id = sai.id
JOIN project_schedule_items psi ON ssii.project_schedule_item_id = psi.id
WHERE sp.supplier_id = ?
  [AND sp.project_id = ?]
  [AND pa.activity_template_id = ?]
ORDER BY p.name, at.name, psi.sort_order
```

**Response shape**:

```typescript
interface SupplierGridProject {
  projectId: number;
  projectName: string;
  supplierProjectId: number;
  activities: SupplierGridActivity[];
}

interface SupplierGridActivity {
  activityInstanceId: number;
  projectActivityId: number;
  activityName: string;
  activityTemplateId: number;
  scheduleInstances: ScheduleInstanceExt[];
}
```

Group flat SQL rows into Project -> Activity -> Instances hierarchy in JS.

## Frontend: Rewritten TrackingGrid.tsx

### Selectors (top bar)

1. **Supplier** dropdown (required) - lists all suppliers
2. **Project** dropdown (optional) - shows only projects this supplier is assigned to
3. **Activity** dropdown (optional) - shows only activities in selected project; hidden if no project selected

### Grid hierarchy

- **Level 1**: Project accordion rows - project name, aggregate stats (complete/total, overdue, progress bar), link to supplier-project detail
- **Level 2**: Activity sub-headers - activity template name, stats for that activity
- **Level 3**: Milestone/Task rows - checkbox, item name, status dropdown, planned date, actual date, notes, actions (lock, override)

Milestones can still expand to show child tasks (same as current).

### Batch operations

Same as current: select checkboxes across any items, batch update status bar appears.

## Files Changed

| File | Change |
|------|--------|
| `electron/handlers/supplier-instances.ts` | Add `get-supplier-grid` handler |
| `electron/preload.ts` | Add `getSupplierGrid` method |
| `shared/types.ts` | Add `SupplierGridParams` type + response types |
| `src/hooks/use-supplier-instances.ts` | Add `useSupplierGridBySupplier` hook |
| `src/pages/SupplierProjects/TrackingGrid.tsx` | Rewrite to supplier-first flow |

No new files, no route changes, no database migration needed.
