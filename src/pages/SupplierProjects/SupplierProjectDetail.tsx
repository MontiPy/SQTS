import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Lock,
  LockOpen,
  Pencil,
  CheckSquare,
  Square,
  MessageSquare,
  ShieldOff,
} from 'lucide-react';
import {
  useSupplierProject,
  useUpdateInstanceStatus,
  useBatchUpdateStatus,
  useUpdateInstanceNotes,
  useToggleOverride,
  useToggleLock,
} from '@/hooks/use-supplier-instances';
import { useSupplier } from '@/hooks/use-suppliers';
import { useProject } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import type {
  ActivityStatus,
  SupplierScheduleItemInstance,
} from '@shared/types';

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

interface ScheduleInstanceWithName extends SupplierScheduleItemInstance {
  itemName: string;
  kind: 'MILESTONE' | 'TASK';
  anchorType: string;
  anchorRefId: number | null;
}

interface ActivityGroup {
  id: number;
  projectActivityId: number;
  activityName: string;
  status: ActivityStatus;
  scheduleInstances: ScheduleInstanceWithName[];
}

export default function SupplierProjectDetail() {
  const { supplierId: supplierIdParam, projectId: projectIdParam } = useParams<{
    supplierId: string;
    projectId: string;
  }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const supplierId = parseInt(supplierIdParam || '0');
  const projectId = parseInt(projectIdParam || '0');

  const { data: detailData, isLoading } = useSupplierProject(supplierId, projectId);
  const { data: supplier } = useSupplier(supplierId);
  const { data: project } = useProject(projectId);

  const updateStatus = useUpdateInstanceStatus();
  const batchUpdate = useBatchUpdateStatus();
  const updateNotes = useUpdateInstanceNotes();
  const toggleOverride = useToggleOverride();
  const toggleLock = useToggleLock();

  const [expandedActivities, setExpandedActivities] = useState<Set<number>>(
    new Set()
  );
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

  // Parse the detail response
  const activities: ActivityGroup[] = useMemo(() => {
    if (!detailData) return [];
    const data = detailData as any;
    if (!data.activities) return [];
    return data.activities.map((a: any) => ({
      id: a.id,
      projectActivityId: a.projectActivityId,
      activityName: a.activityName,
      status: a.status,
      scheduleInstances: (a.scheduleInstances || []).map((si: any) => ({
        ...si,
        itemName: si.itemName || `Item #${si.projectScheduleItemId}`,
        kind: si.kind || 'TASK',
        anchorType: si.anchorType || 'FIXED_DATE',
        anchorRefId: si.anchorRefId ?? null,
      })),
    }));
  }, [detailData]);

  // Summary stats
  const summaryStats = useMemo(() => {
    let total = 0;
    let complete = 0;
    let overdue = 0;
    let blocked = 0;
    for (const activity of activities) {
      for (const inst of activity.scheduleInstances) {
        total++;
        if (inst.status === 'Complete') complete++;
        if (inst.status === 'Blocked') blocked++;
        if (isOverdue(inst)) overdue++;
      }
    }
    return { total, complete, overdue, blocked };
  }, [activities]);

  function toggleActivity(activityId: number) {
    setExpandedActivities((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) {
        next.delete(activityId);
      } else {
        next.add(activityId);
      }
      return next;
    });
  }

  function toggleMilestone(projectScheduleItemId: number) {
    setExpandedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(projectScheduleItemId)) {
        next.delete(projectScheduleItemId);
      } else {
        next.add(projectScheduleItemId);
      }
      return next;
    });
  }

  // Build milestone groups: milestones as headers with their child tasks
  function buildMilestoneGroups(instances: ScheduleInstanceWithName[]) {
    const milestones: ScheduleInstanceWithName[] = [];
    const tasksByMilestone = new Map<number, ScheduleInstanceWithName[]>();
    const ungrouped: ScheduleInstanceWithName[] = [];

    // First pass: identify milestones
    for (const inst of instances) {
      if (inst.kind === 'MILESTONE') {
        milestones.push(inst);
        tasksByMilestone.set(inst.projectScheduleItemId, []);
      }
    }

    // Second pass: assign tasks to their parent milestone
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

  function toggleAllInActivity(instances: ScheduleInstanceWithName[]) {
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

  function getActivityStats(instances: ScheduleInstanceWithName[]) {
    let total = instances.length;
    let complete = instances.filter((i) => i.status === 'Complete').length;
    let overdue = instances.filter(isOverdue).length;
    return { total, complete, overdue };
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
      await batchUpdate.mutateAsync({
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
      await updateNotes.mutateAsync({
        instanceId,
        notes: notesText || null,
      });
      setEditingNotesId(null);
      success('Notes saved');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save notes');
    }
  }

  async function handleToggleLock(instanceId: number, currentLocked: boolean) {
    try {
      await toggleLock.mutateAsync({
        instanceId,
        locked: !currentLocked,
      });
      success(currentLocked ? 'Item unlocked' : 'Item locked');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to toggle lock');
    }
  }

  async function handleToggleOverride(instanceId: number, currentEnabled: boolean) {
    if (currentEnabled) {
      // Disable override
      try {
        await toggleOverride.mutateAsync({
          instanceId,
          enabled: false,
        });
        setOverrideDateId(null);
        success('Override removed');
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to remove override');
      }
    } else {
      // Show date input
      setOverrideDateId(instanceId);
      setOverrideDateValue(new Date().toISOString().split('T')[0]);
    }
  }

  async function handleSaveOverride(instanceId: number) {
    try {
      await toggleOverride.mutateAsync({
        instanceId,
        enabled: true,
        date: overrideDateValue,
      });
      setOverrideDateId(null);
      success('Override date set');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to set override');
    }
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">
            {supplier?.name || 'Supplier'} — {project?.name || 'Project'}
          </h1>
          <p className="text-muted-foreground mt-1">
            Supplier project tracking detail
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summaryStats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Complete</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{summaryStats.complete}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{summaryStats.overdue}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Blocked</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{summaryStats.blocked}</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{
              width:
                summaryStats.total > 0
                  ? `${(summaryStats.complete / summaryStats.total) * 100}%`
                  : '0%',
            }}
          />
        </div>
        <span className="text-sm font-medium">
          {summaryStats.total > 0
            ? Math.round((summaryStats.complete / summaryStats.total) * 100)
            : 0}
          % Complete
        </span>
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
            disabled={batchUpdate.isPending}
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

      {/* Activities (collapsible) */}
      {activities.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              No activities found for this supplier project.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => {
            const isExpanded = expandedActivities.has(activity.id);
            const stats = getActivityStats(activity.scheduleInstances);

            return (
              <div key={activity.id} className="border rounded-lg overflow-hidden">
                {/* Activity Header */}
                <div
                  className="flex items-center gap-3 p-4 bg-muted/50 cursor-pointer hover:bg-muted"
                  onClick={() => toggleActivity(activity.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 flex-shrink-0" />
                  )}

                  <span className="font-semibold">{activity.activityName}</span>

                  <StatusBadge status={activity.status} />

                  <span className="text-sm text-muted-foreground ml-2">
                    [{stats.complete}/{stats.total} Complete]
                  </span>

                  {stats.overdue > 0 && (
                    <span className="inline-flex items-center gap-1 text-sm text-amber-600">
                      [{stats.overdue} Overdue]
                    </span>
                  )}

                  <div className="ml-auto">
                    <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{
                          width:
                            stats.total > 0
                              ? `${(stats.complete / stats.total) * 100}%`
                              : '0%',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Schedule Items Table */}
                {isExpanded && (
                  <div>
                    <div className="px-4 py-2 border-t bg-muted/20">
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => toggleAllInActivity(activity.scheduleInstances)}
                      >
                        {activity.scheduleInstances.every((i) =>
                          selectedInstances.has(i.id)
                        )
                          ? 'Deselect all'
                          : 'Select all'}
                      </button>
                    </div>
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
                          const { milestones, tasksByMilestone, ungrouped } = buildMilestoneGroups(activity.scheduleInstances);
                          const rows: React.ReactNode[] = [];

                          // Render milestone groups
                          for (const ms of milestones) {
                            const childTasks = tasksByMilestone.get(ms.projectScheduleItemId) || [];
                            const msExpanded = expandedMilestones.has(ms.projectScheduleItemId);
                            const msOverdue = isOverdue(ms);
                            const childComplete = childTasks.filter((t) => t.status === 'Complete').length;

                            // Milestone header row
                            rows.push(
                              <TableRow
                                key={ms.id}
                                className={msOverdue ? 'bg-amber-50' : 'bg-muted/40 border-t-2'}
                              >
                                <TableCell>
                                  <button
                                    onClick={() => toggleInstance(ms.id)}
                                    className="p-0.5"
                                  >
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
                                      {msExpanded ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                    </button>
                                    <span className="font-semibold">{ms.itemName}</span>
                                    <span className="text-[10px] uppercase px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                      Milestone
                                    </span>
                                    {childTasks.length > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        [{childComplete}/{childTasks.length}]
                                      </span>
                                    )}
                                    {msOverdue && <Clock className="w-3.5 h-3.5 text-amber-600" />}
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
                                    {STATUS_OPTIONS.map((s) => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                </TableCell>
                                <TableCell>
                                  {overrideDateId === ms.id ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="date"
                                        className="h-8 rounded border border-input bg-background px-2 text-xs"
                                        value={overrideDateValue}
                                        onChange={(e) => setOverrideDateValue(e.target.value)}
                                      />
                                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleSaveOverride(ms.id)}>Save</Button>
                                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setOverrideDateId(null)}>Cancel</Button>
                                    </div>
                                  ) : (
                                    <span className={msOverdue ? 'text-amber-600 font-medium' : undefined}>
                                      {formatDate(ms.plannedDate)}
                                      {!!ms.plannedDateOverride && (
                                        <span className="text-xs text-blue-500 ml-1">(override)</span>
                                      )}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>{formatDate(ms.actualDate)}</TableCell>
                                <TableCell>
                                  {editingNotesId === ms.id ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        className="h-8 rounded border border-input bg-background px-2 text-xs flex-1"
                                        value={notesText}
                                        onChange={(e) => setNotesText(e.target.value)}
                                        placeholder="Add notes..."
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleSaveNotes(ms.id);
                                          if (e.key === 'Escape') setEditingNotesId(null);
                                        }}
                                      />
                                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleSaveNotes(ms.id)}>Save</Button>
                                    </div>
                                  ) : (
                                    <button
                                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 max-w-[150px] truncate"
                                      onClick={() => { setEditingNotesId(ms.id); setNotesText(ms.notes || ''); }}
                                    >
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

                            // Child task rows (only when expanded)
                            if (msExpanded) {
                              for (const task of childTasks) {
                                const taskOverdue = isOverdue(task);
                                rows.push(
                                  <TableRow key={task.id} className={taskOverdue ? 'bg-amber-50' : undefined}>
                                    <TableCell>
                                      <button onClick={() => toggleInstance(task.id)} className="p-0.5">
                                        {selectedInstances.has(task.id) ? (
                                          <CheckSquare className="w-4 h-4 text-primary" />
                                        ) : (
                                          <Square className="w-4 h-4 text-muted-foreground" />
                                        )}
                                      </button>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2 pl-8">
                                        <span className="font-medium">{task.itemName}</span>
                                        {taskOverdue && <Clock className="w-3.5 h-3.5 text-amber-600" />}
                                        {!!task.locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                                        {!!task.plannedDateOverride && <Pencil className="w-3.5 h-3.5 text-blue-500" />}
                                        {task.scopeOverride === 'NOT_REQUIRED' && <ShieldOff className="w-3.5 h-3.5 text-gray-400" />}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <select
                                        className="h-8 rounded border border-input bg-background px-2 text-xs"
                                        value={task.status}
                                        onChange={(e) => handleStatusChange(task.id, e.target.value as ActivityStatus)}
                                      >
                                        {STATUS_OPTIONS.map((s) => (
                                          <option key={s} value={s}>{s}</option>
                                        ))}
                                      </select>
                                    </TableCell>
                                    <TableCell>
                                      {overrideDateId === task.id ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="date"
                                            className="h-8 rounded border border-input bg-background px-2 text-xs"
                                            value={overrideDateValue}
                                            onChange={(e) => setOverrideDateValue(e.target.value)}
                                          />
                                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleSaveOverride(task.id)}>Save</Button>
                                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setOverrideDateId(null)}>Cancel</Button>
                                        </div>
                                      ) : (
                                        <span className={taskOverdue ? 'text-amber-600 font-medium' : undefined}>
                                          {formatDate(task.plannedDate)}
                                          {!!task.plannedDateOverride && (
                                            <span className="text-xs text-blue-500 ml-1">(override)</span>
                                          )}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell>{formatDate(task.actualDate)}</TableCell>
                                    <TableCell>
                                      {editingNotesId === task.id ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="text"
                                            className="h-8 rounded border border-input bg-background px-2 text-xs flex-1"
                                            value={notesText}
                                            onChange={(e) => setNotesText(e.target.value)}
                                            placeholder="Add notes..."
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleSaveNotes(task.id);
                                              if (e.key === 'Escape') setEditingNotesId(null);
                                            }}
                                          />
                                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleSaveNotes(task.id)}>Save</Button>
                                        </div>
                                      ) : (
                                        <button
                                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 max-w-[150px] truncate"
                                          onClick={() => { setEditingNotesId(task.id); setNotesText(task.notes || ''); }}
                                        >
                                          {task.notes ? <span className="truncate">{task.notes}</span> : <><MessageSquare className="w-3 h-3" />Add note</>}
                                        </button>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" title={task.locked ? 'Unlock' : 'Lock'} onClick={() => handleToggleLock(task.id, task.locked)}>
                                          {task.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" title={task.plannedDateOverride ? 'Remove date override' : 'Override date'} onClick={() => handleToggleOverride(task.id, task.plannedDateOverride)}>
                                          <Pencil className={`w-3.5 h-3.5 ${task.plannedDateOverride ? 'text-blue-500' : ''}`} />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              }
                            }
                          }

                          // Render ungrouped tasks (not anchored to a milestone)
                          for (const task of ungrouped) {
                            const taskOverdue = isOverdue(task);
                            rows.push(
                              <TableRow key={task.id} className={taskOverdue ? 'bg-amber-50' : undefined}>
                                <TableCell>
                                  <button onClick={() => toggleInstance(task.id)} className="p-0.5">
                                    {selectedInstances.has(task.id) ? (
                                      <CheckSquare className="w-4 h-4 text-primary" />
                                    ) : (
                                      <Square className="w-4 h-4 text-muted-foreground" />
                                    )}
                                  </button>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{task.itemName}</span>
                                    {taskOverdue && <Clock className="w-3.5 h-3.5 text-amber-600" />}
                                    {!!task.locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                                    {!!task.plannedDateOverride && <Pencil className="w-3.5 h-3.5 text-blue-500" />}
                                    {task.scopeOverride === 'NOT_REQUIRED' && <ShieldOff className="w-3.5 h-3.5 text-gray-400" />}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <select
                                    className="h-8 rounded border border-input bg-background px-2 text-xs"
                                    value={task.status}
                                    onChange={(e) => handleStatusChange(task.id, e.target.value as ActivityStatus)}
                                  >
                                    {STATUS_OPTIONS.map((s) => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                </TableCell>
                                <TableCell>
                                  {overrideDateId === task.id ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="date"
                                        className="h-8 rounded border border-input bg-background px-2 text-xs"
                                        value={overrideDateValue}
                                        onChange={(e) => setOverrideDateValue(e.target.value)}
                                      />
                                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleSaveOverride(task.id)}>Save</Button>
                                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setOverrideDateId(null)}>Cancel</Button>
                                    </div>
                                  ) : (
                                    <span className={taskOverdue ? 'text-amber-600 font-medium' : undefined}>
                                      {formatDate(task.plannedDate)}
                                      {!!task.plannedDateOverride && (
                                        <span className="text-xs text-blue-500 ml-1">(override)</span>
                                      )}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>{formatDate(task.actualDate)}</TableCell>
                                <TableCell>
                                  {editingNotesId === task.id ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        className="h-8 rounded border border-input bg-background px-2 text-xs flex-1"
                                        value={notesText}
                                        onChange={(e) => setNotesText(e.target.value)}
                                        placeholder="Add notes..."
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleSaveNotes(task.id);
                                          if (e.key === 'Escape') setEditingNotesId(null);
                                        }}
                                      />
                                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleSaveNotes(task.id)}>Save</Button>
                                    </div>
                                  ) : (
                                    <button
                                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 max-w-[150px] truncate"
                                      onClick={() => { setEditingNotesId(task.id); setNotesText(task.notes || ''); }}
                                    >
                                      {task.notes ? <span className="truncate">{task.notes}</span> : <><MessageSquare className="w-3 h-3" />Add note</>}
                                    </button>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title={task.locked ? 'Unlock' : 'Lock'} onClick={() => handleToggleLock(task.id, task.locked)}>
                                      {task.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title={task.plannedDateOverride ? 'Remove date override' : 'Override date'} onClick={() => handleToggleOverride(task.id, task.plannedDateOverride)}>
                                      <Pencil className={`w-3.5 h-3.5 ${task.plannedDateOverride ? 'text-blue-500' : ''}`} />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          }

                          return rows;
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
