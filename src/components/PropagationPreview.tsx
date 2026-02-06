import { useState, useMemo } from 'react';
import { ArrowRight, Lock, Shield, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { usePropagationPreview, useApplyPropagation } from '@/hooks/use-propagation';
import { useToast } from '@/hooks/use-toast';
import type { PropagationChangeItem, PropagationSkipItem } from '@shared/types';

interface PropagationPreviewProps {
  projectId: number;
  onClose?: () => void;
  onApplied?: () => void;
}

// Group items by supplier
function groupBySupplier<T extends { supplierId: number; supplierName: string }>(items: T[]) {
  const groups = new Map<number, { supplierName: string; items: T[] }>();
  for (const item of items) {
    const existing = groups.get(item.supplierId);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(item.supplierId, { supplierName: item.supplierName, items: [item] });
    }
  }
  return groups;
}

function skipReasonIcon(reason: string) {
  if (reason.toLowerCase().includes('locked')) return <Lock className="h-3.5 w-3.5 text-orange-500" />;
  if (reason.toLowerCase().includes('overrid')) return <Shield className="h-3.5 w-3.5 text-blue-500" />;
  if (reason.toLowerCase().includes('complete')) return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

export default function PropagationPreview({ projectId, onClose, onApplied }: PropagationPreviewProps) {
  const { data: preview, isLoading, error } = usePropagationPreview(projectId);
  const applyMutation = useApplyPropagation();
  const { success, error: toastError } = useToast();

  // Track which suppliers are selected for propagation
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<number>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Initialize selection with all suppliers that have changes
  const changesBySupplier = useMemo(() => {
    if (!preview) return new Map<number, { supplierName: string; items: PropagationChangeItem[] }>();
    return groupBySupplier(preview.willChange);
  }, [preview]);

  const skipsBySupplier = useMemo(() => {
    if (!preview) return new Map<number, { supplierName: string; items: PropagationSkipItem[] }>();
    return groupBySupplier(preview.wontChange);
  }, [preview]);

  // Initialize selection once data loads
  if (preview && !initialized) {
    setSelectedSuppliers(new Set(changesBySupplier.keys()));
    setInitialized(true);
  }

  const selectedChangeCount = useMemo(() => {
    let count = 0;
    for (const [supplierId, group] of changesBySupplier) {
      if (selectedSuppliers.has(supplierId)) {
        count += group.items.length;
      }
    }
    return count;
  }, [changesBySupplier, selectedSuppliers]);

  const totalSkipCount = preview?.wontChange.length ?? 0;

  function toggleSupplier(supplierId: number) {
    setSelectedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(supplierId)) {
        next.delete(supplierId);
      } else {
        next.add(supplierId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedSuppliers(new Set(changesBySupplier.keys()));
  }

  function selectNone() {
    setSelectedSuppliers(new Set());
  }

  async function handleApply() {
    if (selectedSuppliers.size === 0) return;

    try {
      await applyMutation.mutateAsync({
        projectId,
        supplierIds: Array.from(selectedSuppliers),
      });
      success(`Propagation applied: ${selectedChangeCount} items updated`);
      onApplied?.();
    } catch (err: any) {
      toastError(err.message || 'Failed to apply propagation');
    }
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-destructive">Error loading preview: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!preview || (preview.willChange.length === 0 && preview.wontChange.length === 0)) {
    return (
      <EmptyState
        icon={CheckCircle2}
        message="No propagation needed"
        description="All supplier schedule items are already in sync with the project schedule."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
        <div className="flex items-center gap-4 text-sm">
          <span>
            <span className="font-semibold">{selectedChangeCount}</span> items will update
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">
            <span className="font-semibold">{totalSkipCount}</span> items will be skipped
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={selectNone}>
            Select None
          </Button>
        </div>
      </div>

      {/* Changes grouped by supplier */}
      {changesBySupplier.size > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Will Change
          </h3>
          {Array.from(changesBySupplier.entries()).map(([supplierId, group]) => (
            <Card key={supplierId}>
              <CardHeader className="flex flex-row items-center space-y-0 pb-3 pt-4 px-4">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={selectedSuppliers.has(supplierId)}
                    onChange={() => toggleSupplier(supplierId)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <CardTitle className="text-base">{group.supplierName}</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    ({group.items.length} item{group.items.length !== 1 ? 's' : ''})
                  </span>
                </label>
              </CardHeader>
              {selectedSuppliers.has(supplierId) && (
                <CardContent className="px-4 pb-4 pt-0">
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <div
                        key={item.instanceId}
                        className="flex items-center gap-2 text-sm rounded px-2 py-1 bg-muted/50"
                      >
                        <span className="font-medium flex-1 min-w-0 truncate">{item.itemName}</span>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {item.currentDate ?? 'No date'}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium whitespace-nowrap">{item.newDate ?? 'No date'}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Skipped items grouped by supplier */}
      {skipsBySupplier.size > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Will Skip
          </h3>
          {Array.from(skipsBySupplier.entries()).map(([supplierId, group]) => (
            <Card key={supplierId} className="opacity-60">
              <CardHeader className="flex flex-row items-center space-y-0 pb-3 pt-4 px-4">
                <CardTitle className="text-base">{group.supplierName}</CardTitle>
                <span className="text-xs text-muted-foreground ml-2">
                  ({group.items.length} skipped)
                </span>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <div
                      key={item.instanceId}
                      className="flex items-center gap-2 text-sm rounded px-2 py-1 bg-muted/30"
                    >
                      {skipReasonIcon(item.reason)}
                      <span className="flex-1 min-w-0 truncate">{item.itemName}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {item.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleApply}
          disabled={selectedChangeCount === 0 || applyMutation.isPending}
        >
          {applyMutation.isPending ? 'Applying...' : `Apply Changes (${selectedChangeCount})`}
        </Button>
      </div>
    </div>
  );
}
