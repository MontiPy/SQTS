import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { Button } from './ui/button';
import { useTheme } from '../hooks/use-theme';

type Theme = 'light' | 'dark' | 'system';

const themeOptions: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
];

interface ThemeToggleProps {
  collapsed?: boolean;
}

export default function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeOption = themeOptions.find(o => o.value === theme) || themeOptions[0];
  const ActiveIcon = activeOption.icon;

  // Close menu on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-44 rounded-md border border-border bg-card shadow-lg py-1 z-50">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const isActive = theme === option.value;
            return (
              <button
                key={option.value}
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                }}
                className={`flex items-center gap-3 w-full px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon size={16} />
                <span className="flex-1 text-left">{option.label}</span>
                {isActive && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}

      <Button
        variant="ghost"
        size={collapsed ? 'icon' : 'default'}
        onClick={() => setOpen(!open)}
        title={`Theme: ${activeOption.label}`}
        className={collapsed ? '' : 'w-full justify-start gap-3 px-3'}
      >
        <ActiveIcon size={20} />
        {!collapsed && <span>{activeOption.label}</span>}
      </Button>
    </div>
  );
}
