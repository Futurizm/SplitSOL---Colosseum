use anchor_lang::prelude::*;

use crate::errors::SplitSolError;

/// Состояние участника группы (PDA).
///
/// PDA-сиды: `["member", group, wallet]`
#[account]
#[derive(Debug, Default)]
pub struct Member {
    /// Группа, к которой относится участник
    pub group: Pubkey, // 32
    /// Кошелёк участника
    pub wallet: Pubkey, // 32
    /// Токен-аккаунт участника для этого mint'а (используется и для оплаты, и для возврата)
    pub token_account: Pubkey, // 32
    /// Доля участника в минимальных единицах токена
    pub share_amount: u64, // 8
    /// Оплатил ли участник свою долю
    pub has_paid: bool, // 1
    /// Является ли участник создателем группы
    pub is_creator: bool, // 1
    /// Получил ли участник возврат при отмене группы
    pub refunded: bool, // 1
    /// Бамп PDA участника
    pub bump: u8, // 1
}

impl Member {
    /// 8 (discriminator) + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 1
    pub const LEN: usize = 116;

    /// Сборка сидов для деривации PDA участника.
    pub fn seeds(group: &Pubkey, wallet: &Pubkey, bump: &[u8; 1]) -> [&[u8]; 4] {
        [b"member", group.as_ref(), wallet.as_ref(), bump]
    }

    pub fn is_active(&self) -> bool {
        !self.refunded
    }
}

/// Проверяет, что переданный аккаунт действительно является PDA участника
/// с корректными сидами и бампом.
pub fn assert_member_pda(
    member: &Account<'_, Member>,
    member_key: &Pubkey,
    program_id: &Pubkey,
) -> Result<()> {
    let (expected, bump) = Pubkey::try_find_program_address(
        &[b"member", member.group.as_ref(), member.wallet.as_ref()],
        program_id,
    )
    .map_err(|_| error!(SplitSolError::InvalidMemberAccount))?;

    require_eq!(bump, member.bump, SplitSolError::InvalidMemberAccount);
    require_keys_eq!(*member_key, expected, SplitSolError::InvalidMemberAccount);
    Ok(())
}
