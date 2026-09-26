use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::errors::SplitSolError;
use crate::state::{
    group::{Group, GroupStatus, MAX_MEMBERS},
    member::Member,
};

/// Параметры создания группы.
///
/// Все суммы — в минимальных единицах SPL-токена (micro-tUSDC, 6 decimals).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateGroupParams {
    /// Первые 8 байт UUID группы — часть PDA-сидов
    pub group_id: [u8; 8],
    /// Общая сумма счёта
    pub total_amount: u64,
    /// Ожидаемое количество участников (1..=MAX_MEMBERS)
    pub member_count: u8,
    /// Доля создателя (он же первый участник)
    pub owner_share: u64,
    /// Адрес получателя (ресторан / организатор)
    pub recipient: Pubkey,
}

#[derive(Accounts)]
#[instruction(params: CreateGroupParams)]
pub struct CreateGroup<'info> {
    /// Создатель группы. Платит за rent аккаунтов и персонально за escrow-ATA.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// PDA состояния группы. Seeds: ["group", owner, group_id]
    #[account(
        init,
        payer = owner,
        space = Group::LEN,
        seeds = [b"group", owner.key().as_ref(), &params.group_id],
        bump
    )]
    pub group: Account<'info, Group>,

    /// PDA участника для создателя. Seeds: ["member", group, owner]
    #[account(
        init,
        payer = owner,
        space = Member::LEN,
        seeds = [b"member", group.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,

    /// SPL-токен счёта (наш tUSDC)
    pub token_mint: Account<'info, Mint>,

    /// Эскроу: ATA токена, authority — PDA группы.
    /// Пока группа активна, токены лежат здесь и никто не может их забрать.
    #[account(
        init,
        payer = owner,
        associated_token::mint = token_mint,
        associated_token::authority = group,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CreateGroup>, params: CreateGroupParams) -> Result<()> {
    require!(params.member_count > 0, SplitSolError::InvalidMemberCount);
    require!(
        (params.member_count as usize) <= MAX_MEMBERS,
        SplitSolError::TooManyMembers
    );
    require!(params.total_amount > 0, SplitSolError::InvalidAmount);
    require!(
        params.owner_share > 0 && params.owner_share <= params.total_amount,
        SplitSolError::InvalidAmount
    );

    // Читаем бампы до mut-заимствования аккаунтов.
    let group_bump = ctx.bumps.group;
    let member_bump = ctx.bumps.member;

    let group_key = ctx.accounts.group.key();
    let owner_key = ctx.accounts.owner.key();
    let mint_key = ctx.accounts.token_mint.key();

    let group = &mut ctx.accounts.group;
    group.owner = owner_key;
    group.group_id = params.group_id;
    group.total_amount = params.total_amount;
    group.committed_amount = params.owner_share;
    group.token_mint = mint_key;
    group.recipient = params.recipient;
    group.member_count = params.member_count;
    group.joined_count = 1;
    group.paid_count = 0;
    group.status = GroupStatus::Active;
    group.bump = group_bump;
    group.paid_members = [Pubkey::default(); MAX_MEMBERS];
    group.paid_amounts = [0u64; MAX_MEMBERS];

    let member = &mut ctx.accounts.member;
    member.group = group_key;
    member.wallet = owner_key;
    // ATA создателя создаётся лениво — в `pay_share` / повторном `join_group`.
    member.token_account = Pubkey::default();
    member.share_amount = params.owner_share;
    member.has_paid = false;
    member.is_creator = true;
    member.refunded = false;
    member.bump = member_bump;

    emit!(GroupCreated {
        group: group_key,
        owner: owner_key,
        total_amount: params.total_amount,
        member_count: params.member_count,
    });

    Ok(())
}

#[event]
pub struct GroupCreated {
    pub group: Pubkey,
    pub owner: Pubkey,
    pub total_amount: u64,
    pub member_count: u8,
}

// Событие MemberJoined объявлено в join_group.rs: имя события в Anchor
// является его borsh-дискриминатором, поэтому дубликаты недопустимы.
