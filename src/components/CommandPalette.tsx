import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FolderKanban,
  ListChecks,
  FileStack,
  Package,
  LayoutDashboard,
  Grid3X3,
  BarChart3,
  ArrowLeftRight,
  Settings,
  HelpCircle,
  Search,
} from 'lucide-react';
import { useGlobalSearch } from '@/hooks/use-global-search';
import type { SearchResult } from '@shared/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Suppliers', path: '/suppliers', icon: Users },
  { name: 'Projects', path: '/projects', icon: FolderKanban },
  { name: 'Tracking', path: '/tracking', icon: Grid3X3 },
  { name: 'Activity Templates', path: '/activity-templates', icon: ListChecks },
  { name: 'Project Templates', path: '/project-templates', icon: FileStack },
  { name: 'Parts', path: '/parts', icon: Package },
  { name: 'Reports', path: '/reports', icon: BarChart3 },
  { name: 'Import / Export', path: '/import-export', icon: ArrowLeftRight },
  { name: 'Settings', path: '/settings', icon: Settings },
  { name: 'Help', path: '/help', icon: HelpCircle },
];

const TYPE_ICONS: Record<string, typeof Users> = {
  supplier: Users,
  project: FolderKanban,
  'activity-template': ListChecks,
  'project-template': FileStack,
  part: Package,
};

const TYPE_LABELS: Record<string, string> = {
  supplier: 'Supplier',
  project: 'Project',
  'activity-template': 'Activity Template',
  'project-template': 'Project Template',
  part: 'Part',
};

function getNavigationPath(result: SearchResult): string {
  switch (result.type) {
    case 'supplier': return `/suppliers/${result.id}`;
    case 'project': return `/projects/${result.id}`;
    case 'activity-template': return `/activity-templates/${result.id}`;
    case 'project-template': return `/project-templates/${result.id}`;
    case 'part': return `/parts`;
    default: return '/';
  }
}

interface ListItem {
  kind: 'nav' | 'result';
  id: string;
  name: string;
  subtitle?: string;
  icon: typeof Users;
  path: string;
  group: string;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: searchData } = useGlobalSearch(query);

  // Build flat list of items
  const items = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];
    const q = query.toLowerCase().trim();

    // Nav items (filtered by query)
    const filteredNav = q
      ? NAV_ITEMS.filter((n) => n.name.toLowerCase().includes(q))
      : NAV_ITEMS;

    if (filteredNav.length > 0) {
      for (const nav of filteredNav) {
        result.push({
          kind: 'nav',
          id: `nav-${nav.path}`,
          name: nav.name,
          icon: nav.icon,
          path: nav.path,
          group: 'Pages',
        });
      }
    }

    // Search results
    if (searchData?.results) {
      // Group by type
      const grouped = new Map<string, SearchResult[]>();
      for (const r of searchData.results) {
        const group = TYPE_LABELS[r.type] || r.type;
        if (!grouped.has(group)) grouped.set(group, []);
        grouped.get(group)!.push(r);
      }

      for (const [group, items_in_group] of grouped) {
        for (const r of items_in_group) {
          result.push({
            kind: 'result',
            id: `${r.type}-${r.id}`,
            name: r.name,
            subtitle: r.subtitle,
            icon: TYPE_ICONS[r.type] || Search,
            path: getNavigationPath(r),
            group: `${group}s`,
          });
        }
      }
    }

    return result;
  }, [query, searchData]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (item: ListItem) => {
      navigate(item.path);
      onClose();
    },
    [navigate, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) {
          handleSelect(items[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [items, selectedIndex, handleSelect, onClose]
  );

  if (!isOpen) return null;

  // Group items for display
  const groups: { label: string; items: (ListItem & { flatIndex: number })[] }[] = [];
  let flatIndex = 0;
  for (const item of items) {
    let group = groups.find((g) => g.label === item.group);
    if (!group) {
      group = { label: item.group, items: [] };
      groups.push(group);
    }
    group.items.push({ ...item, flatIndex });
    flatIndex++;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center border-b px-4">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or jump to..."
            className="flex-1 h-12 px-3 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[300px] overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {query.length >= 2 ? 'No results found' : 'Start typing to search...'}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isSelected = item.flatIndex === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      data-index={item.flatIndex}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(item.flatIndex)}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <span className="block truncate">{item.name}</span>
                        {item.subtitle && (
                          <span className="block text-xs text-muted-foreground truncate">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                      {item.kind === 'result' && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {item.group}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t px-4 py-2 flex gap-4 text-[10px] text-muted-foreground">
          <span><kbd className="px-1 py-0.5 rounded border bg-muted">&#8593;&#8595;</kbd> Navigate</span>
          <span><kbd className="px-1 py-0.5 rounded border bg-muted">&#8629;</kbd> Select</span>
          <span><kbd className="px-1 py-0.5 rounded border bg-muted">esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
