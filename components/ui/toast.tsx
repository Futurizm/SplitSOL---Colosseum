'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Минималистичный тост на framer-motion — без лишних зависимостей.
 */

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

export interface ToastItem {
  id: string;
  title: string;
  description?: React.ReactNode;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  toast: (input: Omit<Partial<ToastItem>, 'id'> & { title: string }) => string;
  success: (title: string, description?: React.ReactNode) => string;
  error: (title: string, description?: React.ReactNode) => string;
  info: (title: string, description?: React.ReactNode) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastVariant, React.ElementType> = {
  default: Info,
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
};

const STYLES: Record<ToastVariant, string> = {
  default: 'border-border',
  success: 'border-success/40',
  error: 'border-error/40',
  warning: 'border-warning/40',
};

const ICON_STYLES: Record<ToastVariant, string> = {
  default: 'text-muted-foreground',
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
};

let counter = 0;
function nextId(): string {
  counter += 1;
  return `toast-${Date.now()}-${counter}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = React.useCallback(
    (input: Partial<ToastItem> & { title: string }) => {
      const item: ToastItem = {
        id: nextId(),
        title: input.title,
        description: input.description,
        variant: input.variant ?? 'default',
        duration: input.duration ?? 5000,
      };
      setItems((prev) => [...prev.slice(-3), item]);
      if (item.duration > 0) {
        window.setTimeout(() => dismiss(item.id), item.duration);
      }
      return item.id;
    },
    [dismiss],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast: push,
      success: (title, description) => push({ title, description, variant: 'success' }),
      error: (title, description) =>
        push({ title, description, variant: 'error', duration: 8000 }),
      info: (title, description) => push({ title, description, variant: 'default' }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const Icon = ICONS[item.variant];
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 32, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className={cn(
                  'pointer-events-auto flex items-start gap-3 rounded-xl border bg-card/95 p-4 shadow-xl backdrop-blur',
                  STYLES[item.variant],
                )}
                role="status"
              >
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_STYLES[item.variant])} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.description ? (
                    <div className="mt-0.5 break-words text-xs text-muted-foreground">
                      {item.description}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Закрыть уведомление"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast должен использоваться внутри <ToastProvider>');
  }
  return context;
}
