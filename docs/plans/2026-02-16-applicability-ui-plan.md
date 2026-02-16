# Applicability UI & Wiring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the existing applicability engine to the UI — rule builder on activity templates, auto-suggested activity selection when applying projects to suppliers.

**Architecture:** New React hooks consume existing IPC handlers for rule/clause CRUD. A new backend handler evaluates applicability for all project activities against a supplier. The ApplyToSupplierDialog pre-checks activities based on evaluation results. A new ApplicabilityRuleBuilder component is added as a tab on the activity template detail page.

**Tech Stack:** React 18, TanStack Query, Zod, shadcn/ui, Electron IPC, sql.js

---

### Task 1: Create React hooks for applicability rules and clauses

**Files:**
- Create: `src/hooks/use-applicability.ts`

**Step 1: Create the hooks file**

Create `src/hooks/use-applicability.ts` with rule and clause CRUD hooks. Follow the exact pattern from `src/hooks/use-activity-templates.ts`.

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityTemplateApplicabilityRule,
  ActivityTemplateApplicabilityClause,
  APIResponse,
} from '@shared/types';

// --- Rule hooks ---

export function useApplicabilityRule(templateId: number) {
  return useQuery<ActivityTemplateApplicabilityRule | null>({
    queryKey: ['applicability-rule', templateId],
    queryFn: async () => {
      const response: APIResponse<ActivityTemplateApplicabilityRule | null> =
        await window.sqts.applicabilityRules.get(templateId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch applicability rule');
      }
      return response.data ?? null;
    },
    enabled: !!templateId,
  });
}

export function useCreateApplicabilityRule() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplateApplicabilityRule, Error, { activityTemplateId: number; operator: 'ALL' | 'ANY'; enabled?: boolean }>({
    mutationFn: async (params) => {
      const response: APIResponse<ActivityTemplateApplicabilityRule> =
        await window.sqts.applicabilityRules.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create applicability rule');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-rule', data.activityTemplateId] });
    },
  });
}

export function useUpdateApplicabilityRule() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplateApplicabilityRule, Error, { id: number; templateId: number; operator?: 'ALL' | 'ANY'; enabled?: boolean }>({
    mutationFn: async ({ id, ...params }) => {
      const response: APIResponse<ActivityTemplateApplicabilityRule> =
        await window.sqts.applicabilityRules.update(id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update applicability rule');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-rule', variables.templateId] });
    },
  });
}

export function useDeleteApplicabilityRule() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: number; templateId: number }>({
    mutationFn: async ({ id }) => {
      const response: APIResponse<void> = await window.sqts.applicabilityRules.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete applicability rule');
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-rule', variables.templateId] });
      queryClient.invalidateQueries({ queryKey: ['applicability-clauses'] });
    },
  });
}

// --- Clause hooks ---

export function useApplicabilityClauses(ruleId: number | undefined) {
  return useQuery<ActivityTemplateApplicabilityClause[]>({
    queryKey: ['applicability-clauses', ruleId],
    queryFn: async () => {
      const response: APIResponse<ActivityTemplateApplicabilityClause[]> =
        await window.sqts.applicabilityClauses.list(ruleId!);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch applicability clauses');
      }
      return response.data;
    },
    enabled: !!ruleId,
  });
}

export function useCreateApplicabilityClause() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplateApplicabilityClause, Error, { ruleId: number; subjectType: 'SUPPLIER_NMR' | 'PART_PA'; comparator: string; value: string }>({
    mutationFn: async (params) => {
      const response: APIResponse<ActivityTemplateApplicabilityClause> =
        await window.sqts.applicabilityClauses.create(params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create clause');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-clauses', data.ruleId] });
    },
  });
}

export function useUpdateApplicabilityClause() {
  const queryClient = useQueryClient();

  return useMutation<ActivityTemplateApplicabilityClause, Error, { id: number; ruleId: number; subjectType?: 'SUPPLIER_NMR' | 'PART_PA'; comparator?: string; value?: string }>({
    mutationFn: async ({ id, ruleId, ...params }) => {
      const response: APIResponse<ActivityTemplateApplicabilityClause> =
        await window.sqts.applicabilityClauses.update(id, params);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to update clause');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-clauses', variables.ruleId] });
    },
  });
}

export function useDeleteApplicabilityClause() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: number; ruleId: number }>({
    mutationFn: async ({ id }) => {
      const response: APIResponse<void> = await window.sqts.applicabilityClauses.delete(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete clause');
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['applicability-clauses', variables.ruleId] });
    },
  });
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean (hooks consume existing preload API)

