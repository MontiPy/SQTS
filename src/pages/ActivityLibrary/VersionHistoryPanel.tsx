import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTemplateVersions, useRestoreTemplateVersion, useDeleteTemplateVersion } from '@/hooks/use-template-versions';
import { useToast } from '@/hooks/use-toast';
import type { TemplateVersion, TemplateSnapshot } from '@shared/types';

interface VersionHistoryPanelProps {
  templateId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function VersionHistoryPanel({ templateId, isOpen, onClose }: VersionHistoryPanelProps) {
  const { data: versions, isLoading } = useTemplateVersions(templateId);
  const restoreVersion = useRestoreTemplateVersion();
  const deleteVersion = useDeleteTemplateVersion();
  const { success, error: showError } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleRestore = async (version: TemplateVersion) => {
    try {
      await restoreVersion.mutateAsync({ id: version.id, templateId });
      success(`Restored "${version.name}"`);
      setConfirmRestoreId(null);
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to restore version');
    }
  };

  const handleDelete = async (version: TemplateVersion) => {
    if (!confirm(`Delete version "${version.name}"?`)) return;
    try {
      await deleteVersion.mutateAsync({ id: version.id, templateId });
      success('Version deleted');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete version');
    }
  };

  const parseSnapshot = (snapshotStr: string): TemplateSnapshot | null => {
    try {
      return JSON.parse(snapshotStr);
    } catch {
      return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
        <h2 className="text-xl font-bold mb-4">Version History</h2>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !versions || versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved versions yet. Use "Save Version" to create one.</p>
          ) : (
            <div className="space-y-3">
              {versions.map((version) => {
                const isExpanded = expandedId === version.id;
                const snapshot = isExpanded ? parseSnapshot(version.snapshot) : null;
                const isConfirming = confirmRestoreId === version.id;

                return (
                  <div key={version.id} className="border rounded-lg">
                    <div className="flex items-center gap-3 p-3">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : version.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{version.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Saved at version {version.versionNumber} &middot; {new Date(version.createdAt).toLocaleString()}
                        </div>
                        {version.description && (
                          <div className="text-sm text-muted-foreground mt-1">{version.description}</div>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {isConfirming ? (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRestore(version)}
                              disabled={restoreVersion.isPending}
                            >
                              {restoreVersion.isPending ? 'Restoring...' : 'Confirm'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmRestoreId(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setConfirmRestoreId(version.id)}>
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Restore
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(version)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {isExpanded && snapshot && (
                      <div className="border-t px-4 py-3 bg-muted/30">
                        <div className="text-sm mb-2">
                          <span className="font-medium">Template:</span> {snapshot.template.name}
                          {snapshot.template.category && <span className="text-muted-foreground"> ({snapshot.template.category})</span>}
                        </div>
                        {snapshot.template.description && (
                          <div className="text-sm text-muted-foreground mb-2">{snapshot.template.description}</div>
                        )}
                        <div className="text-sm font-medium mb-1">Schedule Items ({snapshot.scheduleItems.length}):</div>
                        {snapshot.scheduleItems.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No schedule items</div>
                        ) : (
                          <div className="space-y-1">
                            {snapshot.scheduleItems.map((item, idx) => (
                              <div key={idx} className="text-sm flex items-center gap-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  item.kind === 'MILESTONE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {item.kind}
                                </span>
                                <span>{item.name}</span>
                                <span className="text-muted-foreground">
                                  {item.anchorType === 'FIXED_DATE' && `Fixed: ${item.fixedDate || '--'}`}
                                  {item.anchorType === 'SCHEDULE_ITEM' && `Ref: item #${(item.anchorRefIndex ?? 0) + 1}`}
                                  {item.anchorType === 'PROJECT_MILESTONE' && `Milestone: ${item.anchorMilestoneName || '--'}`}
                                  {item.anchorType === 'COMPLETION' && 'On completion'}
                                  {item.offsetDays != null && item.offsetDays !== 0 && ` +${item.offsetDays}d`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
