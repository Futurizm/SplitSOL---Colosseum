use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

use crate::state::group::MAX_MEMBERS;

/// Program ID SplitSOL.
///
/// ⚠️ ЗАГЛУШКА. Значение ниже — валидный base58 pubkey, чтобы `anchor build`
/// проходил «из коробки», но это НЕ ваш program keypair.
///
/// Прогоните `node scripts/set-program-id.mjs` — скрипт создаст program keypair,
/// возьмёт его публичный ключ и автоматически подставит его сюда и в Anchor.toml.
declare_id!("EoKgxxQEbDgFxFnNrzHtpzBgAj6FGFG2Xk4iSfuqMVE8");

/// Максимальное количество участников — используется в `create_group` и `join_group`.
pub const MAX_GROUP_MEMBERS: u8 = MAX_MEMBERS as u8;

#[program]
pub mod splitsol {
    use super::*;

    /// Создать новую платёжную группу.
    /// Создатель автоматически становится первым участником (owner).
    pub fn create_group(ctx: Context<CreateGroup>, params: CreateGroupParams) -> Result<()> {
        instructions::create_group::handler(ctx, params)
    }

    /// Присоединиться к группе по invite_code.
    /// Создаёт PDA-аккаунт участника с его долей.
    pub fn join_group(ctx: Context<JoinGroup>, share_amount: u64) -> Result<()> {
        instructions::join_group::handler(ctx, share_amount)
    }

    /// Оплатить свою долю.
    /// Переводит SPL-токены с ATA участника на эскроу PDA группы.
    pub fn pay_share(ctx: Context<PayShare>) -> Result<()> {
        instructions::pay_share::handler(ctx)
    }

    /// Завершить группу: перевести все средства из эскроу получателю.
    /// Вызывается только когда ВСЕ участники оплатили.
    pub fn settle_group(ctx: Context<SettleGroup>) -> Result<()> {
        instructions::settle_group::handler(ctx)
    }

    /// Отменить группу и вернуть оплаченные средства участникам.
    /// Может вызвать только создатель группы.
    ///
    /// В `remaining_accounts` нужно передать PDA всех зарегистрированных участников.
    pub fn cancel_group(ctx: Context<CancelGroup>) -> Result<()> {
        instructions::cancel_group::handler(ctx)
    }
}
