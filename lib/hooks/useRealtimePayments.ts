'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBrowserClientOrNull } from '@/lib/supabase/client';
import type { GroupMember } from '@/lib/types/database';

export interface RealtimePaymentsState {
  members: GroupMember[];
  isConnected: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Live-обновление статусов оплаты в группе через Supabase Realtime.
 *
 * События `postgres_changes` приходят только если таблица добавлена в
 * publication `supabase_realtime` (см. supabase/rls.sql). Если канал не
 * подключился, компонент всё равно работает: данные обновляются по кнопке
 * и после подтверждения транзакции.
 */
export function useRealtimePayments(groupId: string | null): RealtimePaymentsState {
  const supabase = getBrowserClientOrNull();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !groupId) {
      setIsConnected(false);
      return;
    }

    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_members',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const next = payload.new as GroupMember;
          setMembers((prev) => {
            const index = prev.findIndex((member) => member.id === next.id);
            if (index === -1) return [...prev, next];
            const copy = [...prev];
            copy[index] = { ...copy[index]!, ...next };
            return copy;
          });
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Realtime-канал недоступен — статусы обновятся при перезагрузке страницы.');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [supabase, groupId]);

  const reload = useCallback(async () => {
    if (!supabase || !groupId) return;
    const { data, error: queryError } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });

    if (queryError) {
      setError(queryError.message);
      return;
    }
    setMembers((data ?? []) as GroupMember[]);
  }, [supabase, groupId]);

  return { members, isConnected, error, reload };
}
