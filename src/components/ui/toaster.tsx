import { useState, useEffect } from 'react';
import type { Toast } from '@/hooks/use-toast';
import { subscribeToToasts } from '@/hooks/use-toast';

export default function Toaster() {
  const [activeToasts, setActiveToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return subscribeToToasts(setActiveToasts);
  }, []);

  if (activeToasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {activeToasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={`pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all animate-in slide-in-from-bottom-2 ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : toast.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
