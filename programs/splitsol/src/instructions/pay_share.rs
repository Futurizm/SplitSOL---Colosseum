use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::errors::SplitSolError;
use crate::state::{
    group::{assert_group_pda, Group, GroupStatus},
    member::{assert_member_pda, Member},
};

/// Оплата доли участника.
///
/// Переводит ровно `member.share_amount` micro-токенов с ATA плательщика в
/// эскроу группы и фиксирует платёж в реестре `Group.paid_*`.
#[derive(Accounts)]
pub struct PayShare<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = group.status == GroupStatus::Active @ SplitSolError::GroupNotActive,
    )]
    pub group: Account<'info, Group>,

    #[account(
        mut,
        constraint = member.group == group.key() @ SplitSolError::UnauthorizedMember,
        constraint = member.wallet == payer.key() @ SplitSolError::UnauthorizedMember,
        constraint = !member.has_paid @ SplitSolError::AlreadyPaid,
    )]
    pub member: Account<'info, Member>,

    pub token_mint: Account<'info, Mint>,

    /// ATA плательщика — создаётся, если её ещё нет.
    #[account(
        init_if_needed,
        mut,
        payer = payer,
        associated_token::mint = token_mint,
        associated_token::authority = payer,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    /// Эскроу группы (ATA, authority — PDA группы).
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = group,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<PayShare>) -> Result<()> {
    let group_key = ctx.accounts.group.key();
    let member_key = ctx.accounts.member.key();

    assert_group_pda(&ctx.accounts.group, &group_key, &ctx.program_id)?;
    assert_member_pda(&ctx.accounts.member, &member_key, &ctx.program_id)?;

    let payer_key = ctx.accounts.payer.key();
    let mint_key = ctx.accounts.group.token_mint;
    let share_amount = ctx.accounts.member.share_amount;
    let payer_token_account = ctx.accounts.payer_token_account.key();

    require!(share_amount > 0, SplitSolError::InvalidAmount);
    require_keys_eq!(
        ctx.accounts.payer_token_account.mint,
        mint_key,
        SplitSolError::WrongMint
    );
    require_keys_eq!(
        ctx.accounts.payer_token_account.owner,
        payer_key,
        SplitSolError::InvalidTokenAccount
    );
    require!(
        ctx.accounts.payer_token_account.amount >= share_amount,
        SplitSolError::InsufficientFunds
    );

    // Authority плательщика — он сам и есть signer, дополнительных сидов не нужно.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer_token_account.to_account_info(),
                to: ctx.accounts.escrow_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        share_amount,
    )?;

    let group = &mut ctx.accounts.group;
    group.record_payment(&payer_key, share_amount)?;
    let paid_count = group.paid_count;
    let member_count = group.member_count;

    let member = &mut ctx.accounts.member;
    member.has_paid = true;
    // Запоминаем ATA для возможного возврата при отмене группы.
    member.token_account = payer_token_account;

    emit!(SharePaid {
        group: group_key,
        member: member_key,
        payer: payer_key,
        amount: share_amount,
        paid_count,
        total_members: member_count,
    });

    Ok(())
}

#[event]
pub struct SharePaid {
    pub group: Pubkey,
    pub member: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub paid_count: u8,
    pub total_members: u8,
}
