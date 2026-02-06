import { useCallback } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const toasts: Toast[] = [];
const listeners: Array<(toasts: Toast[]) => void> = [];

function emitChange() {
  listeners.forEach((listener) => listener([...toasts]));
}

function toastFn(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const id = Math.random().toString(36).substr(2, 9);
  const newToast: Toast = { id, message, type };
  toasts.push(newToast);
  emitChange();

  setTimeout(() => {
    const index = toasts.findIndex((t) => t.id === id);
    if (index > -1) {
      toasts.splice(index, 1);
      emitChange();
    }
  }, 5000);
}

export function useToast() {
  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    toastFn(message, type);
  }, []);

  const success = useCallback((message: string) => {
    toastFn(message, 'success');
  }, []);

  const error = useCallback((message: string) => {
    toastFn(message, 'error');
  }, []);

  const info = useCallback((message: string) => {
    toastFn(message, 'info');
  }, []);

  return {
    toast,
    success,
    error,
    info,
  };
}
