import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid3X3,
  ChevronDown,
  ChevronRight,
  Clock,
  Lock,
  Pencil,
  CheckSquare,
  Square,
  ExternalLink,
} from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useActivityTemplates } from '@/hooks/use-activity-templates';
import {
  useSupplierGrid,
  useUpdateInstanceStatus,
  useBatchUpdateStatus,
} from '@/hooks/use-supplier-instances';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import type { ActivityStatus, SupplierScheduleItemInstance } from '@shared/types';

const STATUS_OPTIONS: ActivityStatus[] = [
  'Not Started',
  'In Progress',
  'Under Review',
  'Blocked',
  'Complete',
  'Not Required',
];

function isOverdue(instance: SupplierScheduleItemInstance): boolean {
  if (!instance.plannedDate) return false;
  if (instance.status === 'Complete' || instance.status === 'Not Required') return false;
  const today = new Date().toISOString().split('T')[0];
  return instance.plannedDate < today;
}

interface GridRow {
  supplierId: number;
  supplierName: string;
  supplierProjectId: number;
  projectActivityId: number;
  activityInstanceId: number;
  scheduleInstances: (SupplierScheduleItemInstance & { itemName?: string })[];
}

export default function TrackingGrid() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: templates } = useActivityTemplates();

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(undefined);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<number>>(new Set());
  const [selectedInstances, setSelectedInstances] = useState<Set<number>>(new Set());
  const [batchStatus, setBatchStatus] = useState<ActivityStatus>('Complete');
  const [batchDate, setBatchDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const { data: gridData, isLoading: gridLoading } = useSupplierGrid(
    selectedProjectId || 0,
    selectedActivityId
  );

  const updateStatus = useUpdateInstanceStatus();
  const batchUpdateStatus = useBatchUpdateStatus();

  // Group grid data by supplier
  const supplierGroups = useMemo(() => {
    if (!gridData || !Array.isArray(gridData)) return [];

    const groups = new Map<
      number,
      {
        supplierId: number;
        supplierName: string;
        supplierProjectId: number;
        activities: GridRow[];
      }
    >();

    for (const row of gridData as GridRow[]) {
      if (!groups.has(row.supplierId)) {
        groups.set(row.supplierId, {
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          supplierProjectId: row.supplierProjectId,
          activities: [],
        });
      }
      groups.get(row.supplierId)!.activities.push(row);
    }

    return Array.from(groups.values());
  }, [gridData]);

  // Compute stats per supplier
  function getSupplierStats(activities: GridRow[]) {
    let total = 0;
    let complete = 0;
    let overdue = 0;
    for (const activity of activities) {
      for (const inst of activity.scheduleInstances) {
        total++;
        if (inst.status === 'Complete') complete++;
        if (isOverdue(inst)) overdue++;
      }
    }
    return { total, complete, overdue };
  }

  function toggleSupplier(supplierId: number) {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(supplierId)) {
        next.delete(supplierId);
      } else {
        next.add(supplierId);
      }
      return next;
    });
  }

  function toggleInstance(id: number) {
    setSelectedInstances((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAllInstances(instances: SupplierScheduleItemInstance[]) {
    const ids = instances.map((i) => i.id);
    const allSelected = ids.every((id) => selectedInstances.has(id));
    setSelectedInstances((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleStatusChange(instanceId: number, newStatus: ActivityStatus) {
    try {
      const actualDate =
        newStatus === 'Complete' ? new Date().toISOString().split('T')[0] : null;
      await updateStatus.mutateAsync({
        instanceId,
        status: newStatus,
        completionDate: actualDate,
      });
      success('Status updated');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  async function handleBatchUpdate() {
    if (selectedInstances.size === 0) return;
    try {
      const completionDate = batchStatus === 'Complete' ? batchDate : null;
      await batchUpdateStatus.mutateAsync({
        instanceIds: Array.from(selectedInstances),
        status: batchStatus,
        completionDate,
      });
      success(`Updated ${selectedInstances.size} items`);
      setSelectedInstances(new Set());
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to batch update');
    }
  }

  if (projectsLoading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tracking Grid</h1>
      </div>

      {/* Project & Activity Selectors */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">Project</label>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={selectedProjectId ?? ''}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value) : null;
              setSelectedProjectId(val);
              setSelectedActivityId(undefined);
              setExpandedSuppliers(new Set());
              setSelectedInstances(new Set());
            }}
          >
            <option value="">Select a project...</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {selectedProjectId && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-muted-foreground">
              Activity Filter
            </label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedActivityId ?? ''}
              onChange={(e) => {
                setSelectedActivityId(
                  e.target.value ? parseInt(e.target.value) : undefined
                );
                setSelectedInstances(new Set());
              }}
            >
              <option value="">All Activities</option>
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Batch Action Bar */}
      {selectedInstances.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-md border">
          <span className="text-sm font-medium">
            {selectedInstances.size} selected
          </span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={batchStatus}
            onChange={(e) => setBatchStatus(e.target.value as ActivityStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {batchStatus === 'Complete' && (
            <input
              type="date"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={batchDate}
              onChange={(e) => setBatchDate(e.target.value)}
            />
          )}
          <Button
            size="sm"
            onClick={handleBatchUpdate}
            disabled={batchUpdateStatus.isPending}
          >
            <CheckSquare className="w-4 h-4 mr-1" />
            Apply to Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedInstances(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Grid Content */}
      {!selectedProjectId ? (
        <EmptyState
          icon={Grid3X3}
          message="Select a project to view tracking grid"
          description="Choose a project from the dropdown above to see all supplier schedule items."
        />
      ) : gridLoading ? (
        <LoadingSpinner />
      ) : supplierGroups.length === 0 ? (
        <EmptyState
          icon={Grid3X3}
          message="No suppliers assigned"
          description="Apply this project to suppliers first, then track their progress here."
        />
      ) : (
        <div className="space-y-3">
          {supplierGroups.map((group) => {
            const isExpanded = expandedSuppliers.has(group.supplierId);
            const stats = getSupplierStats(group.activities);
            const allInstances = group.activities.flatMap((a) => a.scheduleInstances);
            const allSelected =
              allInstances.length > 0 &&
              allInstances.every((i) => selectedInstances.has(i.id));

            return (
              <div key={group.supplierId} className="border rounded-lg overflow-hidden">
                {/* Supplier Header */}
                <div
                  className="flex items-center gap-3 p-3 bg-muted/50 cursor-pointer hover:bg-muted"
                  onClick={() => toggleSupplier(group.supplierId)}
                >
                  <button
                    className="p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAllInstances(allInstances);
                    }}
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}

                  <span className="font-semibold">{group.supplierName}</span>

                  <span className="text-sm text-muted-foreground ml-2">
                    {stats.complete}/{stats.total} Complete
                  </span>

                  {stats.overdue > 0 && (
                    <span className="inline-flex items-center gap-1 text-sm text-amber-600">
                      <Clock className="w-3.5 h-3.5" />
                      {stats.overdue} Overdue
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    {/* Progress bar */}
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{
                          width: stats.total > 0 ? `${(stats.complete / stats.total) * 100}%` : '0%',
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {stats.total > 0 ? Math.round((stats.complete / stats.total) * 100) : 0}%
                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(
                          `/supplier-projects/${group.supplierId}/${selectedProjectId}`
                        );
                      }}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Schedule Items */}
                {isExpanded && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Schedule Item</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Planned Date</TableHead>
                        <TableHead>Actual Date</TableHead>
                        <TableHead className="w-20">Flags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.activities.map((activity) =>
                        activity.scheduleInstances.map((inst) => {
                          const overdueItem = isOverdue(inst);
                          return (
                            <TableRow
                              key={inst.id}
                              className={overdueItem ? 'bg-amber-50' : undefined}
                            >
                              <TableCell>
                                <button
                                  onClick={() => toggleInstance(inst.id)}
                                  className="p-0.5"
                                >
                                  {selectedInstances.has(inst.id) ? (
                                    <CheckSquare className="w-4 h-4 text-primary" />
                                  ) : (
                                    <Square className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </button>
                              </TableCell>

                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {(inst as any).itemName || `Item #${inst.projectScheduleItemId}`}
                                  {overdueItem && (
                                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  )}
                                </div>
                              </TableCell>

                              <TableCell>
                                <select
                                  className="h-8 rounded border border-input bg-background px-2 text-xs"
                                  value={inst.status}
                                  onChange={(e) =>
                                    handleStatusChange(
                                      inst.id,
                                      e.target.value as ActivityStatus
                                    )
                                  }
                                >
                                  {STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </TableCell>

                              <TableCell>
                                <span
                                  className={
                                    overdueItem
                                      ? 'text-amber-600 font-medium'
                                      : undefined
                                  }
                                >
                                  {formatDate(inst.plannedDate)}
                                </span>
                                {inst.plannedDateOverride && (
                                  <Pencil className="inline w-3 h-3 ml-1 text-muted-foreground" />
                                )}
                              </TableCell>

                              <TableCell>{formatDate(inst.actualDate)}</TableCell>

                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {inst.locked && (
                                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                                  )}
                                  {inst.plannedDateOverride && (
                                    <Pencil className="w-3.5 h-3.5 text-blue-500" />
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
