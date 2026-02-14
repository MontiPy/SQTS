import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { useAuditLog } from '@/hooks/use-audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AuditListParams } from '@shared/types';

const PAGE_SIZE = 20;

export default function AuditLogSection() {
  const [expanded, setExpanded] = useState(false);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const params = useMemo<AuditListParams>(() => ({
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
    ...(search ? { search } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [entityType, action, search, startDate, endDate, page]);

  const { data, isLoading } = useAuditLog(expanded ? params : { limit: 0, offset: 0 });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const startIdx = page * PAGE_SIZE + 1;
  const endIdx = Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0);

  const formatDetails = (details: Record<string, any> | null): string => {
    if (!details) return '';
    return Object.entries(details)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(', ');
  };

  return (
    <div className="border-t border-border pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Audit Log
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Entity Type</label>
              <select
                value={entityType}
                onChange={(e) => { setEntityType(e.target.value); setPage(0); }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
              >
                <option value="">All</option>
                {['supplier', 'project', 'activity_template', 'project_milestone', 'project_activity',
                  'supplier_project', 'supplier_activity', 'schedule_item', 'template_schedule_item',
                  'applicability_rule', 'applicability_clause', 'settings', 'template_version',
                  'part', 'location_code', 'project_template', 'supplier_milestone_dates',
                  'propagation', 'import_export'].map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Action</label>
              <select
                value={action}
                onChange={(e) => { setAction(e.target.value); setPage(0); }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[120px]"
              >
                <option value="">All</option>
                {['create', 'update', 'delete', 'batch_update', 'fill_row', 'apply', 'sync', 'import', 'export', 'wipe', 'backup'].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">From</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(0); }}
                className="h-9 w-[150px]"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">To</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(0); }}
                className="h-9 w-[150px]"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground block mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Search events..."
                  className="h-9 pl-8"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium">Timestamp</th>
                  <th className="text-left px-3 py-2 font-medium">Entity Type</th>
                  <th className="text-left px-3 py-2 font-medium">Action</th>
                  <th className="text-left px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                ) : !data || data.events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      No audit events found
                    </td>
                  </tr>
                ) : (
                  data.events.map((event) => (
                    <tr
                      key={event.id}
                      className="border-t hover:bg-muted/30 cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === event.id ? null : event.id)}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 bg-muted rounded text-xs">
                          {event.entityType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                          event.action === 'create' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          event.action === 'delete' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {event.action}
                        </span>
                      </td>
                      <td className="px-3 py-2 max-w-[300px]">
                        {expandedRow === event.id ? (
                          <pre className="text-xs whitespace-pre-wrap bg-muted/50 rounded p-2 mt-1">
                            {event.details ? JSON.stringify(event.details, null, 2) : 'No details'}
                          </pre>
                        ) : (
                          <span className="truncate block max-w-[300px] text-muted-foreground">
                            {formatDetails(event.details)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Showing {startIdx}--{endIdx} of {data.total}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <ChevronRightIcon className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
