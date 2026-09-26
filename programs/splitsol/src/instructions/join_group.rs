use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::errors::SplitSolError;
use crate::state::{
    group::{assert_group_pda, Group, GroupStatus},
    member::Member,
};

/// Присоединение к группе по `invite_code`.
/// Создаёт PDA участника с его долей; ATA присоединяющегося создаётся, если её нет.
#[derive(Accounts)]
#[instruction(share_amount: u64)]
pub struct JoinGroup<'info> {
    #[account(mut)]
    pub joiner: Signer<'info>,

    #[account(
        mut,
        constraint = group.status == GroupStatus::Active @ SplitSolError::GroupNotActive,
    )]
    pub group: Account<'info, Group>,

    /// PDA участника. Seeds: ["member", group, joiner]
    #[account(
        init,
        payer = joiner,
        space = Member::LEN,
        seeds = [b"member", group.key().as_ref(), joiner.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,

    pub token_mint: Account<'info, Mint>,

    /// ATA присоединяющегося — его же он использует для оплаты.
    #[account(
        init_if_needed,
        mut,
        payer = joiner,
        associated_token::mint = token_mint,
        associated_token::authority = joiner,
    )]
    pub joiner_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<JoinGroup>, share_amount: u64) -> Result<()> {
    require!(share_amount > 0, SplitSolError::InvalidAmount);

    let group_key = ctx.accounts.group.key();
    assert_group_pda(&ctx.accounts.group, &group_key, &ctx.program_id)?;

    let joiner_key = ctx.accounts.joiner.key();
    let token_account = ctx.accounts.joiner_token_account.key();
    let member_bump = ctx.bumps.member;

    let total = ctx.accounts.group.total_amount;
    let committed = ctx.accounts.group.committed_amount;
    let joined = ctx.accounts.group.joined_count;
    let expected = ctx.accounts.group.member_count;

    require!(joined < expected, SplitSolError::TooManyMembers);
    // Сумма всех заявленных долей никогда не превышает общий счёт.
    require!(
        share_amount <= total.saturating_sub(committed),
        SplitSolError::AmountOverflow
    );

    let group = &mut ctx.accounts.group;
    group.committed_amount = committed + share_amount;
    group.joined_count = joined + 1;

    let member = &mut ctx.accounts.member;
    member.group = group_key;
    member.wallet = joiner_key;
    member.token_account = token_account;
    member.share_amount = share_amount;
    member.has_paid = false;
    member.is_creator = false;
    member.refunded = false;
    member.bump = member_bump;

    emit!(MemberJoined {
        group: group_key,
        wallet: joiner_key,
        share_amount,
        joined_count: joined + 1,
    });

    Ok(())
}
