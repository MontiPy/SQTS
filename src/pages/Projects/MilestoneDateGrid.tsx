import { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { Save, CalendarDays, Search, X } from 'lucide-react';
import { useMilestoneGrid, useUpdateMilestoneDates } from '@/hooks/use-milestone-grid';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function MilestoneDateGrid() {
  const { data, isLoading } = useMilestoneGrid();
  const { data: settings } = useSettings();
  const updateDates = useUpdateMilestoneDates();
  const { success, error: showError } = useToast();

  const [pendingChanges, setPendingChanges] = useState<Map<number, string | null>>(new Map());
  const [editingCell, setEditingCell] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState('');

  const handleDateChange = useCallback((milestoneId: number, date: string | null, originalDate: string | null) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      if ((date || null) === (originalDate || null)) {
        next.delete(milestoneId);
      } else {
        next.set(milestoneId, date || null);
      }
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (pendingChanges.size === 0) return;

    const updates = Array.from(pendingChanges.entries()).map(([milestoneId, date]) => ({
      milestoneId,
      date,
    }));

    try {
      await updateDates.mutateAsync({ updates });
      setPendingChanges(new Map());
      success(`Updated ${updates.length} milestone date(s)`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  // Filter projects by search term
  const filteredProjects = useMemo(() => {
    if (!data) return [];
    if (!projectFilter.trim()) return data.projects;
    const term = projectFilter.toLowerCase();
    return data.projects.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.version.toLowerCase().includes(term)
    );
  }, [data, projectFilter]);

  if (isLoading) return <LoadingSpinner />;

  if (!data || data.projects.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <CalendarDays className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-1">No Projects</h3>
        <p className="text-sm text-muted-foreground">
          Create projects with milestones to see them in the date grid.
        </p>
      </div>
    );
  }

  if (data.rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <CalendarDays className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-1">No Milestones</h3>
        <p className="text-sm text-muted-foreground">
          Add milestones to your projects to populate the date grid.
        </p>
      </div>
    );
  }

  // Group rows by category, ordered by settings categories first
  const settingsCategories = settings?.milestoneCategories || [];
  const rowsByCategory = new Map<string, typeof data.rows>();
  for (const row of data.rows) {
    if (!rowsByCategory.has(row.category)) {
      rowsByCategory.set(row.category, []);
    }
    rowsByCategory.get(row.category)!.push(row);
  }

  const orderedCategories: [string, typeof data.rows][] = [];
  for (const cat of settingsCategories) {
    if (rowsByCategory.has(cat)) {
      orderedCategories.push([cat, rowsByCategory.get(cat)!]);
    }
  }
  for (const [cat, items] of rowsByCategory) {
    if (cat !== 'Uncategorized' && !settingsCategories.includes(cat)) {
      orderedCategories.push([cat, items]);
    }
  }
  if (rowsByCategory.has('Uncategorized')) {
    orderedCategories.push(['Uncategorized', rowsByCategory.get('Uncategorized')!]);
  }

  const getCellValue = (projectId: number, category: string, name: string): string => {
    const cell = data.cells[`${projectId}::${category}::${name}`];
    if (!cell) return '';
    if (pendingChanges.has(cell.milestoneId)) {
      return pendingChanges.get(cell.milestoneId) || '';
    }
    return cell.date || '';
  };

  const isCellPending = (projectId: number, category: string, name: string): boolean => {
    const cell = data.cells[`${projectId}::${category}::${name}`];
    return cell ? pendingChanges.has(cell.milestoneId) : false;
  };

  const cellExists = (projectId: number, category: string, name: string): boolean => {
    return `${projectId}::${category}::${name}` in data.cells;
  };

  // Measure the Category column width so the Milestone column sticks right after it
  const tableRef = useRef<HTMLTableElement>(null);
  const [catWidth, setCatWidth] = useState(100);
  useLayoutEffect(() => {
    if (!tableRef.current) return;
    const firstTh = tableRef.current.querySelector('thead th');
    if (firstTh) setCatWidth(firstTh.getBoundingClientRect().width);
  }, [filteredProjects, data]);

  // Crosshair highlight: column OR row hovered gets a subtle background
  const cellBg = (projectId: number, rowKey: string, base: string) => {
    const col = hoveredCol === projectId;
    const row = hoveredRow === rowKey;
    if (col && row) return 'bg-muted/50';
    if (col || row) return 'bg-muted/30';
    return base;
  };

  return (
    <div>
      {/* Toolbar row: filter + save */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            type="text"
            placeholder="Filter projects..."
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="pl-10 pr-8"
          />
          {projectFilter && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setProjectFilter('')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {pendingChanges.size > 0 && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-muted-foreground">
              {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingChanges(new Map())}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateDates.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {updateDates.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>

      {filteredProjects.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No projects match "{projectFilter}"
          </p>
        </div>
      ) : (
        /* Grid */
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table ref={tableRef} className="border-collapse text-sm" style={{ tableLayout: 'auto' }}>
              {/* colgroup: auto-fit widths */}
              <colgroup>
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                {filteredProjects.map(p => (
                  <col key={p.id} style={{ width: 'auto' }} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-2 border-r font-medium whitespace-nowrap sticky left-0 bg-muted/50 z-[2]">
                    Category
                  </th>
                  <th className="text-left px-3 py-2 border-r font-medium whitespace-nowrap sticky bg-muted/50 z-[2] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" style={{ left: catWidth }}>
                    Milestone
                  </th>
                  {filteredProjects.map(p => (
                    <th
                      key={p.id}
                      className={`text-center px-3 py-2 border-r font-medium whitespace-nowrap ${hoveredCol === p.id ? 'bg-muted/30' : ''}`}
                      onMouseEnter={() => setHoveredCol(p.id)}
                      onMouseLeave={() => setHoveredCol(null)}
                    >
                      <div>{p.name}</div>
                      <div className="text-xs font-normal text-muted-foreground">{p.version}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderedCategories.map(([category, categoryRows]) =>
                  categoryRows.map((row, idx) => {
                    const rowKey = `${category}::${row.name}`;
                    return (
                    <tr
                      key={rowKey}
                      className="border-t"
                      onMouseEnter={() => setHoveredRow(rowKey)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      {/* Category cell — rowspan */}
                      {idx === 0 && (
                        <td
                          className={`px-3 py-2 border-r font-medium text-muted-foreground align-top whitespace-nowrap sticky left-0 z-[1] ${hoveredRow === rowKey ? 'bg-muted/30' : 'bg-background'}`}
                          rowSpan={categoryRows.length}
                        >
                          {category}
                        </td>
                      )}
                      {/* Milestone name */}
                      <td className={`px-3 py-2 border-r font-medium whitespace-nowrap sticky z-[1] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${hoveredRow === rowKey ? 'bg-muted/30' : 'bg-background'}`} style={{ left: catWidth }}>
                        {row.name}
                      </td>
                      {/* Date cells per project */}
                      {filteredProjects.map(p => {
                        const exists = cellExists(p.id, row.category, row.name);
                        if (!exists) {
                          return (
                            <td
                              key={p.id}
                              className={`p-1 border-r text-center ${cellBg(p.id, rowKey, 'bg-muted/10')}`}
                              onMouseEnter={() => setHoveredCol(p.id)}
                              onMouseLeave={() => setHoveredCol(null)}
                            >
                              <span className="text-xs text-muted-foreground/40">--</span>
                            </td>
                          );
                        }

                        const cell = data.cells[`${p.id}::${row.category}::${row.name}`];
                        const pending = isCellPending(p.id, row.category, row.name);
                        const value = getCellValue(p.id, row.category, row.name);
                        const isEditing = editingCell === cell.milestoneId;
                        const hasValue = !!value;

                        const pendingCls = pending ? 'bg-yellow-50 dark:bg-yellow-900/20' : '';

                        return (
                          <td
                            key={p.id}
                            className={`p-1 border-r ${pendingCls || cellBg(p.id, rowKey, '')}`}
                            onMouseEnter={() => setHoveredCol(p.id)}
                            onMouseLeave={() => setHoveredCol(null)}
                          >
                            {isEditing || hasValue ? (
                              <input
                                type="date"
                                autoFocus={isEditing && !hasValue}
                                className={`w-full px-2 py-1 rounded border text-sm bg-transparent
                                  ${pending
                                    ? 'border-yellow-400 dark:border-yellow-600 ring-1 ring-yellow-400/50'
                                    : 'border-input'
                                  }`}
                                value={value}
                                onChange={(e) =>
                                  handleDateChange(cell.milestoneId, e.target.value || null, cell.date)
                                }
                                onBlur={() => {
                                  if (!value) setEditingCell(null);
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                className="w-full px-2 py-1 rounded border border-transparent text-sm text-muted-foreground/40 hover:border-input hover:text-muted-foreground cursor-pointer text-center"
                                onClick={() => setEditingCell(cell.milestoneId)}
                              >
                                --
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