**Step 3: Commit**

```bash
git add src/hooks/use-applicability.ts
git commit -m "feat: add React hooks for applicability rules and clauses"
```

---

### Task 2: Add evaluate-applicability backend handler

**Files:**
- Modify: `electron/handlers/supplier-instances.ts` (add handler before closing `}` of `registerSupplierInstanceHandlers`)
- Modify: `electron/preload.ts` (add `evaluateApplicability` method to `supplierInstances` block)

**Step 1: Add the evaluate-applicability handler**

In `electron/handlers/supplier-instances.ts`, add before the closing `}` of `registerSupplierInstanceHandlers()`. This handler needs access to the applicability engine. Add the import at the top of the file:

```typescript
import { evaluateMultipleTemplates } from '../engine/applicability';
```

Then add the handler:

```typescript
  // Evaluate applicability rules for all project activities against a supplier
  ipcMain.handle('supplier-instances:evaluate-applicability', async (_, projectId: number, supplierId: number) => {
    try {
      // Get supplier info (NMR rank, with project-level override)
      const supplierProject = queryOne<{ supplierProjectNmrRank: string | null }>(
        'SELECT supplier_project_nmr_rank FROM supplier_projects WHERE project_id = ? AND supplier_id = ?',
        [projectId, supplierId]
      );
      const supplier = queryOne<{ nmrRank: string | null }>(
        'SELECT nmr_rank FROM suppliers WHERE id = ?',
        [supplierId]
      );
      const supplierNmrRank = supplierProject?.supplierProjectNmrRank || supplier?.nmrRank || null;

      // Get parts PA ranks for this supplier-project combo
      let partPaRanks: string[] = [];
      if (supplierProject) {
        const spId = queryOne<{ id: number }>(
          'SELECT id FROM supplier_projects WHERE project_id = ? AND supplier_id = ?',
          [projectId, supplierId]
        );
        if (spId) {
          const parts = query<{ paRank: string | null }>(
            'SELECT pa_rank FROM parts WHERE supplier_project_id = ?',
            [spId.id]
          );
          partPaRanks = parts.map(p => p.paRank).filter((r): r is string => r != null);
        }
      }

      const context = { supplierNmrRank, partPaRanks };

      // Get rank ordering from settings
      const nmrSetting = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['nmr_ranks']);
      const rankOrder: string[] = nmrSetting ? JSON.parse(nmrSetting.value) : [];

      // Get all project activities with their template applicability rules
      const projectActivities = query<{
        id: number;
        activityTemplateId: number;
        templateName: string;
      }>(
        `SELECT pa.id, pa.activity_template_id, at.name as template_name
         FROM project_activities pa
         JOIN activity_templates at ON pa.activity_template_id = at.id
         WHERE pa.project_id = ?`,
        [projectId]
      );

      // Fetch rules and clauses for each template
      const templates = projectActivities.map(pa => {
        const rule = queryOne<{ id: number; activityTemplateId: number; operator: string; enabled: number; createdAt: string }>(
          'SELECT * FROM activity_template_applicability_rules WHERE activity_template_id = ?',
          [pa.activityTemplateId]
        );
        let clauses: { id: number; ruleId: number; subjectType: string; comparator: string; value: string; createdAt: string }[] = [];
        if (rule) {
          clauses = query(
            'SELECT * FROM activity_template_applicability_clauses WHERE rule_id = ?',
            [rule.id]
          );
        }
        return {
          templateId: pa.activityTemplateId,
          rule: rule ? { ...rule, enabled: !!rule.enabled } as any : null,
          clauses: clauses as any[],
        };
      });

      const results = evaluateMultipleTemplates(templates, context, rankOrder);

      // Build response with project activity info
      const response = projectActivities.map(pa => ({
        projectActivityId: pa.id,
        activityTemplateId: pa.activityTemplateId,
        templateName: pa.templateName,
        applicable: results.get(pa.activityTemplateId) ?? true,
        hasRule: templates.find(t => t.templateId === pa.activityTemplateId)?.rule != null,
      }));

      return createSuccessResponse(response);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  });
```

**Step 2: Add preload method**

In `electron/preload.ts`, inside the `supplierInstances` block (after the `getSupplierGrid` line), add:

```typescript
    evaluateApplicability: (projectId: number, supplierId: number) => ipcRenderer.invoke('supplier-instances:evaluate-applicability', projectId, supplierId),
```

**Step 3: Add the evaluation hook to use-applicability.ts**

