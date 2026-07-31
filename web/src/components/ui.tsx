import React, { createContext, useContext, useState, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/cn';

// ---------------- Toast ----------------
type ToastType = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}
const ToastCtx = createContext<(type: ToastType, message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const push = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'card p-3 flex items-start gap-2 animate-slide-up shadow-lg',
              t.type === 'error' && 'border-red-300',
              t.type === 'success' && 'border-green-300',
              t.type === 'info' && 'border-brand-300'
            )}
          >
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />}
            {t.type === 'error' && <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />}
            {t.type === 'info' && <CheckCircle2 className="w-5 h-5 text-brand-600 mt-0.5" />}
            <span className="text-sm text-ink-800 flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------- Spinner ----------------
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('w-4 h-4 animate-spin', className)} />;
}

// ---------------- Badge ----------------
export function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'green' | 'red' | 'brand' | 'amber' | 'teal' | 'purple' }) {
  const tones: any = {
    gray: 'bg-ink-100 text-ink-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    brand: 'bg-brand-100 text-brand-700',
    amber: 'bg-amber-100 text-amber-700',
    teal: 'bg-teal-100 text-teal-700',
    purple: 'bg-purple-100 text-purple-700'
  };
  return <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', tones[tone])}>{children}</span>;
}

// ---------------- Modal ----------------
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg', closeOnBackdrop = false }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  closeOnBackdrop?: boolean;
}) {
  if (!open) return null;
  
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop) {
      onClose();
    }
    // Don't close on backdrop click by default
  };
  
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40" onClick={handleBackdropClick}>
      <div
        className={cn('card w-full bg-white p-5 animate-slide-up', width)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
          <button className="text-ink-400 hover:text-ink-700" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 mt-5">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------- Tabs ----------------
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; icon?: React.ReactNode }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-ink-200 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition flex items-center gap-2',
            active === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800'
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- EmptyState ----------------
export function EmptyState({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="w-14 h-14 rounded-2xl bg-ink-100 text-ink-400 flex items-center justify-center mb-4 text-2xl">{icon}</div>}
      <p className="font-semibold text-ink-700">{title}</p>
      {hint && <p className="text-sm text-ink-400 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
