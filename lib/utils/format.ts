import BigNumber from 'bignumber.js';

// Финансовые расчёты — только BigNumber, никакого float (см. ТЗ, раздел «Технические требования»).
BigNumber.config({
  EXPONENTIAL_AT: [-40, 40],
  DECIMAL_PLACES: 24,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
});

export { BigNumber };

export const TOKEN_DECIMALS = 6;

export type AmountInput = BigNumber | string | number | bigint;

/** Приводит любой вход к BigNumber без потери точности. */
export function toBigNumber(value: AmountInput): BigNumber {
  if (value instanceof BigNumber) return value;
  if (typeof value === 'bigint') return new BigNumber(value.toString());
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return new BigNumber(0);
    return new BigNumber(value.toFixed(TOKEN_DECIMALS).replace(/0+$/, '').replace(/\.$/, ''));
  }
  return new BigNumber(value || '0');
}

/** Сумма в человеческих единицах → минимальные единицы токена (bigint). */
export function toMicroUnits(value: AmountInput, decimals: number = TOKEN_DECIMALS): bigint {
  return BigInt(
    toBigNumber(value)
      .shiftedBy(decimals)
      .integerValue(BigNumber.ROUND_DOWN)
      .toFixed(0),
  );
}

/** Минимальные единицы → человекочитаемая строка. */
export function fromMicroUnits(
  micro: bigint | string | number | null | undefined,
  decimals: number = TOKEN_DECIMALS,
): BigNumber {
  if (micro === null || micro === undefined || micro === '') return new BigNumber(0);
  return new BigNumber(micro.toString()).shiftedBy(-decimals);
}

/** Форматирование суммы токена: 1234.5 → "1 234.50". */
export function formatTokenAmount(
  value: AmountInput,
  decimals: number = TOKEN_DECIMALS,
  fractionDigits = 2,
): string {
  void decimals;
  return toBigNumber(value)
    .decimalPlaces(fractionDigits, BigNumber.ROUND_HALF_UP)
    .toFormat({ groupSeparator: ' ', decimalSeparator: '.', groupSize: 3, prefix: '', suffix: '' });
}

/** Форматирование суммы с символом: "1 234.50 tUSDC". */
export function formatToken(
  value: AmountInput,
  symbol = 'tUSDC',
  decimals: number = TOKEN_DECIMALS,
  fractionDigits = 2,
): string {
  const amount = toBigNumber(value);
  void decimals;
  return `${formatTokenAmount(amount, decimals, fractionDigits)} ${symbol}`;
}

/** Сумма из micro-единиц с символом. */
export function formatMicro(
  micro: bigint | string | null | undefined,
  symbol = 'tUSDC',
  decimals: number = TOKEN_DECIMALS,
  fractionDigits = 2,
): string {
  return formatToken(fromMicroUnits(micro ?? 0, decimals), symbol, decimals, fractionDigits);
}

/** Строка вида "$1 234.50" — tUSDC и есть тестовый доллар. */
export function formatUsd(value: AmountInput, fractionDigits = 2): string {
  return `$${formatTokenAmount(value, TOKEN_DECIMALS, fractionDigits)}`;
}

/** Сокращение длинного base58-адреса: "7xKX…gAsU". */
export function shortAddress(address: string | null | undefined, lead = 4, tail = 4): string {
  if (!address) return '—';
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Сокращение base58 в середине для TX-сигнатур (они длиннее адресов). */
export function shortSignature(signature: string | null | undefined): string {
  return shortAddress(signature, 6, 6);
}

/** Ссылка на Solana Explorer с правильным кластером. */
export function explorerTxUrl(signature: string, cluster = 'devnet'): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export function explorerAddressUrl(address: string, cluster = 'devnet'): string {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

/** Процент прогресса 0..100. */
export function percentOf(part: AmountInput, whole: AmountInput): number {
  const denominator = toBigNumber(whole);
  if (denominator.isZero()) return 0;
  return toBigNumber(part).dividedBy(denominator).multipliedBy(100).toNumber();
}

/** Форматирование даты в локализованном виде. */
export function formatDate(value: string | number | Date | null | undefined, locale = 'ru-RU'): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | number | Date | null | undefined, locale = 'ru-RU'): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** «5 минут назад» / «вчера» — для ленты активности. */
export function formatRelativeTime(value: string | number | Date, locale = 'ru-RU'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 1) return 'только что';
  if (Math.abs(diffMinutes) < 60) return rtf.format(-diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(-diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return rtf.format(-diffDays, 'day');
  return formatDate(date, locale);
}

/** Склонение существительных: 1 участник / 2 участника / 5 участников. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 > 10 && mod100 < 20) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/**
 * Безопасный доступ к точности токена.
 *
 * Нужен в server-компонентах и API-роутах, где не хочется тянуть весь
 * Solana-стек только ради одной константы.
 */
export function getTestTokenDecimalsSafe(): number {
  const raw = process.env.NEXT_PUBLIC_TEST_TOKEN_DECIMALS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 18 ? parsed : TOKEN_DECIMALS;
}
