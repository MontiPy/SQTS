import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useTemplateOutOfSync, useBatchSync } from '@/hooks/use-template-batch';
import { useToast } from '@/hooks/use-toast';
import type { BatchSyncResult } from '@shared/types';

interface SyncAllProjectsDialogProps {
  templateId: number;
  templateName: string;
  templateVersion: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function SyncAllProjectsDialog({
  templateId,
  templateName,
  templateVersion,
  isOpen,
  onClose,
}: SyncAllProjectsDialogProps) {
  const { data: outOfSyncActivities, isLoading } = useTemplateOutOfSync(templateId);
  const batchSync = useBatchSync();
  const { success, error: showError } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<BatchSyncResult[] | null>(null);

  const activities = useMemo(() => outOfSyncActivities || [], [outOfSyncActivities]);

  // Pre-select all out-of-sync activities when data loads
  useEffect(() => {
    if (activities.length > 0 && selectedIds.size === 0 && !results) {
      setSelectedIds(new Set(activities.map((a) => a.projectActivityId)));
    }
  }, [activities, results]);

  if (!isOpen) return null;

  const handleToggle = (projectActivityId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectActivityId)) {
        next.delete(projectActivityId);
      } else {
        next.add(projectActivityId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(activities.map((a) => a.projectActivityId)));
  };

  const handleClearAll = () => {
    setSelectedIds(new Set());
  };

  const handleSync = async () => {
    if (selectedIds.size === 0) return;

    try {
      const data = await batchSync.mutateAsync({
        projectActivityIds: Array.from(selectedIds),
      });
      setResults(data);
      const successCount = data.filter((r) => r.success).length;
      if (successCount > 0) {
        success(`Synced ${successCount} project(s) to v${templateVersion}`);
      }
      const failCount = data.filter((r) => !r.success).length;
      if (failCount > 0) {
        showError(`${failCount} project(s) failed to sync`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to batch sync');
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
        <h2 className="text-xl font-bold mb-2">Sync All Projects</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Update all projects using &ldquo;{templateName}&rdquo; to version {templateVersion}.
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
                  <TableHead>Version</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.projectActivityId}>
                    <TableCell className="font-medium">{r.projectName}</TableCell>
                    <TableCell>
                      {r.success ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" /> Synced
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircle className="w-4 h-4" /> Failed
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.success ? `v${r.fromVersion} -> v${r.toVersion}` : '--'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.error || '--'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
            All projects are already in sync!
          </div>
        ) : (
          /* Selection view */
          <div className="flex-1 overflow-auto">
            <div className="flex gap-2 mb-3">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Select All ({activities.length})
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-2 mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {activities.length} project(s) are out of sync with the current template (v{templateVersion}).
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Current Version</TableHead>
                  <TableHead>Latest Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((a) => (
                  <TableRow
                    key={a.projectActivityId}
                    className="cursor-pointer"
                    onClick={() => handleToggle(a.projectActivityId)}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.projectActivityId)}
                        onChange={() => handleToggle(a.projectActivityId)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{a.projectName}</TableCell>
                    <TableCell className="text-sm">v{a.templateVersion}</TableCell>
                    <TableCell className="text-sm font-semibold">v{a.latestVersion}</TableCell>
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
          {!results && activities.length > 0 && (
            <Button
              onClick={handleSync}
              disabled={selectedIds.size === 0 || batchSync.isPending}
            >
              {batchSync.isPending
                ? 'Syncing...'
                : `Sync ${selectedIds.size} project(s)`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
