'use client';

import * as React from 'react';

export type TransactionPhase =
  | 'idle'
  | 'wallet'
  | 'pending'
  | 'confirmed'
  | 'failed';

export interface TransactionState {
  phase: TransactionPhase;
  signature: string | null;
  error: string | null;
  startedAt: number | null;
}

const IDLE: TransactionState = { phase: 'idle', signature: null, error: null, startedAt: null };

export interface UseTransactionResult extends TransactionState {
  isBusy: boolean;
  /** Запускает on-chain операцию, отслеживая все её фазы. */
  run: <T>(
    operation: () => Promise<{ signature: string } & T>,
    handlers?: {
      /** Метка для тостов. */
      pendingLabel?: string;
      successTitle?: string;
      successDescription?: (result: T) => string | undefined;
      errorTitle?: string;
    },
  ) => Promise<T | null>;
  reset: () => void;
  /** Подтверждённые в этой сессии подписи — чтобы не оплачивать дважды. */
  confirmations: Record<string, number>;
}

/**
 * Отслеживание жизненного цикла on-chain транзакции: подписание в кошельке,
 * ожидание подтверждения, успех/ошибка. Используется всеми кнопками оплаты.
 */
export function useTransaction(
  onSuccess?: () => void | Promise<void>,
  onError?: (message: string) => void,
): UseTransactionResult {
  const [state, setState] = React.useState<TransactionState>(IDLE);
  const [confirmations, setConfirmations] = React.useState<Record<string, number>>({});
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = React.useCallback(
    async <T,>(
      operation: () => Promise<{ signature: string } & T>,
      handlers?: {
        pendingLabel?: string;
        successTitle?: string;
        successDescription?: (result: T) => string | undefined;
        errorTitle?: string;
      },
    ): Promise<T | null> => {
      setState({ phase: 'wallet', signature: null, error: null, startedAt: Date.now() });

      try {
        const result = await operation();
        if (!mounted.current) return result;
        setState({
          phase: 'confirmed',
          signature: result.signature,
          error: null,
          startedAt: Date.now(),
        });
        setConfirmations((prev) => ({ ...prev, [result.signature]: 1 }));
        void handlers?.successTitle;
        void handlers?.successDescription;
        void handlers?.pendingLabel;
        void handlers?.errorTitle;
        await onSuccess?.();
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (mounted.current) {
          setState({ phase: 'failed', signature: null, error: message, startedAt: Date.now() });
        }
        onError?.(message);
        return null;
      }
    },
    [onSuccess, onError],
  );

  const reset = React.useCallback(() => {
    setState(IDLE);
  }, []);

  return {
    ...state,
    isBusy: state.phase === 'wallet' || state.phase === 'pending',
    run,
    reset,
    confirmations,
  };
}