Append to `src/hooks/use-applicability.ts`:

```typescript
// --- Evaluation hook ---

export interface ApplicabilityResult {
  projectActivityId: number;
  activityTemplateId: number;
  templateName: string;
  applicable: boolean;
  hasRule: boolean;
}

export function useEvaluateApplicability(projectId: number, supplierId: number | null) {
  return useQuery<ApplicabilityResult[]>({
    queryKey: ['evaluate-applicability', projectId, supplierId],
    queryFn: async () => {
      const response: APIResponse<ApplicabilityResult[]> =
        await window.sqts.supplierInstances.evaluateApplicability(projectId, supplierId!);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to evaluate applicability');
      }
      return response.data;
    },
    enabled: !!projectId && !!supplierId,
  });
}
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add electron/handlers/supplier-instances.ts electron/preload.ts src/hooks/use-applicability.ts
git commit -m "feat: add evaluate-applicability handler, preload method, and hook"
```

---

### Task 3: Create ApplicabilityRuleBuilder component

**Files:**
- Create: `src/pages/ActivityLibrary/ApplicabilityRuleBuilder.tsx`

**Step 1: Create the rule builder component**

This component is shown inside the Applicability tab on the activity template detail page. It receives `templateId` as a prop.

```typescript
import { useState } from 'react';
import { Plus, Trash2, Shield, ShieldOff } from 'lucide-react';
import {
  useApplicabilityRule,
  useApplicabilityClauses,
  useCreateApplicabilityRule,
  useUpdateApplicabilityRule,
  useDeleteApplicabilityRule,
  useCreateApplicabilityClause,
  useUpdateApplicabilityClause,
  useDeleteApplicabilityClause,
} from '@/hooks/use-applicability';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type { ApplicabilityComparator, ApplicabilitySubject } from '@shared/types';

interface ApplicabilityRuleBuilderProps {
  templateId: number;
}

const SUBJECT_LABELS: Record<string, string> = {
  SUPPLIER_NMR: 'Supplier NMR Rank',
  PART_PA: 'Part PA Rank',
};

const COMPARATOR_LABELS: Record<string, string> = {
  EQ: 'equals',
  NEQ: 'does not equal',
  IN: 'is one of',
  NOT_IN: 'is not one of',
  GTE: 'is at or above',
  LTE: 'is at or below',
};

export default function ApplicabilityRuleBuilder({ templateId }: ApplicabilityRuleBuilderProps) {
  const { success, error: showError } = useToast();
  const { data: settings } = useSettings();
  const { data: rule, isLoading: ruleLoading } = useApplicabilityRule(templateId);
  const { data: clauses, isLoading: clausesLoading } = useApplicabilityClauses(rule?.id);

  const createRule = useCreateApplicabilityRule();
  const updateRule = useUpdateApplicabilityRule();
  const deleteRule = useDeleteApplicabilityRule();
  const createClause = useCreateApplicabilityClause();
  const updateClause = useUpdateApplicabilityClause();
  const deleteClause = useDeleteApplicabilityClause();

  const [addingClause, setAddingClause] = useState(false);
  const [newSubject, setNewSubject] = useState<ApplicabilitySubject>('SUPPLIER_NMR');
  const [newComparator, setNewComparator] = useState<ApplicabilityComparator>('EQ');
  const [newValue, setNewValue] = useState('');

  if (ruleLoading || clausesLoading) return <LoadingSpinner />;

  const nmrRanks = settings?.nmrRanks || [];
  const paRanks = settings?.paRanks || [];

  const getRankOptions = (subject: string) =>
    subject === 'SUPPLIER_NMR' ? nmrRanks : paRanks;

  const isListComparator = (comp: string) => comp === 'IN' || comp === 'NOT_IN';

  const handleCreateRule = async () => {
    try {
      await createRule.mutateAsync({ activityTemplateId: templateId, operator: 'ALL', enabled: true });
      success('Applicability rule created');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create rule');
    }
  };

  const handleToggleEnabled = async () => {
    if (!rule) return;
    try {
      await updateRule.mutateAsync({ id: rule.id, templateId, enabled: !rule.enabled });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update rule');
    }
  };

  const handleOperatorChange = async (operator: 'ALL' | 'ANY') => {
    if (!rule) return;
    try {
      await updateRule.mutateAsync({ id: rule.id, templateId, operator });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update operator');
    }
  };

  const handleDeleteRule = async () => {
    if (!rule) return;
    try {
      await deleteRule.mutateAsync({ id: rule.id, templateId });
      success('Applicability rule deleted');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const handleAddClause = async () => {
    if (!rule || !newValue.trim()) {
      showError('Please select a value');
      return;
    }
    try {
      await createClause.mutateAsync({
        ruleId: rule.id,
        subjectType: newSubject,
        comparator: newComparator,
        value: newValue.trim(),
      });
      success('Clause added');
      setAddingClause(false);
      setNewValue('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add clause');
    }
  };

  const handleDeleteClause = async (clauseId: number) => {
    if (!rule) return;
    try {
      await deleteClause.mutateAsync({ id: clauseId, ruleId: rule.id });
      success('Clause removed');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove clause');
    }
  };

  // No rule yet — show create button
  if (!rule) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Applicability Rules</CardTitle>
          <CardDescription>
            No applicability rule configured. This activity will be included for all suppliers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleCreateRule} disabled={createRule.isPending}>
            <Shield className="w-4 h-4 mr-2" />
            Add Applicability Rule
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Applicability Rules</CardTitle>
            <CardDescription>
              {rule.enabled
                ? 'This activity is only suggested for suppliers matching these conditions.'
                : 'Rule is disabled — activity will be suggested for all suppliers.'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={rule.enabled ? 'default' : 'outline'}
              size="sm"
              onClick={handleToggleEnabled}
            >
              {rule.enabled ? <Shield className="w-4 h-4 mr-1" /> : <ShieldOff className="w-4 h-4 mr-1" />}
              {rule.enabled ? 'Enabled' : 'Disabled'}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteRule}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Operator selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Match</span>
          <select
            value={rule.operator}
            onChange={(e) => handleOperatorChange(e.target.value as 'ALL' | 'ANY')}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">ALL of the following</option>
            <option value="ANY">ANY of the following</option>
          </select>
        </div>

        {/* Existing clauses */}
        {clauses && clauses.length > 0 ? (
          <div className="space-y-2">
            {clauses.map((clause) => (
              <div key={clause.id} className="flex items-center gap-2 p-3 border rounded-md bg-muted/30">
                <span className="text-sm font-medium">{SUBJECT_LABELS[clause.subjectType]}</span>
                <span className="text-sm text-muted-foreground">{COMPARATOR_LABELS[clause.comparator]}</span>
                <span className="text-sm font-mono bg-background px-2 py-0.5 rounded border">
                  {clause.value}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8"
                  onClick={() => handleDeleteClause(clause.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No conditions defined. Add a condition below.</p>
        )}

        {/* Add clause form */}
        {addingClause ? (
          <div className="p-4 border rounded-md space-y-3 bg-muted/10">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={newSubject}
                onChange={(e) => {
                  setNewSubject(e.target.value as ApplicabilitySubject);
                  setNewValue('');
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="SUPPLIER_NMR">Supplier NMR Rank</option>
                <option value="PART_PA">Part PA Rank</option>
              </select>

              <select
                value={newComparator}
                onChange={(e) => {
                  setNewComparator(e.target.value as ApplicabilityComparator);
                  setNewValue('');
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="EQ">equals</option>
                <option value="NEQ">does not equal</option>
                <option value="IN">is one of</option>
                <option value="NOT_IN">is not one of</option>
                <option value="GTE">is at or above</option>
                <option value="LTE">is at or below</option>
              </select>

              {isListComparator(newComparator) ? (
                /* Multi-select for IN/NOT_IN: checkboxes */
                <div className="flex flex-wrap gap-2">
                  {getRankOptions(newSubject).map((rank) => {
                    const selected = newValue.split(',').map(v => v.trim()).filter(Boolean);
                    const isSelected = selected.includes(rank);
                    return (
                      <label key={rank} className="flex items-center gap-1 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const updated = isSelected
                              ? selected.filter(v => v !== rank)
                              : [...selected, rank];
                            setNewValue(updated.join(','));
                          }}
                          className="h-4 w-4 rounded"
                        />
                        {rank}
                      </label>
                    );
                  })}
                </div>
              ) : (
                /* Single select for EQ/NEQ/GTE/LTE */
                <select
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">-- Select --</option>
                  {getRankOptions(newSubject).map((rank) => (
                    <option key={rank} value={rank}>{rank}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddClause} disabled={!newValue.trim()}>
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setAddingClause(false); setNewValue(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAddingClause(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Condition
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/pages/ActivityLibrary/ApplicabilityRuleBuilder.tsx
git commit -m "feat: add ApplicabilityRuleBuilder component"
```

