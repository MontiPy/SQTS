import { useState, useMemo } from 'react';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useProjectTemplateStatus, useBatchApplyToProjects } from '@/hooks/use-template-batch';
import { useToast } from '@/hooks/use-toast';
import type { BatchApplyResult } from '@shared/types';

interface ApplyToProjectsDialogProps {
  templateId: number;
  templateName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ApplyToProjectsDialog({
  templateId,
  templateName,
  isOpen,
  onClose,
}: ApplyToProjectsDialogProps) {
  const { data: projectStatuses, isLoading } = useProjectTemplateStatus(templateId);
  const batchApply = useBatchApplyToProjects();
  const { success, error: showError } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<BatchApplyResult[] | null>(null);

  // Projects that don't already have this activity
  const availableProjects = useMemo(
    () => (projectStatuses || []).filter((p) => !p.hasActivity),
    [projectStatuses]
  );

  // Projects that already have this activity
  const existingProjects = useMemo(
    () => (projectStatuses || []).filter((p) => p.hasActivity),
    [projectStatuses]
  );

  if (!isOpen) return null;

  const handleToggle = (projectId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(availableProjects.map((p) => p.projectId)));
  };

  const handleClearAll = () => {
    setSelectedIds(new Set());
  };

  const handleApply = async () => {
    if (selectedIds.size === 0) return;

    try {
      const data = await batchApply.mutateAsync({
        activityTemplateId: templateId,
        projectIds: Array.from(selectedIds),
      });
      setResults(data);
      const successCount = data.filter((r) => r.success).length;
      if (successCount > 0) {
        success(`Applied template to ${successCount} project(s)`);
      }
      const failCount = data.filter((r) => !r.success).length;
      if (failCount > 0) {
        showError(`${failCount} project(s) failed`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to apply template');
    }
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    setResults(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
        <h2 className="text-xl font-bold mb-2">Apply to Projects</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Add &ldquo;{templateName}&rdquo; to selected projects.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : results ? (
          /* Results view */
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.projectId}>
                    <TableCell className="font-medium">{r.projectName}</TableCell>
                    <TableCell>
                      {r.success ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" /> Success
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircle className="w-4 h-4" /> Failed
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.error || '--'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : !projectStatuses || projectStatuses.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <AlertCircle className="w-5 h-5" />
            No projects exist yet. Create a project first.
          </div>
        ) : availableProjects.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <CheckCircle className="w-5 h-5" />
            This template has already been added to all projects.
          </div>
        ) : (
          /* Selection view */
          <div className="flex-1 overflow-auto">
            <div className="flex gap-2 mb-3">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Select All ({availableProjects.length})
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                Clear
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableProjects.map((p) => (
                  <TableRow
                    key={p.projectId}
                    className="cursor-pointer"
                    onClick={() => handleToggle(p.projectId)}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.projectId)}
                        onChange={() => handleToggle(p.projectId)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{p.projectName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Available</TableCell>
                  </TableRow>
                ))}
                {existingProjects.map((p) => (
                  <TableRow key={p.projectId} className="opacity-50">
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={true}
                        disabled
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{p.projectName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Already added</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            {results ? 'Close' : 'Cancel'}
          </Button>
          {!results && availableProjects.length > 0 && (
            <Button
              onClick={handleApply}
              disabled={selectedIds.size === 0 || batchApply.isPending}
            >
              {batchApply.isPending
                ? 'Applying...'
                : `Apply to ${selectedIds.size} project(s)`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
