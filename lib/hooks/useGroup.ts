'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBrowserClientOrNull } from '@/lib/supabase/client';
import type { Group, GroupMember, GroupWithMembers, Profile } from '@/lib/types/database';

export interface UseGroupResult {
  group: GroupWithMembers | null;
  members: GroupMember[];
  owner: Profile | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Загрузка группы и её участников.
 *
 * Данные приходят двумя запросами (groups + group_members) и склеиваются на
 * клиенте — это заметно быстрее вложенных join'ов с RLS.
 */
export function useGroup(groupId: string | null): UseGroupResult {
  const supabase = getBrowserClientOrNull();
  const [group, setGroup] = useState<GroupWithMembers | null>(null);
  const [owner, setOwner] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(groupId));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!supabase || !groupId) return;
    setIsLoading(true);
    setError(null);

    const [groupResult, membersResult] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
      supabase.from('group_members').select('*').eq('group_id', groupId).order('joined_at', {
        ascending: true,
      }),
    ]);

    if (groupResult.error) {
      setError(groupResult.error.message);
      setIsLoading(false);
      return;
    }
    if (!groupResult.data) {
      setError('Группа не найдена или у вас нет к ней доступа.');
      setIsLoading(false);
      return;
    }
    if (membersResult.error) {
      setError(membersResult.error.message);
    }

    const members = (membersResult.data ?? []) as GroupMember[];
    const base = groupResult.data as Group;
    const paid = members
      .filter((member) => member.status === 'paid')
      .reduce<bigint>((sum, member) => sum + BigInt(member.share_amount || '0'), 0n);

    setGroup({
      ...base,
      members,
      member_count: members.length,
      paid_amount: paid.toString(),
    });

    if (base.created_by) {
      const profile = await supabase
        .from('profiles')
        .select('*')
        .eq('id', base.created_by)
        .maybeSingle();
      setOwner((profile.data as Profile | null) ?? null);
    } else {
      setOwner(null);
    }

    setIsLoading(false);
  }, [supabase, groupId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return useMemo(
    () => ({
      group,
      members: group?.members ?? [],
      owner,
      isLoading,
      error,
      reload,
    }),
    [group, owner, isLoading, error, reload],
  );
}

export interface UseGroupsResult {
  groups: GroupWithMembers[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Список групп пользователя. */
export function useGroups(status?: Group['status']): UseGroupsResult {
  const supabase = getBrowserClientOrNull();
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    let query = supabase
      .from('groups')
      .select('*, group_members(*)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (status) query = query.eq('status', status);

    const { data, error: queryError } = await query;

    if (queryError) {
      setError(queryError.message);
      setGroups([]);
      setIsLoading(false);
      return;
    }

    setGroups(((data ?? []) as unknown as GroupWithMembers[]) ?? []);
    setIsLoading(false);
  }, [supabase, status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { groups, isLoading, error, reload };
}
