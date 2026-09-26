import { encodeURL } from '@solana/pay';
import { createTransferCheckedInstruction } from '@solana/spl-token';
import BigNumber from 'bignumber.js';
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { TransactionInstruction } from '@solana/web3.js';
import { MEMO_PROGRAM_ID, getTestTokenSymbol, isTestTokenConfigured, requireTestTokenMint } from './constants';

/**
 * Solana Pay — генерация ссылок и QR для оплаты доли с мобильного.
 *
 * Важный нюанс: tUSDC имеет 6 знаков после запятой, а кошельки переводят
 * сумму из URL в минимальные единицы через float (`amount * 10^decimals`) и
 * округляют вниз. Поэтому платёж по QR может прийти на 1 micro-unit меньше
 * ожидаемого — верификация принимает эту погрешность (см. `lib/solana/verify.ts`),
 * а Anchor-путь (`payShare`) остаётся точным до единицы.
 */

// `@solana/pay` v1 типизирован через брендированные типы @solana/kit, поэтому
// берём параметры из сигнатуры encodeURL, а не импортируем @solana/kit напрямую.
type PayUrlParams = Extract<Parameters<typeof encodeURL>[0], { recipient: unknown }>;
type PayRecipient = PayUrlParams['recipient'];
type PayAmount = NonNullable<PayUrlParams['amount']>;
type PaySplToken = NonNullable<PayUrlParams['splToken']>;
type PayReference = NonNullable<PayUrlParams['reference']>;

export interface BuildPaymentUrlParams {
  recipient: PublicKey;
  /** Сумма в человеческих единицах, например "10.5" */
  amount: string | number;
  /** Уникальный reference-ключ для верификации платежа */
  reference?: PublicKey | null;
  label?: string;
  message?: string;
  /** memo — используется как id группы в БД */
  memo?: string;
}

/** Новый reference-ключ. Секрет хранится только у отправителя платежа. */
export function createReferenceKeypair(): Keypair {
  return Keypair.generate();
}

/**
 * Ссылка `solana:<recipient>?...` с нашим mint'ом tUSDC.
 * Токен передаётся явно, иначе кошелёк предложит оплату в SOL.
 */
export function buildPaymentUrl(params: BuildPaymentUrlParams): URL {
  if (!isTestTokenConfigured()) {
    throw new Error('Mint тестового токена не настроен (NEXT_PUBLIC_TEST_TOKEN_MINT).');
  }

  const amount = new BigNumber(params.amount.toString());
  if (!amount.isFinite() || amount.isLessThanOrEqualTo(0)) {
    throw new Error('Сумма платежа должна быть больше нуля');
  }

  return encodeURL({
    recipient: params.recipient.toBase58() as PayRecipient,
    amount: amount.toNumber() as PayAmount,
    splToken: requireTestTokenMint().toBase58() as PaySplToken,
    reference: params.reference ? (params.reference.toBase58() as PayReference) : undefined,
    label: params.label ?? 'SplitSOL',
    message: params.message ?? 'Оплата доли в группе SplitSOL',
    memo: params.memo,
  });
}

/** Deeplink `solana:https://...` — открывает кошелёк. */
export function toWalletDeeplink(url: URL): string {
  return `solana:${url.toString()}`;
}

/**
 * SPL Memo вручную: в `@solana/spl-token` 0.4 memo-инструкции вынесены в
 * отдельный пакет, а тянуть ещё одну зависимость ради одной инструкции
 * нецелесообразно. Формат: [u32 length][utf-8 bytes].
 */
export function createMemoInstruction(memo: string): TransactionInstruction {
  const data = Buffer.alloc(4 + Buffer.byteLength(memo, 'utf8'));
  data.writeUInt32LE(Buffer.byteLength(memo, 'utf8'), 0);
  Buffer.from(memo, 'utf8').copy(data, 4);

  return new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data });
}

/**
 * Запасной путь без Solana Pay: SPL TransferChecked + memo одной транзакцией.
 * `signTransaction` обычно берётся из `useWallet()`.
 */
export async function buildDirectTransferTransaction(params: {
  from: PublicKey;
  fromTokenAccount: PublicKey;
  toTokenAccount: PublicKey;
  mint: PublicKey;
  /** Сумма в минимальных единицах токена */
  amount: bigint;
  decimals: number;
  memo?: string;
  recentBlockhash: string;
}): Promise<Transaction> {
  const instructions = [
    createTransferCheckedInstruction(
      params.from,
      params.mint,
      params.toTokenAccount,
      params.from,
      params.amount,
      params.decimals,
    ),
  ];

  if (params.memo) {
    instructions.push(createMemoInstruction(params.memo));
  }

  const transaction = new Transaction({
    feePayer: params.from,
    recentBlockhash: params.recentBlockhash,
  });
  transaction.add(...instructions);
  return transaction;
}

/** Локальная сборка транзакции перевода SOL (для выплат в SOL). */
export function buildSolTransferTransaction(params: {
  from: PublicKey;
  to: PublicKey;
  lamports: bigint;
  recentBlockhash: string;
}): Transaction {
  const transaction = new Transaction({
    feePayer: params.from,
    recentBlockhash: params.recentBlockhash,
  });
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: params.from,
      toPubkey: params.to,
      lamports: Number(params.lamports),
    }),
  );
  return transaction;
}

export { getTestTokenSymbol };
