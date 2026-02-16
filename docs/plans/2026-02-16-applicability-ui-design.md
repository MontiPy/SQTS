# Applicability UI & Wiring Design

## Summary

Wire up the existing applicability engine (backend complete: schema, handlers, engine, 31 tests) to the frontend. Three pieces: rule builder tab on activity template detail, enhanced apply-to-supplier dialog with auto-suggestions, and React hooks.

## Requirements

- Rule builder UI on activity template detail page (new "Applicability" tab)
- Support both SUPPLIER_NMR and PART_PA subject types
- ALL/ANY operator, 6 comparators (EQ, NEQ, IN, NOT_IN, GTE, LTE)
- Enhanced apply-to-supplier dialog: evaluate rules against selected supplier, pre-check matching activities
- User can override auto-suggestions (checkboxes remain editable)
- Visual indicators showing match/no-match/no-rule status per activity

## Existing Backend (Already Complete)

| Component | Status |
|-----------|--------|
| Database schema (2 tables) | Done |
| Engine (`electron/engine/applicability.ts`) | Done |
| IPC handlers (8 channels) | Done |
| Preload API (`applicabilityRules`, `applicabilityClauses`) | Done |
| Unit tests (31 passing) | Done |

## Piece 1: React Hooks (`src/hooks/use-applicability.ts`)

New hooks consuming existing preload API:

```typescript
// Rule CRUD
useApplicabilityRule(templateId: number)
useCreateApplicabilityRule()
useUpdateApplicabilityRule()
useDeleteApplicabilityRule()

// Clause CRUD
useApplicabilityClauses(ruleId: number)
useCreateApplicabilityClause()
useUpdateApplicabilityClause()
useDeleteApplicabilityClause()

// Evaluation
useEvaluateApplicability(projectId: number, supplierId: number)
```

Evaluation hook calls a new IPC handler that runs the engine server-side, returning `{ activityTemplateId: number; applicable: boolean }[]`.

## Piece 2: New Backend Handler for Evaluation

**Channel:** `supplier-instances:evaluate-applicability`

**Parameters:** `projectId: number, supplierId: number`

**Logic:**
1. Fetch all project activities for projectId
2. For each activity's template, fetch its applicability rule + clauses
3. Build context: supplier NMR rank (with project-level override), parts PA ranks
4. Run `evaluateApplicabilityRule()` per template
5. Return array of `{ projectActivityId, activityTemplateId, templateName, applicable }`

## Piece 3: Rule Builder Tab on Activity Template Detail

Add "Applicability" tab to `ActivityTemplateDetail.tsx`:

- **Rule toggle:** Enable/disable switch (disabled = always applicable)
- **Operator selector:** ALL / ANY radio buttons
- **Clause list:** Each clause row has:
  - Subject type: dropdown (`SUPPLIER_NMR` | `PART_PA`)
  - Comparator: dropdown (6 options, filtered by context)
  - Value: single-select for EQ/NEQ/GTE/LTE (from settings ranks), comma-separated tag input for IN/NOT_IN
- **Add clause** button, **delete** button per clause
- Rank values populated from settings (`nmrRanks` for SUPPLIER_NMR, `paRanks` for PART_PA)

## Piece 4: Enhanced Apply-to-Supplier Dialog

Modify `ApplyToSupplierDialog.tsx` step 2 (activity selection):

1. After supplier selected, call `evaluate-applicability` handler
2. Pre-check activities where `applicable === true` (instead of checking all)
3. Show badge per activity:
   - Green "Match" — rule exists and matches
   - Amber "No match" — rule exists but doesn't match
   - Gray "No rule" — no applicability rule configured
4. User can still toggle any checkbox manually
5. "Select Suggested" button to reset to auto-suggested state

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/use-applicability.ts` | **New** — React hooks for rules, clauses, evaluation |
| `electron/handlers/supplier-instances.ts` | Add `evaluate-applicability` handler |
| `src/pages/ActivityLibrary/ActivityTemplateDetail.tsx` | Add Applicability tab |
| `src/pages/ActivityLibrary/ApplicabilityRuleBuilder.tsx` | **New** — Rule builder component |
| `src/pages/Projects/ApplyToSupplierDialog.tsx` | Enhance with auto-suggestions |
| `src/hooks/use-settings.ts` | May need to export rank arrays for rule builder dropdowns |

No database migrations. No new routes.
