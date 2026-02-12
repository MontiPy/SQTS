import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Grid3X3,
  ListChecks,
  Package,
  BarChart3,
  ArrowLeftRight,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const primaryNav = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Suppliers', path: '/suppliers', icon: Users },
  { name: 'Projects', path: '/projects', icon: FolderKanban },
  { name: 'Tracking', path: '/tracking', icon: Grid3X3 },
  { name: 'Activity Templates', path: '/activity-templates', icon: ListChecks },
  { name: 'Parts', path: '/parts', icon: Package },
  { name: 'Reports', path: '/reports', icon: BarChart3 },
];

const secondaryNav = [
  { name: 'Import / Export', path: '/import-export', icon: ArrowLeftRight },
  { name: 'Settings', path: '/settings', icon: Settings },
  { name: 'Help', path: '/help', icon: HelpCircle },
];

export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebarCollapsed');
    return stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  return (
    <aside
      className={`flex flex-col bg-card border-r border-border transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && <h1 className="text-lg font-bold">SQTS</h1>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-accent"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-2">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
                title={collapsed ? item.name : undefined}
              >
                <Icon size={20} />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </div>

        <div className="mt-8 space-y-1 px-2 border-t border-border pt-4">
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
                title={collapsed ? item.name : undefined}
              >
                <Icon size={20} />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-border p-2">
        <ThemeToggle collapsed={collapsed} />
      </div>
    </aside>
  );
}
