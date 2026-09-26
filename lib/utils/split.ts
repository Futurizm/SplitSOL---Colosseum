import BigNumber from 'bignumber.js';
import { toBigNumber, toMicroUnits, fromMicroUnits, TOKEN_DECIMALS } from './format';

/**
 * Алгоритмы разделения счёта.
 *
 * Ключевое свойство: сумма микро-единиц по всем участникам **всегда точно**
 * равна общей сумме счёта. Остаток от округления (меньше 1 micro-unit на
 * участника) распределяется по методу наибольших дробных частей, поэтому
 * on-chain расчёт никогда не падает с `AmountOverflow`.
 */

export type SplitMethod = 'equal' | 'percentage' | 'shares' | 'exact';

export interface SplitParticipant {
  id: string;
  label: string;
  /** Кошелёк участника — нужен, чтобы оплатить on-chain. */
  wallet?: string;
  /** Метод `shares`: количество долей (по умолчанию 1). Метод `percentage`: процент. */
  weight?: number;
  /** Метод `exact`: точная доля в человеческих единицах. */
  amount?: string;
}

export interface SplitLine {
  id: string;
  label: string;
  /** Сумма в человеческих единицах. */
  amount: BigNumber;
  /** Сумма в минимальных единицах токена. */
  micro: bigint;
  /** Доля в процентах от общего счёта. */
  percentage: BigNumber;
}

export interface SplitResult {
  lines: SplitLine[];
  total: BigNumber;
  totalMicro: bigint;
  /** Всегда 0 при корректном расчёте. */
  remainder: bigint;
  /** true, если сумма долей равна общему счёту. */
  isBalanced: boolean;
  errors: string[];
}

export const SPLIT_METHODS: { value: SplitMethod; label: string; hint: string }[] = [
  { value: 'equal', label: 'Поровну', hint: 'Одинаковая доля для всех участников' },
  { value: 'percentage', label: 'По проценту', hint: 'Каждый задаёт свой процент от счёта' },
  { value: 'shares', label: 'По долям', hint: 'Взвешенно: 1 доля, 2 доли, 3 доли…' },
  { value: 'exact', label: 'Точные суммы', hint: 'Ручной ввод суммы для каждого' },
];

const MAX_PARTICIPANTS = 10;

function floorBig(value: BigNumber): bigint {
  return BigInt(value.integerValue(BigNumber.ROUND_DOWN).toFixed(0));
}

/** Распределяет `total` пропорционально `weights` без потери единиц. */
function distributeByWeights(total: BigNumber, weights: number[]): bigint[] {
  const totalMicro = toMicroUnits(total);
  const weightSum = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);

  if (weightSum <= 0 || totalMicro === 0n) {
    return weights.map(() => 0n);
  }

  const totalWeight = new BigNumber(weightSum);
  const exact = weights.map((weight) =>
    new BigNumber(totalMicro.toString()).multipliedBy(Math.max(0, weight)).div(totalWeight),
  );
  const base = exact.map(floorBig);
  const fractions = exact.map((value, index) => ({
    index,
    fraction: value.minus(new BigNumber(base[index]!.toString())),
  }));

  const assigned = base.reduce<bigint>((sum, value) => sum + value, 0n);
  let leftover = totalMicro - assigned;

  // Метод наибольших дробных частей; при равенстве — меньший индекс (детерминированно).
  fractions.sort((a, b) => {
    const diff = b.fraction.comparedTo(a.fraction) ?? 0;
    return diff !== 0 ? diff : a.index - b.index;
  });

  const result = [...base];
  let cursor = 0;
  while (leftover > 0n && fractions.length > 0) {
    const { index } = fractions[cursor % fractions.length]!;
    result[index] = result[index]! + 1n;
    leftover -= 1n;
    cursor += 1;
  }

  return result;
}

/**
 * Основная точка входа: считает доли участников.
 *
 * @param total      общая сумма счёта в человеческих единицах
 * @param method     режим разделения
 * @param people     участники (максимум 10 — ограничение Anchor-программы)
 */
