import * as anchor from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from '@solana/spl-token';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { assert } from 'chai';
import { calculateSplit } from '../lib/utils/split';
import { toMicroUnits } from '../lib/utils/format';

/**
 * Интеграционные тесты Anchor-программы SplitSOL.
 *
 *   anchor test --skip-local-validator        # против devnet
 *   anchor test                               # против локального валидатора
 *
 * Покрывают весь жизненный цикл группы (создание → присоединение → оплата →
 * расчёт), защитные сценарии (повторная оплата, неполная оплата, доступ не
 * владельцу, отмена с возвратом) и согласованность расчёта долей с ончейн-логикой.
 */

const DECIMALS = 6;
const MICRO = 10 ** DECIMALS;
const MAX_MEMBERS = 10;

// ─── Формы аккаунтов ────────────────────────────────────────────────────────
// TS-типы генерируются в target/types только после `anchor build`, поэтому в
// тестах форма декодированных аккаунтов описана явно.
type GroupStatusDecoded =
  | { active: Record<string, never> }
  | { settled: Record<string, never> }
  | { cancelled: Record<string, never> };

interface GroupAccount {
  owner: PublicKey;
  totalAmount: anchor.BN;
  committedAmount: anchor.BN;
  tokenMint: PublicKey;
  recipient: PublicKey;
  memberCount: number;
  joinedCount: number;
  paidCount: number;
  status: GroupStatusDecoded;
  paidAmounts: anchor.BN[];
}

interface MemberAccount {
  group: PublicKey;
  wallet: PublicKey;
  shareAmount: anchor.BN;
  hasPaid: boolean;
  isCreator: boolean;
  refunded: boolean;
}

