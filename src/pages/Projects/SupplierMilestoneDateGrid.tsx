import { useState, useCallback, useMemo } from 'react';
import { Save, X, CalendarDays, Copy } from 'lucide-react';
import {
  useSupplierMilestoneGrid,
  useUpdateSupplierMilestoneDates,
  useFillMilestoneRow,
} from '@/hooks/use-supplier-milestone-grid';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';

interface Props {
  projectId: number;
}

export default function SupplierMilestoneDateGrid({ projectId }: Props) {
  const { data, isLoading } = useSupplierMilestoneGrid(projectId);
  const { data: settings } = useSettings();
  const updateDates = useUpdateSupplierMilestoneDates(projectId);
  const fillRow = useFillMilestoneRow(projectId);
  const { success, error: showError } = useToast();

  // key = `${supplierProjectId}-${milestoneId}`, value = date or null
  const [pendingChanges, setPendingChanges] = useState<Map<string, string | null>>(new Map());
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const handleDateChange = useCallback(
    (supplierProjectId: number, milestoneId: number, date: string | null, originalDate: string | null) => {
      const key = `${supplierProjectId}-${milestoneId}`;
      setPendingChanges((prev) => {
        const next = new Map(prev);
        if ((date || null) === (originalDate || null)) {
          next.delete(key);
        } else {
          next.set(key, date || null);
        }
        return next;
      });
    },
    []
  );

  const handleSave = async () => {
    if (pendingChanges.size === 0) return;
    const updates = Array.from(pendingChanges.entries()).map(([key, date]) => {
      const [spId, mId] = key.split('-').map(Number);
      return { supplierProjectId: spId, milestoneId: mId, date };
    });
    try {
      await updateDates.mutateAsync({ updates });
      setPendingChanges(new Map());
      success(`Updated ${updates.length} date(s)`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  const handleDiscard = () => setPendingChanges(new Map());

  const handleFillRow = async (milestoneId: number) => {
    const date = prompt('Enter date (YYYY-MM-DD) to apply to all suppliers:');
    if (!date) return;
    // Basic date validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      showError('Invalid date format. Please use YYYY-MM-DD.');
      return;
    }
    try {
      await fillRow.mutateAsync({ projectId, milestoneId, date });
      setPendingChanges(new Map());
      success('Row filled successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to fill row');
    }
  };

  // Group milestones by category
  const groupedMilestones = useMemo(() => {
    if (!data) return [];
    const categories = settings?.milestoneCategories || [];
    const groups = new Map<string, typeof data.milestones>();

    for (const m of data.milestones) {
      const cat = m.category || 'Uncategorized';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(m);
    }

    // Order: settings categories first, extras, uncategorized last
    const ordered: { category: string; milestones: typeof data.milestones }[] = [];
    for (const cat of categories) {
      if (groups.has(cat)) {
        ordered.push({ category: cat, milestones: groups.get(cat)! });
        groups.delete(cat);
      }
    }
    for (const [cat, ms] of groups) {
      if (cat !== 'Uncategorized') ordered.push({ category: cat, milestones: ms });
    }
    if (groups.has('Uncategorized')) {
      ordered.push({ category: 'Uncategorized', milestones: groups.get('Uncategorized')! });
    }
    return ordered;
  }, [data, settings]);

  if (isLoading) return <LoadingSpinner />;
  if (!data) return null;

  if (data.suppliers.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>No suppliers assigned to this project yet.</p>
        <p className="text-sm mt-1">Apply suppliers to the project to see milestone dates here.</p>
      </div>
    );
  }

  if (data.milestones.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>No milestones defined for this project.</p>
        <p className="text-sm mt-1">Add milestones in the Overview tab first.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      {pendingChanges.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 p-3 mb-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg">
          <span className="text-sm font-medium">
            {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={handleDiscard}>
            <X className="w-3 h-3 mr-1" />
            Discard
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateDates.isPending}>
            <Save className="w-3 h-3 mr-1" />
            Save
          </Button>
        </div>
      )}

      {/* Grid */}
      <div className="border rounded-lg overflow-auto max-h-[70vh]">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-[5]">
            <tr className="bg-muted/80 backdrop-blur-sm">
              <th className="border-b border-r px-3 py-2 text-left font-medium sticky left-0 bg-muted z-[6] min-w-[120px]">
                Category
              </th>
              <th className="border-b border-r px-3 py-2 text-left font-medium sticky left-[120px] bg-muted z-[6] min-w-[160px]">
                Milestone
              </th>
              <th className="border-b border-r px-2 py-2 text-center font-medium sticky left-[280px] bg-muted z-[6] w-[60px]">
                Fill
              </th>
              {data.suppliers.map((s, colIdx) => (
                <th
                  key={s.supplierProjectId}
                  className={`border-b border-r px-3 py-2 text-center font-medium min-w-[140px] ${
                    hoveredCol === colIdx ? 'bg-accent/50' : ''
                  }`}
                >
                  {s.supplierName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedMilestones.map((group) =>
              group.milestones.map((m, mIdx) => {
                const isFirstInCategory = mIdx === 0;
                return (
                  <tr
                    key={m.id}
                    className={hoveredRow === m.id ? 'bg-accent/30' : ''}
                    onMouseEnter={() => setHoveredRow(m.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {/* Category cell - rowspan */}
                    {isFirstInCategory && (
                      <td
                        className="border-b border-r px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background align-top"
                        rowSpan={group.milestones.length}
                      >
                        {group.category}
                      </td>
                    )}
                    {/* Milestone name */}
                    <td className="border-b border-r px-3 py-2 font-medium sticky left-[120px] bg-background">
                      {m.name}
                    </td>
                    {/* Fill button */}
                    <td className="border-b border-r px-1 py-1 text-center sticky left-[280px] bg-background">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Fill this milestone for all suppliers"
                        onClick={() => handleFillRow(m.id)}
                        disabled={fillRow.isPending}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </td>
                    {/* Supplier date cells */}
                    {data.suppliers.map((s, colIdx) => {
                      const key = `${s.supplierProjectId}-${m.id}`;
                      const originalDate = data.dates[key] || null;
                      const currentDate =
                        pendingChanges.has(key)
                          ? pendingChanges.get(key) || ''
                          : originalDate || '';
                      const isChanged = pendingChanges.has(key);

                      return (
                        <td
                          key={s.supplierProjectId}
                          className={`border-b border-r px-1 py-1 ${
                            hoveredCol === colIdx ? 'bg-accent/30' : ''
                          } ${isChanged ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}`}
                          onMouseEnter={() => setHoveredCol(colIdx)}
                          onMouseLeave={() => setHoveredCol(null)}
                        >
                          <input
                            type="date"
                            className="w-full h-8 px-2 text-sm bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded"
                            value={currentDate}
                            onChange={(e) =>
                              handleDateChange(
                                s.supplierProjectId,
                                m.id,
                                e.target.value || null,
                                originalDate
                              )
                            }
                          />
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
  );
}