export function calculateSplit(
  total: BigNumber | string | number,
  method: SplitMethod,
  people: SplitParticipant[],
  decimals: number = TOKEN_DECIMALS,
): SplitResult {
  const totalAmount = toBigNumber(total);
  const totalMicro = toMicroUnits(totalAmount, decimals);
  const errors: string[] = [];

  if (people.length === 0) {
    return { lines: [], total: totalAmount, totalMicro, remainder: 0n, isBalanced: false, errors: ['Добавьте хотя бы одного участника'] };
  }
  if (people.length > MAX_PARTICIPANTS) {
    errors.push(`Максимум ${MAX_PARTICIPANTS} участников в группе`);
  }
  if (totalAmount.lte(0)) {
    errors.push('Сумма счёта должна быть больше нуля');
  }

  let micros: bigint[] = [];

  switch (method) {
    case 'exact': {
      micros = people.map((person) => {
        const raw = person.amount ?? '0';
        const value = toBigNumber(raw);
        if (value.isNegative()) errors.push(`Доля «${person.label}» не может быть отрицательной`);
        return value.isNegative() ? 0n : toMicroUnits(value, decimals);
      });
      break;
    }
    case 'percentage': {
      const weights = people.map((person) => {
        const weight = Number(person.weight ?? 0);
        if (weight < 0) errors.push(`Процент «${person.label}» не может быть отрицательным`);
        return Math.max(0, weight);
      });
      const percentSum = weights.reduce((sum, weight) => sum + weight, 0);
      if (Math.round(percentSum) !== 100) {
        errors.push(`Сумма процентов должна быть 100 (сейчас ${percentSum})`);
      }
      micros = distributeByWeights(totalAmount, weights);
      break;
    }
    case 'shares': {
      micros = distributeByWeights(
        totalAmount,
        people.map((person) => (person.weight && person.weight > 0 ? person.weight : 1)),
      );
      break;
    }
    case 'equal':
    default: {
      micros = distributeByWeights(
        totalAmount,
        people.map(() => 1),
      );
      break;
    }
  }

  const sumMicro = micros.reduce<bigint>((sum, value) => sum + value, 0n);
  const remainder = method === 'exact' ? 0n : totalMicro - sumMicro;
  const isBalanced = method === 'exact' ? sumMicro === totalMicro : remainder === 0n;

  if (method === 'exact' && sumMicro !== totalMicro) {
    errors.push(
      `Сумма долей (${fromMicroUnits(sumMicro, decimals).toFixed(6)}) не равна счёту (${totalAmount.toFixed(6)})`,
    );
  }

  const lines: SplitLine[] = people.map((person, index) => {
    const micro = micros[index]!;
    return {
      id: person.id,
      label: person.label,
      micro,
      amount: fromMicroUnits(micro, decimals),
      percentage: totalMicro === 0n
        ? new BigNumber(0)
        : new BigNumber(micro.toString()).div(totalMicro.toString()).multipliedBy(100),
    };
  });

  return { lines, total: totalAmount, totalMicro, remainder, isBalanced, errors };
}

/** Удобная обёртка: равное разделение. */
export function calculateEqualSplit(total: BigNumber | string | number, count: number) {
  return calculateSplit(total, 'equal', Array.from({ length: Math.max(0, count) }, (_, index) => ({
    id: `member-${index + 1}`,
    label: `Участник ${index + 1}`,
  })));
}

/**
 * Раскладывает сумму на `count` частей, возвращая остаток,
 * который нужно добавить к первой части. Удобно для визуализации.
 */
export function splitIntoChunks(total: bigint, count: number): bigint[] {
  if (count <= 0) return [];
  const base = total / BigInt(count);
  const rest = total % BigInt(count);
  return Array.from({ length: count }, (_, index) => base + (BigInt(index) < rest ? 1n : 0n));
}
