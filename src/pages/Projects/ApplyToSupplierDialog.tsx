import { useState, useEffect } from 'react';
import { Users, AlertCircle } from 'lucide-react';
import { useSuppliers } from '@/hooks/use-suppliers';
import { useProjectActivities } from '@/hooks/use-project-activities';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type { APIResponse } from '@shared/types';

interface ApplyToSupplierDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  projectName: string;
}

export default function ApplyToSupplierDialog({ isOpen, onClose, projectId, projectName }: ApplyToSupplierDialogProps) {
  const { success, error: showError } = useToast();
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers();
  const { data: projectActivities, isLoading: loadingActivities } = useProjectActivities(projectId);

  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedActivityIds, setSelectedActivityIds] = useState<number[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [step, setStep] = useState<'select-supplier' | 'select-activities'>('select-supplier');

  // Pre-check all activities when they load
  useEffect(() => {
    if (projectActivities) {
      setSelectedActivityIds(projectActivities.map(a => a.id));
    }
  }, [projectActivities]);

  const handleToggleActivity = (activityId: number) => {
    setSelectedActivityIds(prev =>
      prev.includes(activityId)
        ? prev.filter(id => id !== activityId)
        : [...prev, activityId]
    );
  };

  const handleSelectAll = () => {
    if (projectActivities) {
      setSelectedActivityIds(projectActivities.map(a => a.id));
    }
  };

  const handleSelectNone = () => {
    setSelectedActivityIds([]);
  };

  const handleApply = async () => {
    if (!selectedSupplierId) {
      showError('Please select a supplier');
      return;
    }
    if (selectedActivityIds.length === 0) {
      showError('Please select at least one activity');
      return;
    }

    setIsApplying(true);
    try {
      const response: APIResponse<{ supplierProject: unknown; activitiesCreated: number }> =
        await window.sqts.supplierInstances.applyProject({
          projectId,
          supplierId: selectedSupplierId,
          activityIds: selectedActivityIds,
        });

      if (!response.success) {
        throw new Error(response.error || 'Failed to apply project');
      }

      success(`Project applied to supplier with ${response.data?.activitiesCreated} activities`);
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to apply project to supplier');
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  const selectedSupplier = suppliers?.find(s => s.id === selectedSupplierId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold">Apply Project to Supplier</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Apply "{projectName}" to a supplier with selected activities
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'select-supplier' && (
            <div>
              <h3 className="text-sm font-medium mb-3">Select Supplier</h3>
              {loadingSuppliers ? (
                <LoadingSpinner />
              ) : !suppliers || suppliers.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 border rounded">
                  <AlertCircle className="w-4 h-4" />
                  No suppliers exist. Create a supplier first.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {suppliers.map(supplier => (
                    <button
                      key={supplier.id}
                      type="button"
                      className={`w-full text-left p-3 rounded border transition-colors ${
                        selectedSupplierId === supplier.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-accent/50'
                      }`}
                      onClick={() => setSelectedSupplierId(supplier.id)}
                    >
                      <div className="font-medium text-sm">{supplier.name}</div>
                      {supplier.nmrRank && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          NMR Rank: {supplier.nmrRank}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'select-activities' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">
                  Activities for {selectedSupplier?.name}
                </h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>All</Button>
                  <Button variant="ghost" size="sm" onClick={handleSelectNone}>None</Button>
                </div>
              </div>
              {loadingActivities ? (
                <LoadingSpinner />
              ) : !projectActivities || projectActivities.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 border rounded">
                  <AlertCircle className="w-4 h-4" />
                  No activities in this project. Add activities first.
                </div>
              ) : (
                <div className="space-y-2">
                  {projectActivities.map(activity => (
                    <label
                      key={activity.id}
                      className="flex items-center gap-3 p-3 rounded border cursor-pointer hover:bg-accent/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedActivityIds.includes(activity.id)}
                        onChange={() => handleToggleActivity(activity.id)}
                        className="w-4 h-4 rounded border-muted-foreground"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{activity.templateName}</div>
                        {activity.templateCategory && (
                          <div className="text-xs text-muted-foreground">{activity.templateCategory}</div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {activity.scheduleItemCount} schedule items
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <div className="mt-4 p-3 rounded bg-muted/50 text-sm">
                <p className="font-medium mb-1">Preview</p>
                <p className="text-muted-foreground">
                  {selectedActivityIds.length} of {projectActivities?.length || 0} activities selected.
                  This will create supplier schedule item instances with computed dates.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t flex justify-between">
          {step === 'select-activities' && (
            <Button variant="outline" onClick={() => setStep('select-supplier')}>
              Back
            </Button>
          )}
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {step === 'select-supplier' ? (
              <Button
                onClick={() => setStep('select-activities')}
                disabled={!selectedSupplierId}
              >
                <Users className="w-4 h-4 mr-2" />
                Next
              </Button>
            ) : (
              <Button
                onClick={handleApply}
                disabled={isApplying || selectedActivityIds.length === 0}
              >
                {isApplying ? 'Applying...' : 'Apply Project'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
