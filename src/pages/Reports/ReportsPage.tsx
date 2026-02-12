import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Download, ArrowUpDown, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import OverdueList from '@/components/OverdueList';
import { useDueSoonItems, useSupplierProgress, useProjectProgress } from '@/hooks/use-dashboard';
import { useSuppliers } from '@/hooks/use-suppliers';
import { useProjects } from '@/hooks/use-projects';


const TABS = [
  { id: 'overdue', label: 'Overdue Items' },
  { id: 'due-soon', label: 'Due This Week' },
  { id: 'supplier-progress', label: 'Supplier Progress' },
  { id: 'project-progress', label: 'Project Progress' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// --- Due This Week Tab ---

type DueSoonSortField = 'supplierName' | 'projectName' | 'activityName' | 'itemName' | 'plannedDate' | 'status' | 'daysUntilDue';
type SortDir = 'asc' | 'desc';

function DueSoonList() {
  const [filterSupplierId, setFilterSupplierId] = useState<number | undefined>();
  const [filterProjectId, setFilterProjectId] = useState<number | undefined>();
  const [sortField, setSortField] = useState<DueSoonSortField>('daysUntilDue');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { data: items, isLoading, error } = useDueSoonItems({
    supplierId: filterSupplierId,
    projectId: filterProjectId,
  });
  const { data: suppliers } = useSuppliers();
  const { data: projects } = useProjects();

  const sortedItems = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number'
        ? (aVal as number) - (bVal as number)
        : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortField, sortDir]);

  function toggleSort(field: DueSoonSortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function exportCsv() {
    if (!sortedItems.length) return;
    const headers = ['Supplier', 'Project', 'Activity', 'Schedule Item', 'Due Date', 'Status', 'Days Until Due'];
    const rows = sortedItems.map((item) => [
      item.supplierName,
      item.projectName,
      item.activityName,
      item.itemName,
      item.plannedDate,
      item.status,
      String(item.daysUntilDue),
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `due-this-week-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function SortableHeader({ field, children }: { field: DueSoonSortField; children: React.ReactNode }) {
    return (
      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
        <div className="flex items-center gap-1">
          {children}
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </TableHead>
    );
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Error loading due soon items: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterSupplierId ?? ''}
          onChange={(e) => setFilterSupplierId(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All Suppliers</option>
          {suppliers?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterProjectId ?? ''}
          onChange={(e) => setFilterProjectId(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All Projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!sortedItems.length}>
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {sortedItems.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          message="No items due this week"
          description="There are no items due in the next 7 days matching the current filters."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader field="supplierName">Supplier</SortableHeader>
                <SortableHeader field="projectName">Project</SortableHeader>
                <SortableHeader field="activityName">Activity</SortableHeader>
                <SortableHeader field="itemName">Schedule Item</SortableHeader>
                <SortableHeader field="plannedDate">Due Date</SortableHeader>
                <SortableHeader field="status">Status</SortableHeader>
                <SortableHeader field="daysUntilDue">Days Until Due</SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item) => (
                <TableRow key={item.instanceId}>
                  <TableCell className="font-medium">{item.supplierName}</TableCell>
                  <TableCell>{item.projectName}</TableCell>
                  <TableCell>{item.activityName}</TableCell>
                  <TableCell>{item.itemName}</TableCell>
                  <TableCell>{item.plannedDate}</TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell>
                    <span className={item.daysUntilDue <= 1 ? 'text-orange-600 font-semibold' : 'text-blue-600 font-medium'}>
                      {item.daysUntilDue}d
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {sortedItems.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {sortedItems.length} item{sortedItems.length !== 1 ? 's' : ''} due this week
        </p>
      )}
    </div>
  );
}

// --- Supplier Progress Tab ---

type SupplierProgressSortField = 'supplierName' | 'totalItems' | 'completedItems' | 'overdueItems' | 'completionPercent';

function SupplierProgressList() {
  const [sortField, setSortField] = useState<SupplierProgressSortField>('supplierName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const { data: rows, isLoading, error } = useSupplierProgress();

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number'
        ? (aVal as number) - (bVal as number)
        : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortField, sortDir]);

  function toggleSort(field: SupplierProgressSortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function exportCsv() {
    if (!sortedRows.length) return;
    const headers = ['Supplier', 'Total Items', 'Completed', 'Overdue', 'Completion %'];
    const csvRows = sortedRows.map((r) => [
      r.supplierName,
      String(r.totalItems),
      String(r.completedItems),
      String(r.overdueItems),
      `${r.completionPercent}%`,
    ]);
    const csvContent = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `supplier-progress-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function SortableHeader({ field, children }: { field: SupplierProgressSortField; children: React.ReactNode }) {
    return (
      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
        <div className="flex items-center gap-1">
          {children}
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </TableHead>
    );
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Error loading supplier progress: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!sortedRows.length}>
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {sortedRows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          message="No supplier data"
          description="No suppliers have schedule items to track progress against."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader field="supplierName">Supplier</SortableHeader>
                <SortableHeader field="totalItems">Total Items</SortableHeader>
                <SortableHeader field="completedItems">Completed</SortableHeader>
                <SortableHeader field="overdueItems">Overdue</SortableHeader>
                <SortableHeader field="completionPercent">Completion %</SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.supplierId}>
                  <TableCell className="font-medium">{row.supplierName}</TableCell>
                  <TableCell>{row.totalItems}</TableCell>
                  <TableCell>{row.completedItems}</TableCell>
                  <TableCell>
                    {row.overdueItems > 0 ? (
                      <span className="text-destructive font-semibold">{row.overdueItems}</span>
                    ) : (
                      <span>0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            row.completionPercent === 100
                              ? 'bg-green-500'
                              : row.completionPercent >= 50
                                ? 'bg-blue-500'
                                : 'bg-orange-500'
                          )}
                          style={{ width: `${row.completionPercent}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-10 text-right">{row.completionPercent}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {sortedRows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {sortedRows.length} supplier{sortedRows.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

// --- Project Progress Tab ---

type ProjectProgressSortField = 'projectName' | 'totalSuppliers' | 'totalItems' | 'completedItems' | 'overdueItems' | 'completionPercent';

function ProjectProgressList() {
  const [sortField, setSortField] = useState<ProjectProgressSortField>('projectName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const { data: rows, isLoading, error } = useProjectProgress();

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number'
        ? (aVal as number) - (bVal as number)
        : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortField, sortDir]);

  function toggleSort(field: ProjectProgressSortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function exportCsv() {
    if (!sortedRows.length) return;
    const headers = ['Project', 'Suppliers', 'Total Items', 'Completed', 'Overdue', 'Completion %'];
    const csvRows = sortedRows.map((r) => [
      r.projectName,
      String(r.totalSuppliers),
      String(r.totalItems),
      String(r.completedItems),
      String(r.overdueItems),
      `${r.completionPercent}%`,
    ]);
    const csvContent = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `project-progress-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function SortableHeader({ field, children }: { field: ProjectProgressSortField; children: React.ReactNode }) {
    return (
      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
        <div className="flex items-center gap-1">
          {children}
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </TableHead>
    );
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Error loading project progress: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!sortedRows.length}>
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {sortedRows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          message="No project data"
          description="No projects have schedule items to track progress against."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader field="projectName">Project</SortableHeader>
                <SortableHeader field="totalSuppliers">Suppliers</SortableHeader>
                <SortableHeader field="totalItems">Total Items</SortableHeader>
                <SortableHeader field="completedItems">Completed</SortableHeader>
                <SortableHeader field="overdueItems">Overdue</SortableHeader>
                <SortableHeader field="completionPercent">Completion %</SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.projectId}>
                  <TableCell className="font-medium">{row.projectName}</TableCell>
                  <TableCell>{row.totalSuppliers}</TableCell>
                  <TableCell>{row.totalItems}</TableCell>
                  <TableCell>{row.completedItems}</TableCell>
                  <TableCell>
                    {row.overdueItems > 0 ? (
                      <span className="text-destructive font-semibold">{row.overdueItems}</span>
                    ) : (
                      <span>0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            row.completionPercent === 100
                              ? 'bg-green-500'
                              : row.completionPercent >= 50
                                ? 'bg-blue-500'
                                : 'bg-orange-500'
                          )}
                          style={{ width: `${row.completionPercent}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-10 text-right">{row.completionPercent}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {sortedRows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {sortedRows.length} project{sortedRows.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

// --- Main Reports Page ---

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'overdue'
  );

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam as TabId);
    }
  }, [tabParam]);

  function handleTabChange(tabId: TabId) {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Reports</h1>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overdue' && <OverdueList />}
      {activeTab === 'due-soon' && <DueSoonList />}
      {activeTab === 'supplier-progress' && <SupplierProgressList />}
      {activeTab === 'project-progress' && <ProjectProgressList />}
    </div>
  );
}