---

### Task 4: Add Applicability tab to ActivityTemplateDetail

**Files:**
- Modify: `src/pages/ActivityLibrary/ActivityTemplateDetail.tsx`

**Step 1: Add the tab**

Add import at the top of `ActivityTemplateDetail.tsx`:

```typescript
import ApplicabilityRuleBuilder from './ApplicabilityRuleBuilder';
```

Add state for the active tab (after the existing state declarations near line 41):

```typescript
const [activeTab, setActiveTab] = useState<'schedule' | 'applicability'>('schedule');
```

Replace the single Schedule Items `<Card>` block (the `<Card>` starting around line 227 through line 569) with a tabbed layout:

```typescript
      {/* Tab bar */}
      <div className="flex border-b mb-4">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'schedule'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('schedule')}
        >
          Schedule Items
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'applicability'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('applicability')}
        >
          Applicability
        </button>
      </div>

      {activeTab === 'schedule' && (
        /* Existing Schedule Items Card — paste the original <Card> here unchanged */
      )}

      {activeTab === 'applicability' && (
        <ApplicabilityRuleBuilder templateId={templateId} />
      )}
```

The existing Schedule Items `<Card>` content should be placed inside the `activeTab === 'schedule'` conditional with no modifications.

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/pages/ActivityLibrary/ActivityTemplateDetail.tsx
git commit -m "feat: add Applicability tab to activity template detail"
```

---

### Task 5: Enhance ApplyToSupplierDialog with auto-suggestions

**Files:**
- Modify: `src/pages/Projects/ApplyToSupplierDialog.tsx`

**Step 1: Add applicability evaluation**

Add import at top:

```typescript
import { useEvaluateApplicability } from '@/hooks/use-applicability';
```

Inside the component, after the existing hooks, add:

```typescript
const { data: applicabilityResults } = useEvaluateApplicability(projectId, selectedSupplierId);
```

**Step 2: Replace the pre-check-all logic**

Replace the existing `useEffect` that pre-checks all activities (lines 29-34):

```typescript
  // Old: Pre-check all activities when they load
  // useEffect(() => {
  //   if (projectActivities) {
  //     setSelectedActivityIds(projectActivities.map(a => a.id));
  //   }
  // }, [projectActivities]);
