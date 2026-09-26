import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_DECIMALS } from './format';

export const MAX_MEMBERS = 10;

/** Валидация base58-адреса Solana через конструктор PublicKey. */
export function isValidSolanaAddress(value: string): boolean {
  try {
    const key = new PublicKey(value.trim());
    return PublicKey.isOnCurve(key.toBytes()) || true; // ATA для PDA лежит вне кривой — не фильтруем
  } catch {
    return false;
  }
}

export const solanaAddressSchema = z
  .string()
  .trim()
  .min(32, 'Адрес слишком короткий')
  .max(44, 'Адрес слишком длинный')
  .refine(isValidSolanaAddress, 'Некорректный base58-адрес Solana');

/** Сумма в человеческих единицах: до 6 знаков после точки, без float. */
export const tokenAmountSchema = z
  .string()
  .trim()
  .min(1, 'Введите сумму')
  .refine((value) => /^\d+(\.\d{1,6})?$/.test(value), 'Только числа, максимум 6 знаков после запятой')
  .refine((value) => Number(value) > 0, 'Сумма должна быть больше нуля');

export const groupCategorySchema = z.enum(['restaurant', 'travel', 'shopping', 'other']);
export type GroupCategoryInput = z.infer<typeof groupCategorySchema>;

export const splitMethodSchema = z.enum(['equal', 'percentage', 'shares', 'exact']);
export type SplitMethodInput = z.infer<typeof splitMethodSchema>;

export const participantSchema = z.object({
  label: z.string().trim().min(1, 'Укажите имя участника').max(60, 'Слишком длинное имя'),
  wallet: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || isValidSolanaAddress(value), 'Некорректный адрес кошелька'),
  weight: z.coerce.number().min(0).max(100).optional(),
  amount: z.string().optional(),
});

export type ParticipantInput = z.infer<typeof participantSchema>;

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(3, 'Минимум 3 символа').max(80, 'Максимум 80 символов'),
    description: z.string().trim().max(400, 'Максимум 400 символов').optional().or(z.literal('')),
    category: groupCategorySchema.default('other'),
    totalAmount: tokenAmountSchema,
    currency: z.enum(['tUSDC', 'SOL']).default('tUSDC'),
    recipient: solanaAddressSchema,
    splitMethod: splitMethodSchema.default('equal'),
    participants: z
      .array(participantSchema)
      .min(1, 'Добавьте хотя бы одного участника')
      .max(MAX_MEMBERS, `Максимум ${MAX_MEMBERS} участников`),
  })
  .superRefine((data, ctx) => {
    const hasWallet = data.participants.some((person) => Boolean(person.wallet));
    if (!hasWallet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['participants'],
        message: 'Хотя бы у одного участника должен быть кошелёк — он оплачивает on-chain',
      });
    }
  });

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

/** Схема формы создания группы (без участников — они в отдельном калькуляторе). */
export const groupFormSchema = z.object({
  name: z.string().trim().min(3, 'Минимум 3 символа').max(80, 'Максимум 80 символов'),
  description: z.string().trim().max(400, 'Максимум 400 символов'),
  category: groupCategorySchema,
  totalAmount: tokenAmountSchema,
  recipient: solanaAddressSchema,
});

export type GroupFormValues = z.infer<typeof groupFormSchema>;

export const joinGroupSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, 'Код приглашения слишком короткий')
    .max(16, 'Код приглашения слишком длинный')
    .regex(/^[A-Z0-9]+$/i, 'Код может содержать только латиницу и цифры'),
  shareAmount: tokenAmountSchema.optional(),
});

export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Минимум 3 символа')
    .max(24, 'Максимум 24 символа')
    .regex(/^[a-zA-Z0-9_]+$/, 'Только латиница, цифры и подчёркивание')
    .optional()
    .or(z.literal('')),
  displayName: z.string().trim().max(60, 'Максимум 60 символов').optional().or(z.literal('')),
  walletAddress: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || isValidSolanaAddress(value), 'Некорректный адрес кошелька'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s\-()]{6,20}$/, 'Некорректный номер телефона')
    .optional()
    .or(z.literal('')),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const airdropSchema = z.object({
  recipient: solanaAddressSchema,
  amount: z.coerce.number().int().min(1).max(10_000).default(100),
});

export const verifyTransactionSchema = z.object({
  signature: z.string().trim().min(64, 'Некорректная подпись транзакции').max(120),
  groupId: z.string().uuid(),
  memberId: z.string().uuid(),
});

/** Разбор формы с Zod и.flatten() ошибок в формат { поле: сообщение }. */
export function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

export { TOKEN_DECIMALS };
