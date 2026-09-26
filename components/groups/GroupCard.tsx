import { ShoppingBag, Plane, Store, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { shortAddress } from '@/lib/utils/format';
import { formatMicro, plural } from '@/lib/utils/format';
import type { GroupCategory, GroupWithMembers } from '@/lib/types/database';

const CATEGORY_META: Record<GroupCategory, { label: string; icon: typeof UtensilsCrossed }> = {
  restaurant: { label: 'Ресторан', icon: UtensilsCrossed },
  travel: { label: 'Поездка', icon: Plane },
  shopping: { label: 'Покупки', icon: ShoppingBag },
  other: { label: 'Другое', icon: Store },
};

const STATUS_VARIANT: Record<GroupWithMembers['status'], 'success' | 'default' | 'destructive'> = {
  active: 'default',
  settled: 'success',
  cancelled: 'destructive',
};

const STATUS_LABEL: Record<GroupWithMembers['status'], string> = {
  active: 'Активна',
  settled: 'Рассчитана',
  cancelled: 'Отменена',
};

export function GroupCard({ group }: { group: GroupWithMembers }) {
  const meta = CATEGORY_META[group.category] ?? CATEGORY_META.other;
  const Icon = meta.icon;

  const members = group.members ?? [];
  const paid = members.filter((member) => member.status === 'paid').length;
  const total = members.length;
  const progress = total > 0 ? (paid / total) * 100 : 0;
  const paidAmount = members
    .filter((member) => member.status === 'paid')
    .reduce<bigint>((sum, member) => sum + BigInt(member.share_amount || '0'), 0n);

  return (
    <Link href={`/groups/${group.id}`} className="group block">
      <Card className="h-full transition-colors group-hover:border-solana-purple/40">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Icon className="h-5 w-5 text-solana-green" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate font-display font-semibold">{group.name}</h3>
                <p className="truncate text-xs text-muted-foreground">
                  {meta.label} · {paid} из {total} оплатили
                </p>
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[group.status]} className="shrink-0">
              {STATUS_LABEL[group.status]}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Счёт</p>
              <p className="tabular font-display text-2xl font-bold">
                {formatMicro(group.total_amount, group.currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Собрано</p>
              <p className="tabular font-mono text-sm text-solana-green">
                {formatMicro(paidAmount.toString(), group.currency)}
              </p>
            </div>
          </div>

          <Progress value={progress} aria-label={`Оплачено ${paid} из ${total}`} />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {total} {plural(total, 'участник', 'участника', 'участников')}
            </span>
            <span className="font-mono">код {group.invite_code}</span>
          </div>

          {group.restaurant_wallet ? (
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              получатель {shortAddress(group.restaurant_wallet)}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

export { CATEGORY_META, STATUS_LABEL, STATUS_VARIANT };
export default GroupCard;
