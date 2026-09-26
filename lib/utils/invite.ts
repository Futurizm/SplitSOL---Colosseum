import { customAlphabet } from 'nanoid';

/**
 * Короткий код приглашения группы.
 *
 * Алфавит без похожих символов (0/O, 1/I/L) — код диктуется по телефону.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const nanoidCustom = customAlphabet(ALPHABET, 8);

/** Например, «K7M2XQ9P». */
export function generateInviteCode(): string {
  return nanoidCustom();
}

/** Проверка формата кода приглашения. */
export function isValidInviteCode(code: string): boolean {
  return /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4,16}$/.test(code.trim().toUpperCase());
}

/** Ссылка-приглашение для QR и мессенджеров. */
export function inviteLink(code: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/join/${code}`;
}
