use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::errors::SplitSolError;
use crate::state::group::{assert_group_pda, Group, GroupStatus};

/// Завершение группы: перевод всего эскроу получателю.
///
/// Доступно только создателю и только когда оплатили ВСЕ ожидаемые участники,
/// а накопленная сумма в точности равна общему счёту.
#[derive(Accounts)]
pub struct SettleGroup<'info> {
    /// Группа объявлена первой: constraint'ы `owner` и `recipient` ссылаются
    /// на её поля, а Anchor разрешает ссылаться только на уже объявленные аккаунты.
    #[account(
        mut,
        constraint = group.status == GroupStatus::Active @ SplitSolError::GroupNotActive,
    )]
    pub group: Account<'info, Group>,

    #[account(mut, address = group.owner @ SplitSolError::UnauthorizedOwner)]
    pub owner: Signer<'info>,

    /// Адрес получателя средств. Сверяется с `group.recipient`.
    /// CHECK: используется только для адресации ATA получателя.
    #[account(mut, address = group.recipient @ SplitSolError::InvalidRecipient)]
    pub recipient: UncheckedAccount,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = group,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// ATA получателя — создаётся, если её ещё нет.
    #[account(
        init_if_needed,
        mut,
        payer = owner,
        associated_token::mint = token_mint,
        associated_token::authority = recipient,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<SettleGroup>) -> Result<()> {
    let group_key = ctx.accounts.group.key();
    assert_group_pda(&ctx.accounts.group, &group_key, &ctx.program_id)?;

    require!(
        ctx.accounts.group.is_fully_paid(),
        SplitSolError::NotFullyPaid
    );

    // Эскроу обязано содержать ровно сумму счёта — ни больше, ни меньше.
    let amount = ctx.accounts.escrow_token_account.amount;
    let total_amount = ctx.accounts.group.total_amount;
    require_eq!(amount, total_amount, SplitSolError::AmountMismatch);

    // Эскроу подписывается PDA группы.
    let owner = ctx.accounts.group.owner;
    let group_id = ctx.accounts.group.group_id;
    let bump = [ctx.accounts.group.bump];
    let seeds: &[&[u8]] = &Group::seeds(&owner, &group_id, &bump);
    let group_account_info = ctx.accounts.group.to_account_info();

    let recipient = ctx.accounts.recipient.key();

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: group_account_info,
            },
            &[seeds],
        ),
        amount,
    )?;

    let group = &mut ctx.accounts.group;
    group.status = GroupStatus::Settled;
    group.clear_payments();

    emit!(GroupSettled {
        group: group_key,
        recipient,
        amount,
    });

    Ok(())
}

#[event]
pub struct GroupSettled {
    pub group: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
}
