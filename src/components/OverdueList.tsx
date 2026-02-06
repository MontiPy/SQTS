import { useState, useMemo } from 'react';
import { AlertCircle, Download, ArrowUpDown } from 'lucide-react';
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
import { useOverdueItems } from '@/hooks/use-dashboard';
import { useSuppliers } from '@/hooks/use-suppliers';
import { useProjects } from '@/hooks/use-projects';

type SortField = 'supplierName' | 'projectName' | 'activityName' | 'itemName' | 'plannedDate' | 'status' | 'daysOverdue';
type SortDir = 'asc' | 'desc';

export default function OverdueList() {
  const [filterSupplierId, setFilterSupplierId] = useState<number | undefined>();
  const [filterProjectId, setFilterProjectId] = useState<number | undefined>();
  const [sortField, setSortField] = useState<SortField>('daysOverdue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: items, isLoading, error } = useOverdueItems({
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

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function exportCsv() {
    if (!sortedItems.length) return;

    const headers = ['Supplier', 'Project', 'Activity', 'Schedule Item', 'Due Date', 'Status', 'Days Overdue'];
    const rows = sortedItems.map((item) => [
      item.supplierName,
      item.projectName,
      item.activityName,
      item.itemName,
      item.plannedDate,
      item.status,
      String(item.daysOverdue),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overdue-items-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function SortableHeader({ field, children }: { field: SortField; children: React.ReactNode }) {
    return (
      <TableHead
        className="cursor-pointer select-none"
        onClick={() => toggleSort(field)}
      >
        <div className="flex items-center gap-1">
          {children}
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </TableHead>
    );
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Error loading overdue items: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and export */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterSupplierId ?? ''}
          onChange={(e) => setFilterSupplierId(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All Suppliers</option>
          {suppliers?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterProjectId ?? ''}
          onChange={(e) => setFilterProjectId(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All Projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!sortedItems.length}>
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Results */}
      {sortedItems.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          message="No overdue items"
          description="There are no items past their due date matching the current filters."
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
                <SortableHeader field="daysOverdue">Days Overdue</SortableHeader>
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
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell>
                    <span className={item.daysOverdue > 7 ? 'text-destructive font-semibold' : 'text-orange-600 font-medium'}>
                      {item.daysOverdue}d
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Count footer */}
      {sortedItems.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {sortedItems.length} overdue item{sortedItems.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