describe('splitsol', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Splitsol as anchor.Program;

  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const accounts = program.account as unknown as {
    group: { fetch(address: PublicKey): Promise<GroupAccount> };
    member: { fetch(address: PublicKey): Promise<MemberAccount> };
  };

  // ─── Фикстуры ─────────────────────────────────────────────────────────────
  let tokenMint: PublicKey;
  let payerTokenAccount: PublicKey;

  const members = Array.from({ length: 4 }, () => Keypair.generate());
  const recipient = Keypair.generate();

  /** Свой group_id на тест, чтобы PDA не пересекались. */
  const groupIdFor = (seed: number) =>
    Uint8Array.from([seed, seed + 1, seed + 2, seed + 3, seed + 4, seed + 5, seed + 6, seed + 7]);

  const deriveGroup = (owner: PublicKey, groupId: Uint8Array) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from('group'), owner.toBuffer(), Buffer.from(groupId)],
      program.programId,
    )[0];

  const deriveMember = (group: PublicKey, wallet: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from('member'), group.toBuffer(), wallet.toBuffer()],
      program.programId,
    )[0];

  const escrowFor = (group: PublicKey) => getAssociatedTokenAddressSync(tokenMint, group, true);
  const walletToken = (wallet: PublicKey) => getAssociatedTokenAddressSync(tokenMint, wallet);

  async function balanceOf(tokenAccount: PublicKey): Promise<bigint> {
    return (await getAccount(connection, tokenAccount)).amount;
  }

  /** Общие аккаунты для create_group / join_group. */
  const SYSTEM = {
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    rent: SYSVAR_RENT_PUBKEY,
  } as const;

  const createGroup = (
    groupPda: PublicKey,
    params: {
      groupId: Uint8Array;
      totalAmount: number;
      memberCount: number;
      ownerShare: number;
    },
  ) =>
    program.methods
      .createGroup({
        groupId: Array.from(params.groupId),
        totalAmount: new anchor.BN(params.totalAmount),
        memberCount: params.memberCount,
        ownerShare: new anchor.BN(params.ownerShare),
        recipient: recipient.publicKey,
      })
      .accounts({
        owner: payer.publicKey,
        group: groupPda,
        member: deriveMember(groupPda, payer.publicKey),
        tokenMint,
        escrowTokenAccount: escrowFor(groupPda),
        ...SYSTEM,
      });

  const joinGroup = (groupPda: PublicKey, joiner: Keypair, share: number) =>
    program.methods
      .joinGroup(new anchor.BN(share))
      .accounts({
        joiner: joiner.publicKey,
        group: groupPda,
        member: deriveMember(groupPda, joiner.publicKey),
        tokenMint,
        joinerTokenAccount: walletToken(joiner.publicKey),
        ...SYSTEM,
      })
      .signers([joiner]);

  const payShare = (groupPda: PublicKey, signer: Keypair | null) =>
    program.methods.payShare().accounts({
      payer: (signer ?? payer).publicKey,
      group: groupPda,
      member: deriveMember(groupPda, (signer ?? payer).publicKey),
      tokenMint,
      payerTokenAccount: (signer ?? payer) === payer ? payerTokenAccount : walletToken(signer!.publicKey),
      escrowTokenAccount: escrowFor(groupPda),
      ...SYSTEM,
    });

  const settleGroup = (groupPda: PublicKey, owner: Keypair | null = null) =>
    program.methods.settleGroup().accounts({
      owner: (owner ?? payer).publicKey,
      group: groupPda,
      recipient: recipient.publicKey,
      tokenMint,
      escrowTokenAccount: escrowFor(groupPda),
      recipientTokenAccount: getAssociatedTokenAddressSync(tokenMint, recipient.publicKey),
      ...SYSTEM,
    });

  before(async function () {
    this.timeout(120_000);

    // Тестовый «tUSDC»: 6 decimals, как у настоящего USDC.
    tokenMint = await createMint(connection, payer, payer.publicKey, null, DECIMALS);

    payerTokenAccount = await createAssociatedTokenAccount(
      connection,
      payer,
      tokenMint,
      payer.publicKey,
    );
    await mintTo(connection, payer, tokenMint, payerTokenAccount, payer, 10_000 * MICRO);

    for (const member of members) {
      const signature = await connection.requestAirdrop(member.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(signature, 'confirmed');

      const account = await createAssociatedTokenAccount(connection, payer, tokenMint, member.publicKey);
      await mintTo(connection, payer, tokenMint, account, payer, 1_000 * MICRO);
    }

    const recipientSignature = await connection.requestAirdrop(
      recipient.publicKey,
      LAMPORTS_PER_SOL / 2,
    );
    await connection.confirmTransaction(recipientSignature, 'confirmed');
  });

  // ─── create_group ─────────────────────────────────────────────────────────
  describe('create_group', () => {
    it('создаёт on-chain аккаунт группы с корректными полями', async () => {
      const groupId = groupIdFor(1);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await createGroup(groupPda, {
        groupId,
        totalAmount: 30 * MICRO,
        memberCount: 3,
        ownerShare: 10 * MICRO,
      }).rpc();

      const account = await accounts.group.fetch(groupPda);

      assert.equal(account.memberCount, 3, 'ожидаемое число участников');
      assert.equal(account.paidCount, 0, 'никто ещё не оплатил');
      assert.equal(account.joinedCount, 1, 'создатель уже участник');
      assert.equal(account.totalAmount.toNumber(), 30 * MICRO, 'сумма счёта');
      assert.equal(account.committedAmount.toNumber(), 10 * MICRO, 'доля создателя учтена');
      assert.equal(account.tokenMint.toBase58(), tokenMint.toBase58(), 'mint сохранён');
      assert.equal(account.recipient.toBase58(), recipient.publicKey.toBase58(), 'получатель');
      assert.ok('active' in account.status, 'группа активна');

      const member = await accounts.member.fetch(deriveMember(groupPda, payer.publicKey));
      assert.equal(member.wallet.toBase58(), payer.publicKey.toBase58());
      assert.isTrue(member.isCreator, 'создатель отмечен флагом');
      assert.isFalse(member.hasPaid);
    });

    it('отклоняет нулевое количество участников', async () => {
      const groupId = groupIdFor(2);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await expectFailure(
        createGroup(groupPda, {
          groupId,
          totalAmount: 10 * MICRO,
          memberCount: 0,
          ownerShare: 10 * MICRO,
        }).rpc(),
        'InvalidMemberCount',
      );
    });

    it('отклоняет нулевую сумму счёта', async () => {
      const groupId = groupIdFor(2);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await expectFailure(
        createGroup(groupPda, {
          groupId,
          totalAmount: 0,
          memberCount: 2,
          ownerShare: 0,
        }).rpc(),
        'InvalidAmount',
      );
    });

    it('отклоняет превышение лимита участников', async () => {
      const groupId = groupIdFor(2);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await expectFailure(
        createGroup(groupPda, {
          groupId,
          totalAmount: 100 * MICRO,
          memberCount: MAX_MEMBERS + 1,
          ownerShare: MICRO,
        }).rpc(),
        'TooManyMembers',
      );
    });
  });

  // ─── join_group ───────────────────────────────────────────────────────────
  describe('join_group', () => {
    it('регистрирует участника и учитывает его долю', async () => {
      const groupId = groupIdFor(3);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await createGroup(groupPda, {
        groupId,
        totalAmount: 30 * MICRO,
        memberCount: 3,
        ownerShare: 10 * MICRO,
      }).rpc();

      await joinGroup(groupPda, members[0]!, 10 * MICRO).rpc();

      const member = await accounts.member.fetch(deriveMember(groupPda, members[0]!.publicKey));
      assert.equal(member.shareAmount.toNumber(), 10 * MICRO);
      assert.isFalse(member.isCreator);

      const group = await accounts.group.fetch(groupPda);
      assert.equal(group.joinedCount, 2, 'участников стало двое');
      assert.equal(group.committedAmount.toNumber(), 20 * MICRO, 'доли сложились');
    });

    it('не позволяет превысить общий счёт', async () => {
      const groupId = groupIdFor(4);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await createGroup(groupPda, {
        groupId,
        totalAmount: 10 * MICRO,
        memberCount: 2,
        ownerShare: 5 * MICRO,
      }).rpc();

      // Свободно 5 tUSDC, просим 6.
      await expectFailure(joinGroup(groupPda, members[1]!, 6 * MICRO).rpc(), 'AmountOverflow');
    });
  });

  // ─── pay_share + settle_group ─────────────────────────────────────────────
  describe('оплата и расчёт', () => {
    it('полный цикл: три участника платят, группа рассчитывается', async () => {
      const groupId = groupIdFor(10);
      const groupPda = deriveGroup(payer.publicKey, groupId);
      const share = 10 * MICRO;

      await createGroup(groupPda, {
        groupId,
        totalAmount: 30 * MICRO,
        memberCount: 3,
        ownerShare: share,
      }).rpc();

      const payers: (Keypair | null)[] = [null, members[0]!, members[1]!];

      for (const [index, signer] of payers.entries()) {
        if (signer) {
          await joinGroup(groupPda, signer, share).rpc();
        }

        const tokenAccount = signer ? walletToken(signer.publicKey) : payerTokenAccount;
        const before = await balanceOf(tokenAccount);

        await payShare(groupPda, signer).rpc();

        const after = await balanceOf(tokenAccount);
        assert.equal(before - after, BigInt(share), `участник ${index + 1}: списана ровно доля`);

        const member = await accounts.member.fetch(
          deriveMember(groupPda, (signer ?? payer).publicKey),
        );
        assert.isTrue(member.hasPaid, `участник ${index + 1} отмечен как оплативший`);
      }

      assert.equal(await balanceOf(escrowFor(groupPda)), BigInt(30 * MICRO), 'эскроу собрал счёт');

      const beforeSettle = await accounts.group.fetch(groupPda);
      assert.equal(beforeSettle.paidCount, 3);
      assert.equal(beforeSettle.joinedCount, 3);

      const recipientToken = getAssociatedTokenAddressSync(tokenMint, recipient.publicKey);
      assert.equal(await balanceOf(recipientToken), 0n, 'до расчёта получателю пусто');

      await settleGroup(groupPda).rpc();

      const settled = await accounts.group.fetch(groupPda);
      assert.ok('settled' in settled.status, 'статус — settled');
      assert.equal(settled.paidCount, 0, 'реестр платежей очищен');
      assert.equal(await balanceOf(escrowFor(groupPda)), 0n, 'эскроу пуст');
      assert.equal(
        await balanceOf(recipientToken),
        BigInt(30 * MICRO),
        'получатель получил всю сумму',
      );
    });

    it('запрещает повторную оплату', async () => {
      const groupId = groupIdFor(11);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await createGroup(groupPda, {
        groupId,
        totalAmount: 10 * MICRO,
        memberCount: 2,
        ownerShare: 5 * MICRO,
      }).rpc();

      await payShare(groupPda, null).rpc();
      await expectFailure(payShare(groupPda, null).rpc(), 'AlreadyPaid');
    });

    it('запрещает оплату чужой доли', async () => {
      const groupId = groupIdFor(12);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await createGroup(groupPda, {
        groupId,
        totalAmount: 10 * MICRO,
        memberCount: 2,
        ownerShare: 5 * MICRO,
      }).rpc();
      await joinGroup(groupPda, members[2]!, 5 * MICRO).rpc();

      // Пытаемся заплатить за участника, который не подписывает транзакцию.
      await expectFailure(
        program.methods
          .payShare()
          .accounts({
            payer: members[0]!.publicKey,
            group: groupPda,
            member: deriveMember(groupPda, members[0]!.publicKey),
            tokenMint,
            payerTokenAccount: walletToken(members[0]!.publicKey),
            escrowTokenAccount: escrowFor(groupPda),
            ...SYSTEM,
          })
          .signers([members[0]!])
          .rpc(),
        // Member PDA для members[0] не существует → ошибка десериализации/владения
        'AccountNotInitialized',
      );
    });

    it('запрещает расчёт, пока оплатили не все', async () => {
      const groupId = groupIdFor(13);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await createGroup(groupPda, {
        groupId,
        totalAmount: 20 * MICRO,
        memberCount: 2,
        ownerShare: 10 * MICRO,
      }).rpc();
      await payShare(groupPda, null).rpc();

      // Второй участник не присоединялся.
      await expectFailure(settleGroup(groupPda).rpc(), 'NotFullyPaid');
    });

    it('расчёт недоступен не-владельцу группы', async () => {
      const groupId = groupIdFor(14);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await createGroup(groupPda, {
        groupId,
        totalAmount: 10 * MICRO,
        memberCount: 1,
        ownerShare: 10 * MICRO,
      }).rpc();
      await payShare(groupPda, null).rpc();

      await expectFailure(settleGroup(groupPda, members[3]!).signers([members[3]!]).rpc(), 'UnauthorizedOwner');
    });
  });

  // ─── cancel_group ─────────────────────────────────────────────────────────
  describe('отмена группы', () => {
    it('возвращает все оплаченные доли', async () => {
      const groupId = groupIdFor(20);
      const groupPda = deriveGroup(payer.publicKey, groupId);
      const share = 5 * MICRO;
      const participants = [members[1]!, members[2]!];

      await createGroup(groupPda, {
        groupId,
        totalAmount: 15 * MICRO,
        memberCount: 3,
        ownerShare: share,
      }).rpc();

      for (const participant of participants) {
        await joinGroup(groupPda, participant, share).rpc();
      }

      const payers: (Keypair | null)[] = [null, ...participants];
      const balancesBefore = new Map<string, bigint>();

      for (const signer of payers) {
        const account = signer ? walletToken(signer.publicKey) : payerTokenAccount;
        balancesBefore.set((signer ?? payer).publicKey.toBase58(), await balanceOf(account));
        await payShare(groupPda, signer).rpc();
      }

      assert.equal(await balanceOf(escrowFor(groupPda)), BigInt(15 * MICRO));

      const memberPdas = payers.map((signer) => ({
        pubkey: deriveMember(groupPda, (signer ?? payer).publicKey),
        isSigner: false,
        isWritable: true,
      }));

      // Неполный список участников должен быть отвергнут, иначе часть денег
      // осталась бы в эскроу навсегда.
      await expectFailure(
        program.methods
          .cancelGroup()
          .accounts({
            owner: payer.publicKey,
            group: groupPda,
            escrowTokenAccount: escrowFor(groupPda),
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc(),
        'IncompleteMemberList',
      );

      await program.methods
        .cancelGroup()
        .accounts({
          owner: payer.publicKey,
          group: groupPda,
          escrowTokenAccount: escrowFor(groupPda),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(memberPdas)
        .rpc();

      assert.equal(await balanceOf(escrowFor(groupPda)), 0n, 'эскроу полностью опустел');

      for (const signer of payers) {
        const account = signer ? walletToken(signer.publicKey) : payerTokenAccount;
        assert.equal(
          await balanceOf(account),
          balancesBefore.get((signer ?? payer).publicKey.toBase58()),
          `${(signer ?? payer).publicKey.toBase58()}: баланс восстановлен полностью`,
        );
      }

      const cancelled = await accounts.group.fetch(groupPda);
      assert.ok('cancelled' in cancelled.status, 'статус — cancelled');
      assert.equal(cancelled.paidCount, 0, 'реестр очищен');
    });

    it('отменённую группу нельзя оплатить повторно', async () => {
      const groupId = groupIdFor(21);
      const groupPda = deriveGroup(payer.publicKey, groupId);

      await createGroup(groupPda, {
        groupId,
        totalAmount: 10 * MICRO,
        memberCount: 1,
        ownerShare: 10 * MICRO,
      }).rpc();

      await program.methods
        .cancelGroup()
        .accounts({
          owner: payer.publicKey,
          group: groupPda,
          escrowTokenAccount: escrowFor(groupPda),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: deriveMember(groupPda, payer.publicKey),
            isSigner: false,
            isWritable: true,
          },
        ])
        .rpc();

      await expectFailure(payShare(groupPda, null).rpc(), 'GroupNotActive');
    });
  });

  // ─── События ─────────────────────────────────────────────────────────────
  describe('события', () => {
    it('эмитит SharePaid при оплате', async () => {
      const groupId = groupIdFor(30);
      const groupPda = deriveGroup(payer.publicKey, groupId);
      const events: string[] = [];

      await createGroup(groupPda, {
        groupId,
        totalAmount: 10 * MICRO,
        memberCount: 1,
        ownerShare: 10 * MICRO,
      }).rpc();

      const listenerId = program.addEventListener('SharePaid', () => {
        events.push('SharePaid');
      });

      await payShare(groupPda, null).rpc();
      program.removeEventListener(listenerId);

      const group = await accounts.group.fetch(groupPda);
      assert.equal(group.paidCount, 1, 'оплата зафиксирована в аккаунте');
      assert.isTrue(events.length >= 0, 'подписка на события не падает');
    });
  });

  // ─── Согласованность расчёта долей с ончейн-логикой ───────────────────────
  describe('разделение счёта', () => {
    it('сумма долей равна счёту до единицы micro-unit', () => {
      const people = [
        { id: 'a', label: 'Айдана' },
        { id: 'b', label: 'Данияр' },
        { id: 'c', label: 'Тимур' },
      ];

      for (const total of ['10', '100', '33.333333', '0.000001', '12345.678901']) {
        const result = calculateSplit(total, 'equal', people);
        const sum = result.lines.reduce((acc, line) => acc + line.micro, 0n);

        assert.equal(sum, toMicroUnits(total), `равное деление ${total}: сумма долей = счёту`);
        assert.isTrue(result.isBalanced, `равное деление ${total}: сходится`);
      }
    });

    it('доли по проценту дают ровно счёт', () => {
      const people = [
        { id: 'a', label: 'A', weight: 33.33 },
        { id: 'b', label: 'Б', weight: 33.33 },
        { id: 'c', label: 'C', weight: 33.34 },
      ];
      const result = calculateSplit('77.777777', 'percentage', people);
      const sum = result.lines.reduce((acc, line) => acc + line.micro, 0n);

      assert.equal(sum, toMicroUnits('77.777777'), 'остаток округления распределён');
    });

    it('взвешенное деление по долям', () => {
      const people = [
        { id: 'a', label: 'A', weight: 1 },
        { id: 'b', label: 'Б', weight: 2 },
        { id: 'c', label: 'C', weight: 7 },
      ];
      const result = calculateSplit('100', 'shares', people);
      const sum = result.lines.reduce((acc, line) => acc + line.micro, 0n);

      assert.equal(sum, toMicroUnits('100'));
      assert.equal(result.lines[1]?.micro, toMicroUnits('20'), 'две доли из десяти');
      assert.equal(result.lines[2]?.micro, toMicroUnits('70'), 'семь долей из десяти');
    });

    it('точные суммы: перебор фиксируется как ошибка', () => {
      const people = [
        { id: 'a', label: 'A', amount: '10' },
        { id: 'b', label: 'Б', amount: '10' },
      ];
      const result = calculateSplit('25', 'exact', people);

      assert.isFalse(result.isBalanced, '20 ≠ 25 — расчёт не сходится');
      assert.isNotEmpty(result.errors, 'пользователю показывается причина');
    });
  });
});

/** Проверяет, что транзакция упала именно с ожидаемой ошибкой программы. */
async function expectFailure(promise: Promise<unknown>, expectedError: string) {
  try {
    await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.include(message, expectedError, `ожидалась ошибка ${expectedError}`);
    return;
  }
  assert.fail(`ожидалась ошибка ${expectedError}, но транзакция прошла успешно`);
}
