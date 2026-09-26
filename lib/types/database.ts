/**
 * Типы Supabase-схемы (по supabase/schema.sql).
 *
 * ВАЖНО: все типы объявлены через `type`, а не `interface`. Supabase требует,
 * чтобы Row/Insert/Update были assignable в `Record<string, unknown>`, а
 * интерфейсы не получают неявного index signature — с `interface` все запросы
 * `.insert()/.update()` типизируются как `never`.
 *
 * При изменении схемы обновите этот файл или сгенерируйте заново:
 *   npx supabase gen types typescript --project-id <id> > lib/types/database.generated.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type GroupCategory = 'restaurant' | 'travel' | 'shopping' | 'other';
export type GroupStatus = 'active' | 'settled' | 'cancelled';
export type MemberStatus = 'pending' | 'paid' | 'cancelled';
export type MemberRole = 'owner' | 'member';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed';
export type ActivityAction = 'joined' | 'paid' | 'created' | 'invited';
export type SupportedCurrency = 'tUSDC' | 'SOL';

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

export type Group = {
  id: string;
  name: string;
  description: string | null;
  category: GroupCategory;
  created_by: string | null;
  /** Сумма в минимальных единицах (micro-tUSDC) — 6 decimals. */
  total_amount: string;
  currency: SupportedCurrency;
  status: GroupStatus;
  invite_code: string;
  restaurant_wallet: string | null;
  image_url: string | null;
  created_at: string;
  settled_at: string | null;
  /** on-chain PDA группы; колонки нет, значение хранится вместе с записью. */
  onchain_group_pda?: string | null;
  /** Первые 8 байт on-chain group_id (hex). */
  onchain_group_id?: string | null;
  /** Сумма собранных платежей в micro-единицах (вычисляется на клиенте). */
  paid_amount?: string;
  /** Количество участников (вычисляется на клиенте). */
  member_count?: number;
};

export type GroupMember = {
  id: string;
  group_id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_wallet: string | null;
  /** Доля к оплате, micro-tUSDC. */
  share_amount: string;
  /** Процент от общей суммы. */
  share_percentage: string;
  status: MemberStatus;
  paid_at: string | null;
  tx_signature: string | null;
  role: MemberRole;
  joined_at: string;
  /** on-chain PDA участника. */
  onchain_member_pda?: string | null;
};

export type Transaction = {
  id: string;
  group_id: string;
  member_id: string | null;
  from_wallet: string;
  to_wallet: string;
  /** micro-tUSDC */
  amount: string;
  currency: string;
  tx_signature: string | null;
  status: TransactionStatus;
  /** Unix timestamp блока (секунды). */
  block_time: number | null;
  slot: number | null;
  fee: string | null;
  created_at: string;
  confirmed_at: string | null;
  /** anchor | solana_pay */
  kind?: 'anchor' | 'solana_pay';
};

export type ActivityFeedEntry = {
  id: string;
  group_id: string;
  user_id: string | null;
  action: ActivityAction;
  metadata: Json;
  created_at: string;
};

type Table<Row, RequiredInsert extends object = object> = {
  Row: Row;
  Insert: RequiredInsert;
  Update: Partial<Row>;
  Relationships: [];
};

/** Группа + вложенные участники — используется на всех экранах. */
export type GroupWithMembers = Group & {
  members: GroupMember[];
  owner?: Profile | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, { id: string } & Partial<Omit<Profile, 'id'>>>;
      groups: Table<
        Group,
        { name: string } & Partial<Omit<Group, 'name' | 'category'>> & { category?: GroupCategory }
      >;
      group_members: Table<GroupMember, { group_id: string } & Partial<Omit<GroupMember, 'group_id'>>>;
      transactions: Table<
        Transaction,
        {
          group_id: string;
          from_wallet: string;
          to_wallet: string;
          amount: string;
        } & Partial<Omit<Transaction, 'group_id' | 'from_wallet' | 'to_wallet' | 'amount'>>
      >;
      activity_feed: Table<
        ActivityFeedEntry,
        { group_id: string; action: ActivityAction } & Partial<Omit<ActivityFeedEntry, 'group_id' | 'action'>>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      group_category: GroupCategory;
      group_status: GroupStatus;
      member_status: MemberStatus;
      member_role: MemberRole;
      transaction_status: TransactionStatus;
      activity_action: ActivityAction;
      supported_currency: SupportedCurrency;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
