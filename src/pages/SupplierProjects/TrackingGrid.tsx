import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid3X3,
  ChevronDown,
  ChevronRight,
  Clock,
  Lock,
  LockOpen,
  Pencil,
  CheckSquare,
  Square,
  ExternalLink,
  MessageSquare,
  ShieldOff,
} from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useActivityTemplates } from '@/hooks/use-activity-templates';
import {
  useSupplierGrid,
  useUpdateInstanceStatus,
  useBatchUpdateStatus,
  useUpdateInstanceNotes,
  useToggleOverride,
  useToggleLock,
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

interface ScheduleInstanceExt extends SupplierScheduleItemInstance {
  itemName: string;
  kind: 'MILESTONE' | 'TASK';
  anchorType: string;
  anchorRefId: number | null;
}

interface GridRow {
  supplierId: number;
  supplierName: string;
  supplierProjectId: number;
  projectActivityId: number;
  activityInstanceId: number;
  scheduleInstances: ScheduleInstanceExt[];
}

function buildMilestoneGroups(instances: ScheduleInstanceExt[]) {
  const milestones: ScheduleInstanceExt[] = [];
  const tasksByMilestone = new Map<number, ScheduleInstanceExt[]>();
  const ungrouped: ScheduleInstanceExt[] = [];

  for (const inst of instances) {
    if (inst.kind === 'MILESTONE') {
      milestones.push(inst);
      tasksByMilestone.set(inst.projectScheduleItemId, []);
    }
  }

  for (const inst of instances) {
    if (inst.kind === 'TASK') {
      if (inst.anchorType === 'SCHEDULE_ITEM' && inst.anchorRefId && tasksByMilestone.has(inst.anchorRefId)) {
        tasksByMilestone.get(inst.anchorRefId)!.push(inst);
      } else {
        ungrouped.push(inst);
      }
    }
  }

  return { milestones, tasksByMilestone, ungrouped };
}

export default function TrackingGrid() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: templates } = useActivityTemplates();

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(undefined);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<number>>(new Set());
  const [expandedMilestones, setExpandedMilestones] = useState<Set<number>>(new Set());
  const [selectedInstances, setSelectedInstances] = useState<Set<number>>(new Set());
  const [batchStatus, setBatchStatus] = useState<ActivityStatus>('Complete');
  const [batchDate, setBatchDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [notesText, setNotesText] = useState('');
  const [overrideDateId, setOverrideDateId] = useState<number | null>(null);
  const [overrideDateValue, setOverrideDateValue] = useState('');

  const { data: gridData, isLoading: gridLoading } = useSupplierGrid(
    selectedProjectId || 0,
    selectedActivityId
  );

  const updateStatus = useUpdateInstanceStatus();
  const batchUpdateStatus = useBatchUpdateStatus();
  const updateNotes = useUpdateInstanceNotes();
  const toggleOverride = useToggleOverride();
  const toggleLock = useToggleLock();

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
      groups.get(row.supplierId)!.activities.push({
        ...row,
        scheduleInstances: row.scheduleInstances.map((si: any) => ({
          ...si,
          itemName: si.itemName || `Item #${si.projectScheduleItemId}`,
          kind: si.kind || 'TASK',
          anchorType: si.anchorType || 'FIXED_DATE',
          anchorRefId: si.anchorRefId ?? null,
        })),
      });
    }

    return Array.from(groups.values());
  }, [gridData]);

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
      if (next.has(supplierId)) next.delete(supplierId);
      else next.add(supplierId);
      return next;
    });
  }

  function toggleMilestone(projectScheduleItemId: number) {
    setExpandedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(projectScheduleItemId)) next.delete(projectScheduleItemId);
      else next.add(projectScheduleItemId);
      return next;
    });
  }

  function toggleInstance(id: number) {
    setSelectedInstances((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllInstances(instances: SupplierScheduleItemInstance[]) {
    const ids = instances.map((i) => i.id);
    const allSelected = ids.every((id) => selectedInstances.has(id));
    setSelectedInstances((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
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

  async function handleSaveNotes(instanceId: number) {
    try {
      await updateNotes.mutateAsync({ instanceId, notes: notesText || null });
      setEditingNotesId(null);
      success('Notes saved');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save notes');
    }
  }

  async function handleToggleLock(instanceId: number, currentLocked: boolean) {
    try {
      await toggleLock.mutateAsync({ instanceId, locked: !currentLocked });
      success(currentLocked ? 'Item unlocked' : 'Item locked');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to toggle lock');
    }
  }

  async function handleToggleOverride(instanceId: number, currentEnabled: boolean) {
    if (currentEnabled) {
      try {
        await toggleOverride.mutateAsync({ instanceId, enabled: false });
        setOverrideDateId(null);
        success('Override removed');
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to remove override');
      }
    } else {
      setOverrideDateId(instanceId);
      setOverrideDateValue(new Date().toISOString().split('T')[0]);
    }
  }

  async function handleSaveOverride(instanceId: number) {
    try {
      await toggleOverride.mutateAsync({ instanceId, enabled: true, date: overrideDateValue });
      setOverrideDateId(null);
      success('Override date set');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to set override');
    }
  }

  function renderItemRow(inst: ScheduleInstanceExt, indent: boolean) {
    const overdueItem = isOverdue(inst);
    const isMilestone = inst.kind === 'MILESTONE';

    return (
      <TableRow
        key={inst.id}
        className={
          overdueItem ? 'bg-amber-50' : isMilestone ? 'bg-muted/40 border-t-2' : undefined
        }
      >
        <TableCell>
          <button onClick={() => toggleInstance(inst.id)} className="p-0.5">
            {selectedInstances.has(inst.id) ? (
              <CheckSquare className="w-4 h-4 text-primary" />
            ) : (
              <Square className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </TableCell>

        <TableCell>
          <div className={`flex items-center gap-2 ${indent ? 'pl-8' : ''}`}>
            {isMilestone && (
              <button
                onClick={() => toggleMilestone(inst.projectScheduleItemId)}
                className="p-0.5 hover:bg-muted rounded"
              >
                {expandedMilestones.has(inst.projectScheduleItemId) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            )}
            <span className={isMilestone ? 'font-semibold' : 'font-medium'}>
              {inst.itemName}
            </span>
            {isMilestone && (
              <span className="text-[10px] uppercase px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                Milestone
              </span>
            )}
            {overdueItem && <Clock className="w-3.5 h-3.5 text-amber-600" />}
            {!!inst.locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
            {!!inst.plannedDateOverride && <Pencil className="w-3.5 h-3.5 text-blue-500" />}
            {inst.scopeOverride === 'NOT_REQUIRED' && (
              <ShieldOff className="w-3.5 h-3.5 text-gray-400" />
            )}
          </div>
        </TableCell>

        <TableCell>
          <select
            className="h-8 rounded border border-input bg-background px-2 text-xs"
            value={inst.status}
            onChange={(e) => handleStatusChange(inst.id, e.target.value as ActivityStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </TableCell>

        <TableCell>
          {overrideDateId === inst.id ? (
            <div className="flex items-center gap-1">
              <input
                type="date"
                className="h-8 rounded border border-input bg-background px-2 text-xs"
                value={overrideDateValue}
                onChange={(e) => setOverrideDateValue(e.target.value)}
              />
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleSaveOverride(inst.id)}>Save</Button>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setOverrideDateId(null)}>Cancel</Button>
            </div>
          ) : (
            <span className={overdueItem ? 'text-amber-600 font-medium' : undefined}>
              {formatDate(inst.plannedDate)}
              {!!inst.plannedDateOverride && (
                <span className="text-xs text-blue-500 ml-1">(override)</span>
              )}
            </span>
          )}
        </TableCell>

        <TableCell>{formatDate(inst.actualDate)}</TableCell>

        <TableCell>
          {editingNotesId === inst.id ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                className="h-8 rounded border border-input bg-background px-2 text-xs flex-1"
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="Add notes..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveNotes(inst.id);
                  if (e.key === 'Escape') setEditingNotesId(null);
                }}
              />
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleSaveNotes(inst.id)}>Save</Button>
            </div>
          ) : (
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 max-w-[150px] truncate"
              onClick={() => { setEditingNotesId(inst.id); setNotesText(inst.notes || ''); }}
            >
              {inst.notes ? <span className="truncate">{inst.notes}</span> : <><MessageSquare className="w-3 h-3" />Add note</>}
            </button>
          )}
        </TableCell>

        <TableCell>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" title={inst.locked ? 'Unlock' : 'Lock'} onClick={() => handleToggleLock(inst.id, inst.locked)}>
              {inst.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title={inst.plannedDateOverride ? 'Remove date override' : 'Override date'} onClick={() => handleToggleOverride(inst.id, inst.plannedDateOverride)}>
              <Pencil className={`w-3.5 h-3.5 ${inst.plannedDateOverride ? 'text-blue-500' : ''}`} />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
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
              setExpandedMilestones(new Set());
              setSelectedInstances(new Set());
            }}
          >
            <option value="">Select a project...</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {selectedProjectId && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-muted-foreground">Activity Filter</label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedActivityId ?? ''}
              onChange={(e) => {
                setSelectedActivityId(e.target.value ? parseInt(e.target.value) : undefined);
                setSelectedInstances(new Set());
              }}
            >
              <option value="">All Activities</option>
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Batch Action Bar */}
      {selectedInstances.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-md border">
          <span className="text-sm font-medium">{selectedInstances.size} selected</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={batchStatus}
            onChange={(e) => setBatchStatus(e.target.value as ActivityStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
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
          <Button size="sm" onClick={handleBatchUpdate} disabled={batchUpdateStatus.isPending}>
            <CheckSquare className="w-4 h-4 mr-1" />
            Apply to Selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedInstances(new Set())}>
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
                        navigate(`/supplier-projects/${group.supplierId}/${selectedProjectId}`);
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
                        <TableHead>Item</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Planned Date</TableHead>
                        <TableHead>Actual Date</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const allItems = group.activities.flatMap((a) => a.scheduleInstances);
                        const { milestones, tasksByMilestone, ungrouped } = buildMilestoneGroups(allItems);
                        const rows: React.ReactNode[] = [];

                        for (const ms of milestones) {
                          const childTasks = tasksByMilestone.get(ms.projectScheduleItemId) || [];
                          const childComplete = childTasks.filter((t) => t.status === 'Complete').length;
                          const msExpanded = expandedMilestones.has(ms.projectScheduleItemId);

                          // Milestone header row — render inline with child count
                          rows.push(
                            <TableRow
                              key={ms.id}
                              className={isOverdue(ms) ? 'bg-amber-50' : 'bg-muted/40 border-t-2'}
                            >
                              <TableCell>
                                <button onClick={() => toggleInstance(ms.id)} className="p-0.5">
                                  {selectedInstances.has(ms.id) ? (
                                    <CheckSquare className="w-4 h-4 text-primary" />
                                  ) : (
                                    <Square className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </button>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => toggleMilestone(ms.projectScheduleItemId)}
                                    className="p-0.5 hover:bg-muted rounded"
                                  >
                                    {msExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  </button>
                                  <span className="font-semibold">{ms.itemName}</span>
                                  <span className="text-[10px] uppercase px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    Milestone
                                  </span>
                                  {childTasks.length > 0 && (
                                    <span className="text-xs text-muted-foreground">[{childComplete}/{childTasks.length}]</span>
                                  )}
                                  {isOverdue(ms) && <Clock className="w-3.5 h-3.5 text-amber-600" />}
                                  {!!ms.locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                                  {!!ms.plannedDateOverride && <Pencil className="w-3.5 h-3.5 text-blue-500" />}
                                </div>
                              </TableCell>
                              <TableCell>
                                <select
                                  className="h-8 rounded border border-input bg-background px-2 text-xs"
                                  value={ms.status}
                                  onChange={(e) => handleStatusChange(ms.id, e.target.value as ActivityStatus)}
                                >
                                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </TableCell>
                              <TableCell>
                                {overrideDateId === ms.id ? (
                                  <div className="flex items-center gap-1">
                                    <input type="date" className="h-8 rounded border border-input bg-background px-2 text-xs" value={overrideDateValue} onChange={(e) => setOverrideDateValue(e.target.value)} />
                                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleSaveOverride(ms.id)}>Save</Button>
                                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setOverrideDateId(null)}>Cancel</Button>
                                  </div>
                                ) : (
                                  <span className={isOverdue(ms) ? 'text-amber-600 font-medium' : undefined}>
                                    {formatDate(ms.plannedDate)}
                                    {!!ms.plannedDateOverride && <span className="text-xs text-blue-500 ml-1">(override)</span>}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>{formatDate(ms.actualDate)}</TableCell>
                              <TableCell>
                                {editingNotesId === ms.id ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="h-8 rounded border border-input bg-background px-2 text-xs flex-1" value={notesText} onChange={(e) => setNotesText(e.target.value)} placeholder="Add notes..." autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNotes(ms.id); if (e.key === 'Escape') setEditingNotesId(null); }} />
                                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleSaveNotes(ms.id)}>Save</Button>
                                  </div>
                                ) : (
                                  <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 max-w-[150px] truncate" onClick={() => { setEditingNotesId(ms.id); setNotesText(ms.notes || ''); }}>
                                    {ms.notes ? <span className="truncate">{ms.notes}</span> : <><MessageSquare className="w-3 h-3" />Add note</>}
                                  </button>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title={ms.locked ? 'Unlock' : 'Lock'} onClick={() => handleToggleLock(ms.id, ms.locked)}>
                                    {ms.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title={ms.plannedDateOverride ? 'Remove date override' : 'Override date'} onClick={() => handleToggleOverride(ms.id, ms.plannedDateOverride)}>
                                    <Pencil className={`w-3.5 h-3.5 ${ms.plannedDateOverride ? 'text-blue-500' : ''}`} />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );

                          // Child task rows
                          if (msExpanded) {
                            for (const task of childTasks) {
                              rows.push(renderItemRow(task, true));
                            }
                          }
                        }

                        // Ungrouped tasks
                        for (const task of ungrouped) {
                          rows.push(renderItemRow(task, false));
                        }

                        return rows;
                      })()}
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
