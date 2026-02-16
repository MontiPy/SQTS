import { useState } from 'react';
import { Plus, Trash2, Shield, ShieldOff } from 'lucide-react';
import {
  useApplicabilityRule,
  useApplicabilityClauses,
  useCreateApplicabilityRule,
  useUpdateApplicabilityRule,
  useDeleteApplicabilityRule,
  useCreateApplicabilityClause,
  useDeleteApplicabilityClause,
} from '@/hooks/use-applicability';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type { ApplicabilityComparator, ApplicabilitySubject } from '@shared/types';

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

const SUBJECT_OPTIONS: ApplicabilitySubject[] = ['SUPPLIER_NMR', 'PART_PA'];
const COMPARATOR_OPTIONS: ApplicabilityComparator[] = ['EQ', 'NEQ', 'IN', 'NOT_IN', 'GTE', 'LTE'];

const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm';

interface Props {
  templateId: number;
}

export default function ApplicabilityRuleBuilder({ templateId }: Props) {
  const { data: rule, isLoading: ruleLoading } = useApplicabilityRule(templateId);
  const { data: clauses, isLoading: clausesLoading } = useApplicabilityClauses(rule?.id);
  const { data: settings } = useSettings();
  const { success, error: showError } = useToast();

  const createRule = useCreateApplicabilityRule();
  const updateRule = useUpdateApplicabilityRule();
  const deleteRule = useDeleteApplicabilityRule();
  const createClause = useCreateApplicabilityClause();
  const deleteClause = useDeleteApplicabilityClause();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newSubject, setNewSubject] = useState<ApplicabilitySubject>('SUPPLIER_NMR');
  const [newComparator, setNewComparator] = useState<ApplicabilityComparator>('EQ');
  const [newSingleValue, setNewSingleValue] = useState('');
  const [newMultiValues, setNewMultiValues] = useState<string[]>([]);

  if (ruleLoading) {
    return <LoadingSpinner />;
  }

  const rankOptions =
    newSubject === 'SUPPLIER_NMR'
      ? settings?.nmrRanks ?? []
      : settings?.paRanks ?? [];

  const isMultiSelect = newComparator === 'IN' || newComparator === 'NOT_IN';

  function resetAddForm() {
    setShowAddForm(false);
    setNewSubject('SUPPLIER_NMR');
    setNewComparator('EQ');
    setNewSingleValue('');
    setNewMultiValues([]);
  }

  async function handleCreateRule() {
    try {
      await createRule.mutateAsync({
        activityTemplateId: templateId,
        operator: 'ALL',
        enabled: true,
      });
      success('Applicability rule created');
    } catch (err) {
      showError('Failed to create applicability rule');
    }
  }

  async function handleDeleteRule() {
    if (!rule) return;
    try {
      await deleteRule.mutateAsync({ id: rule.id, templateId });
      success('Applicability rule deleted');
    } catch (err) {
      showError('Failed to delete applicability rule');
    }
  }

  async function handleToggleEnabled() {
    if (!rule) return;
    try {
      await updateRule.mutateAsync({
        id: rule.id,
        params: { enabled: !rule.enabled },
      });
      success(rule.enabled ? 'Rule disabled' : 'Rule enabled');
    } catch (err) {
      showError('Failed to update rule');
    }
  }

  async function handleOperatorChange(operator: 'ALL' | 'ANY') {
    if (!rule) return;
    try {
      await updateRule.mutateAsync({
        id: rule.id,
        params: { operator },
      });
    } catch (err) {
      showError('Failed to update operator');
    }
  }

  async function handleAddClause() {
    if (!rule) return;
    const value = isMultiSelect ? newMultiValues.join(',') : newSingleValue;
    if (!value) {
      showError('Please select a value');
      return;
    }
    try {
      await createClause.mutateAsync({
        ruleId: rule.id,
        subjectType: newSubject,
        comparator: newComparator,
        value,
      });
      success('Condition added');
      resetAddForm();
    } catch (err) {
      showError('Failed to add condition');
    }
  }

  async function handleDeleteClause(clauseId: number) {
    if (!rule) return;
    try {
      await deleteClause.mutateAsync({ id: clauseId, ruleId: rule.id });
      success('Condition removed');
    } catch (err) {
      showError('Failed to remove condition');
    }
  }

  function toggleMultiValue(val: string) {
    setNewMultiValues((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  }

  // No rule state
  if (!rule) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Applicability Rules</CardTitle>
          <CardDescription>
            No applicability rule configured. This activity will be included for all suppliers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleCreateRule} disabled={createRule.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            Add Applicability Rule
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Rule exists state
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Applicability Rules</CardTitle>
            <CardDescription>
              {rule.enabled
                ? 'This activity is conditionally included based on the rules below.'
                : 'Rule is disabled. This activity will be included for all suppliers.'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleEnabled}
              disabled={updateRule.isPending}
            >
              {rule.enabled ? (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Enabled
                </>
              ) : (
                <>
                  <ShieldOff className="mr-2 h-4 w-4" />
                  Disabled
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteRule}
              disabled={deleteRule.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Operator selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Match</span>
          <select
            className={selectClass}
            value={rule.operator}
            onChange={(e) => handleOperatorChange(e.target.value as 'ALL' | 'ANY')}
          >
            <option value="ALL">ALL of the following</option>
            <option value="ANY">ANY of the following</option>
          </select>
        </div>

        {/* Clause list */}
        {clausesLoading ? (
          <LoadingSpinner />
        ) : clauses && clauses.length > 0 ? (
          <div className="space-y-2">
            {clauses.map((clause) => (
              <div
                key={clause.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">
                    {SUBJECT_LABELS[clause.subjectType] ?? clause.subjectType}
                  </span>
                  <span className="text-muted-foreground">
                    {COMPARATOR_LABELS[clause.comparator] ?? clause.comparator}
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                    {clause.value}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteClause(clause.id)}
                  disabled={deleteClause.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No conditions added yet.</p>
        )}

        {/* Add clause form */}
        {showAddForm ? (
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-end gap-3">
              {/* Subject */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Subject</label>
                <select
                  className={selectClass}
                  value={newSubject}
                  onChange={(e) => {
                    setNewSubject(e.target.value as ApplicabilitySubject);
                    setNewSingleValue('');
                    setNewMultiValues([]);
                  }}
                >
                  {SUBJECT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {SUBJECT_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Comparator */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Comparator</label>
                <select
                  className={selectClass}
                  value={newComparator}
                  onChange={(e) => {
                    setNewComparator(e.target.value as ApplicabilityComparator);
                    setNewSingleValue('');
                    setNewMultiValues([]);
                  }}
                >
                  {COMPARATOR_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {COMPARATOR_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Value */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Value</label>
                {isMultiSelect ? (
                  <div className="flex flex-wrap gap-2 rounded-md border p-2">
                    {rankOptions.length > 0 ? (
                      rankOptions.map((rank) => (
                        <label
                          key={rank}
                          className="flex items-center gap-1.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={newMultiValues.includes(rank)}
                            onChange={() => toggleMultiValue(rank)}
                            className="rounded border-input"
                          />
                          {rank}
                        </label>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No ranks configured
                      </span>
                    )}
                  </div>
                ) : (
                  <select
                    className={selectClass}
                    value={newSingleValue}
                    onChange={(e) => setNewSingleValue(e.target.value)}
                  >
                    <option value="">Select...</option>
                    {rankOptions.map((rank) => (
                      <option key={rank} value={rank}>
                        {rank}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleAddClause}
                disabled={createClause.isPending}
              >
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={resetAddForm}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Condition
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
