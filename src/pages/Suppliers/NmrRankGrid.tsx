import { useState, useCallback, useMemo } from 'react';
import { Save, Search, X, ShieldCheck } from 'lucide-react';
import { useNmrRankGrid, useUpdateNmrRanks } from '@/hooks/use-nmr-rank-grid';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function NmrRankGrid() {
  const { data, isLoading } = useNmrRankGrid();
  const { data: settings } = useSettings();
  const updateRanks = useUpdateNmrRanks();
  const { success, error: showError } = useToast();

  // key = `${supplierId}-${projectId}`, value = new rank
  const [pendingChanges, setPendingChanges] = useState<Map<string, string | null>>(new Map());
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const nmrRanks = settings?.nmrRanks || [];

  const handleRankChange = useCallback((
    supplierId: number,
    projectId: number,
    newRank: string | null,
    originalRank: string | null,
  ) => {
    const key = `${supplierId}-${projectId}`;
    setPendingChanges(prev => {
      const next = new Map(prev);
      if ((newRank || null) === (originalRank || null)) {
        next.delete(key);
      } else {
        next.set(key, newRank || null);
      }
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!data || pendingChanges.size === 0) return;

    const updates = Array.from(pendingChanges.entries()).map(([key, nmrRank]) => ({
      supplierProjectId: data.supplierProjectIds[key],
      nmrRank,
    }));

    try {
      await updateRanks.mutateAsync({ updates });
      setPendingChanges(new Map());
      success(`Updated ${updates.length} NMR rank(s)`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  const filteredSuppliers = useMemo(() => {
    if (!data) return [];
    if (!supplierFilter.trim()) return data.suppliers;
    const term = supplierFilter.toLowerCase();
    return data.suppliers.filter(s => s.name.toLowerCase().includes(term));
  }, [data, supplierFilter]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    if (!projectFilter.trim()) return data.projects;
    const term = projectFilter.toLowerCase();
    return data.projects.filter(p =>
      p.name.toLowerCase().includes(term) || p.version.toLowerCase().includes(term)
    );
  }, [data, projectFilter]);

  if (isLoading) return <LoadingSpinner />;

  if (!data || data.suppliers.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-1">No Supplier Projects</h3>
        <p className="text-sm text-muted-foreground">
          Apply projects to suppliers to manage NMR ranks here.
        </p>
      </div>
    );
  }

  const getCellValue = (supplierId: number, projectId: number): string => {
    const key = `${supplierId}-${projectId}`;
    if (pendingChanges.has(key)) {
      return pendingChanges.get(key) || '';
    }
    return data.ranks[key] || '';
  };

  const isCellPending = (supplierId: number, projectId: number): boolean => {
    return pendingChanges.has(`${supplierId}-${projectId}`);
  };

  const cellExists = (supplierId: number, projectId: number): boolean => {
    return `${supplierId}-${projectId}` in data.supplierProjectIds;
  };

  const cellBg = (projectId: number, supplierId: number, base: string) => {
    const col = hoveredCol === projectId;
    const row = hoveredRow === supplierId;
    if (col && row) return 'bg-muted/50';
    if (col || row) return 'bg-muted/30';
    return base;
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="text"
              placeholder="Filter suppliers..."
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="pl-10 pr-8"
            />
            {supplierFilter && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSupplierFilter('')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="relative w-48">
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
        </div>

        {pendingChanges.size > 0 && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-muted-foreground">
              {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPendingChanges(new Map())}>
              Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateRanks.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {updateRanks.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>

      {filteredSuppliers.length === 0 || filteredProjects.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No results match the current filters.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm" style={{ tableLayout: 'auto' }}>
              <colgroup>
                <col style={{ width: 'auto' }} />
                {filteredProjects.map(p => (
                  <col key={p.id} style={{ width: 'auto' }} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-2 border-r font-medium whitespace-nowrap sticky left-0 bg-muted/50 z-[2]">
                    Supplier
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
                {filteredSuppliers.map(supplier => (
                  <tr
                    key={supplier.id}
                    className="border-t"
                    onMouseEnter={() => setHoveredRow(supplier.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td
                      className={`px-3 py-2 border-r font-medium whitespace-nowrap sticky left-0 z-[1] ${
                        hoveredRow === supplier.id ? 'bg-muted/30' : 'bg-background'
                      }`}
                    >
                      {supplier.name}
                    </td>
                    {filteredProjects.map(project => {
                      const exists = cellExists(supplier.id, project.id);
                      if (!exists) {
                        return (
                          <td
                            key={project.id}
                            className={`p-1 border-r text-center ${cellBg(project.id, supplier.id, 'bg-muted/10')}`}
                            onMouseEnter={() => setHoveredCol(project.id)}
                            onMouseLeave={() => setHoveredCol(null)}
                          >
                            <span className="text-xs text-muted-foreground/40">--</span>
                          </td>
                        );
                      }

                      const value = getCellValue(supplier.id, project.id);
                      const pending = isCellPending(supplier.id, project.id);
                      const originalRank = data.ranks[`${supplier.id}-${project.id}`] || null;
                      const pendingCls = pending ? 'bg-yellow-50 dark:bg-yellow-900/20' : '';

                      return (
                        <td
                          key={project.id}
                          className={`p-1 border-r ${pendingCls || cellBg(project.id, supplier.id, '')}`}
                          onMouseEnter={() => setHoveredCol(project.id)}
                          onMouseLeave={() => setHoveredCol(null)}
                        >
                          <select
                            className={`w-full px-2 py-1 rounded border text-sm bg-transparent ${
                              pending
                                ? 'border-yellow-400 dark:border-yellow-600 ring-1 ring-yellow-400/50'
                                : 'border-input'
                            }`}
                            value={value}
                            onChange={(e) =>
                              handleRankChange(supplier.id, project.id, e.target.value || null, originalRank)
                            }
                          >
                            <option value="">--</option>
                            {nmrRanks.map(rank => (
                              <option key={rank} value={rank}>{rank}</option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
