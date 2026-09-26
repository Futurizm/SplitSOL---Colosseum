import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';

/**
 * Тип Supabase-клиента выводится из фабрики, а не пишется руками:
 * у `SupabaseClient` несколько generic-параметров, и их порядок менялся
 * между версиями supabase-js. Так тип всегда соответствует установленной версии.
 */
export type Supabase = ReturnType<typeof createBrowserClient<Database>>;

export type { Database };
