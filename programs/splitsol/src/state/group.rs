use anchor_lang::prelude::*;

use crate::errors::SplitSolError;

/// Максимальное количество участников в одной группе.
/// Ограничение нужно, чтобы `paid_members` / `paid_amounts` помещались в аккаунт
/// фиксированного размера и `cancel_group` мог вернуть все средства on-chain.
pub const MAX_MEMBERS: usize = 10;

/// Состояние платёжной группы (PDA).
///
/// PDA-сиды: `["group", owner, group_id]`
#[account]
#[derive(Debug, Default)]
pub struct Group {
    /// Публичный ключ создателя группы
    pub owner: Pubkey, // 32
    /// Уникальный ID группы (первые 8 байт UUID из фронтенда)
    pub group_id: [u8; 8], // 8
    /// Общая сумма счёта в минимальных единицах токена (micro-tUSDC)
    pub total_amount: u64, // 8
    /// Сумма всех заявленных долей участников. Всегда <= total_amount.
    pub committed_amount: u64, // 8
    /// Mint SPL-токена (наш tUSDC)
    pub token_mint: Pubkey, // 32
    /// Адрес конечного получателя (ресторан / организатор)
    pub recipient: Pubkey, // 32
    /// Ожидаемое количество участников (задаётся при создании)
    pub member_count: u8, // 1
    /// Сколько участников реально зарегистрировались (join_group)
    pub joined_count: u8, // 1
    /// Сколько участников оплатили свою долю
    pub paid_count: u8, // 1
    /// Статус группы
    pub status: GroupStatus, // 1
    /// Бамп PDA группы
    pub bump: u8, // 1
    /// Реестр оплативших: кошелёк -> сумма. Индекс `i` соответствует `paid_amounts[i]`.
    pub paid_members: [Pubkey; MAX_MEMBERS], // 320
    pub paid_amounts: [u64; MAX_MEMBERS], // 80
}

impl Group {
    /// 8 (discriminator) + 32 + 8 + 8 + 8 + 32 + 32 + 1 + 1 + 1 + 1 + 1 + 320 + 80
    pub const LEN: usize = 533;

    /// Сборка сидов для подписи/деривации PDA группы.
    pub fn seeds(owner: &Pubkey, group_id: &[u8; 8], bump: &[u8; 1]) -> [&[u8]; 4] {
        [b"group", owner.as_ref(), group_id, bump]
    }

    /// Группа расчитана, когда все ожидаемые участники зарегистрированы и оплатили.
    pub fn is_fully_paid(&self) -> bool {
        self.member_count > 0
            && self.joined_count == self.member_count
            && self.paid_count == self.member_count
            && self.committed_amount == self.total_amount
    }

    /// Сумма всех фактически собранных платежей.
    pub fn collected_amount(&self) -> u64 {
        self.paid_amounts.iter().sum()
    }

    pub fn record_payment(&mut self, wallet: &Pubkey, amount: u64) -> Result<()> {
        let index = self.paid_count as usize;
        require!(index < MAX_MEMBERS, SplitSolError::TooManyMembers);
        require!(amount > 0, SplitSolError::InvalidAmount);

        self.paid_members[index] = *wallet;
        self.paid_amounts[index] = amount;
        self.paid_count += 1;
        Ok(())
    }

    pub fn clear_payments(&mut self) {
        self.paid_members = [Pubkey::default(); MAX_MEMBERS];
        self.paid_amounts = [0u64; MAX_MEMBERS];
        self.paid_count = 0;
    }
}

/// Статус группы.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum GroupStatus {
    /// Принимает платежи
    #[default]
    Active,
    /// Все оплатили, средства переведены получателю
    Settled,
    /// Отменена, средства возвращены участникам
    Cancelled,
}

/// Проверяет, что переданный аккаунт действительно является PDA группы с
/// корректными сидами и бампом.
///
/// Сиды группы зависят от полей самого аккаунта (`owner`, `group_id`),
/// поэтому Anchor-constraint `seeds = [...]` здесь невозможен — валидация
/// выполняется явно в handler'е.
pub fn assert_group_pda(
    group: &Account<'_, Group>,
    group_key: &Pubkey,
    program_id: &Pubkey,
) -> Result<()> {
    let (expected, bump) = Pubkey::try_find_program_address(
        &[b"group", group.owner.as_ref(), &group.group_id],
        program_id,
    )
    .map_err(|_| error!(SplitSolError::InvalidGroupAccount))?;

    require_eq!(bump, group.bump, SplitSolError::InvalidGroupAccount);
    require_keys_eq!(*group_key, expected, SplitSolError::InvalidGroupAccount);
    Ok(())
}