```

With applicability-aware pre-checking:

```typescript
  // Pre-check activities based on applicability rules when supplier is selected
  useEffect(() => {
    if (projectActivities && applicabilityResults) {
      // Pre-check only activities whose rules match (or have no rule)
      const suggested = applicabilityResults
        .filter(r => r.applicable)
        .map(r => r.projectActivityId);
      setSelectedActivityIds(suggested);
    } else if (projectActivities) {
      // Fallback: check all if no evaluation results yet
      setSelectedActivityIds(projectActivities.map(a => a.id));
    }
  }, [projectActivities, applicabilityResults]);
```

**Step 3: Add visual indicators to activity list**

In the step 2 activity rendering (around line 161-184), update each activity label to show a badge. Replace the inner `<div className="flex-1">` content:

```typescript
<div className="flex-1">
  <div className="flex items-center gap-2">
    <span className="font-medium text-sm">{activity.templateName}</span>
    {applicabilityResults && (() => {
      const result = applicabilityResults.find(r => r.projectActivityId === activity.id);
      if (!result || !result.hasRule) {
        return <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">No rule</span>;
      }
      return result.applicable
        ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">Match</span>
        : <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">No match</span>;
    })()}
  </div>
  {activity.templateCategory && (
    <div className="text-xs text-muted-foreground">{activity.templateCategory}</div>
  )}
  <div className="text-xs text-muted-foreground">
    {activity.scheduleItemCount} schedule items
  </div>
</div>
```

**Step 4: Add "Select Suggested" button**

In the button bar next to "All" and "None" (line 148-149), add:

```typescript
<Button variant="ghost" size="sm" onClick={() => {
  if (applicabilityResults) {
    setSelectedActivityIds(applicabilityResults.filter(r => r.applicable).map(r => r.projectActivityId));
  }
}}>
  Suggested
</Button>
```

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 6: Commit**

```bash
git add src/pages/Projects/ApplyToSupplierDialog.tsx
git commit -m "feat: enhance apply-to-supplier dialog with applicability auto-suggestions"
```

---

### Task 6: Final verification

**Files:**
- All modified files

**Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All 86 tests pass (no test changes needed — existing applicability engine tests cover the logic)

**Step 3: Production build**

Run: `npx vite build`
Expected: Clean build

**Step 4: Commit any fixups**

If any issues found, fix and commit.
