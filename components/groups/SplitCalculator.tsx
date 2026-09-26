'use client';

import { AlertTriangle, Check, Plus, Scale, Trash2, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SPLIT_METHODS, calculateSplit, type SplitMethod, type SplitParticipant } from '@/lib/utils/split';
import { toBigNumber } from '@/lib/utils/format';
import { MAX_MEMBERS } from '@/lib/utils/validation';
import { cn } from '@/lib/utils/cn';

/**
 * Калькулятор разделения счёта.
 *
 * Суммы считаются в micro-единицах (bigint) и всегда дают ровно общий счёт:
 * округление остатка распределяется методом наибольших дробных частей
 * (см. `lib/utils/split.ts`). Поэтому доли можно напрямую класть в Anchor.
 */
export interface SplitCalculatorProps {
  total: string;
  currency: string;
  method: SplitMethod;
  onMethodChange: (method: SplitMethod) => void;
  participants: SplitParticipant[];
  onParticipantsChange: (participants: SplitParticipant[]) => void;
  className?: string;
}

export function SplitCalculator({
  total,
  currency,
  method,
  onMethodChange,
  participants,
  onParticipantsChange,
  className,
}: SplitCalculatorProps) {
  const result = useMemo(
    () => calculateSplit(total, method, participants),
    [total, method, participants],
  );

  const update = (index: number, patch: Partial<SplitParticipant>) => {
    const next = participants.map((person, i) => (i === index ? { ...person, ...patch } : person));
    onParticipantsChange(next);
  };

  const addParticipant = () => {
    if (participants.length >= MAX_MEMBERS) return;
    onParticipantsChange([
      ...participants,
      { id: `p-${Date.now()}-${participants.length}`, label: `Участник ${participants.length + 1}`, weight: 1 },
    ]);
  };

  const removeParticipant = (index: number) => {
    if (participants.length <= 1) return;
    onParticipantsChange(participants.filter((_, i) => i !== index));
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-solana-green" />
          Разделение счёта
        </CardTitle>
        <CardDescription>
          Суммы в минимальных единицах токена — так же, как они лежат в Anchor-программе.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="split-method">Способ разделения</Label>
          <Select value={method} onValueChange={(value) => onMethodChange(value as SplitMethod)}>
            <SelectTrigger id="split-method">
              <SelectValue placeholder="Выберите способ" />
            </SelectTrigger>
            <SelectContent>
              {SPLIT_METHODS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label} — {item.hint}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>
              <Users className="mr-1.5 inline h-3.5 w-3.5" />
              Участники
            </Label>
            <Badge variant="outline">
              {participants.length} / {MAX_MEMBERS}
            </Badge>
          </div>

          <ul className="space-y-2">
            {result.lines.map((line, index) => {
              const person = participants[index];
              if (!person) return null;

              return (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-secondary/30 p-2.5"
                >
                  <Input
                    value={person.label}
                    onChange={(event) => update(index, { label: event.target.value })}
                    placeholder="Имя"
                    aria-label={`Имя участника ${index + 1}`}
                    className="h-9 min-w-32 flex-1"
                  />

                  {method === 'percentage' ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={person.weight ?? 0}
                        onChange={(event) => update(index, { weight: Number(event.target.value) })}
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        aria-label={`Процент участника ${index + 1}`}
                        className="h-9 w-20 text-right font-mono"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  ) : null}

                  {method === 'shares' ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={person.weight ?? 1}
                        onChange={(event) => update(index, { weight: Number(event.target.value) })}
                        type="number"
                        min={1}
                        max={20}
                        step={1}
                        aria-label={`Доли участника ${index + 1}`}
                        className="h-9 w-20 text-right font-mono"
                      />
                      <span className="text-xs text-muted-foreground">долей</span>
                    </div>
                  ) : null}

                  {method === 'exact' ? (
                    <Input
                      value={person.amount ?? ''}
                      onChange={(event) => update(index, { amount: event.target.value })}
                      placeholder="0.00"
                      inputMode="decimal"
                      aria-label={`Сумма участника ${index + 1}`}
                      className="h-9 w-32 text-right font-mono"
                    />
                  ) : null}

                  <div className="ml-auto text-right">
                    <p className="tabular font-mono text-sm">
                      {line.amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0')}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {line.percentage.toFixed(1)}% · {line.micro.toString()} micro
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeParticipant(index)}
                    disabled={participants.length <= 1}
                    aria-label={`Удалить участника ${index + 1}`}
                    className="h-8 w-8 text-muted-foreground hover:text-error"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addParticipant}
            disabled={participants.length >= MAX_MEMBERS}
          >
            <Plus className="h-4 w-4" />
            Добавить участника
          </Button>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Сумма долей</span>
            <span className="tabular font-mono">
              {toBigNumber(result.totalMicro.toString())
                .shiftedBy(-6)
                .toFixed(6)}{' '}
              {currency}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Общий счёт</span>
            <span className="tabular font-mono">{toBigNumber(total).toFixed(6)} {currency}</span>
          </div>

          {result.isBalanced ? (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <Check className="h-3.5 w-3.5" />
              Сходится до единицы micro-unit — расчёт на блокчейне пройдёт
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {result.errors[0] ?? 'Сумма долей не равна счёту'}
            </p>
          )}

          {result.errors.length > 0 ? (
            <ul className={cn('space-y-1 text-xs text-error')}>
              {result.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default SplitCalculator;
