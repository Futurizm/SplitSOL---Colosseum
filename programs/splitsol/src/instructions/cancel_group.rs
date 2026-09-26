use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::SplitSolError;
use crate::state::group::{assert_group_pda, Group, GroupStatus, MAX_MEMBERS};
use crate::state::member::Member;

/// Отмена группы с возвратом средств.
///
/// Только создатель. В `remaining_accounts` передаются PDA **всех**
/// зарегистрированных участников (`group.joined_count` штук) — иначе часть
/// денег осталась бы в эскроу навсегда, поэтому полнота списка проверяется.
#[derive(Accounts)]
pub struct CancelGroup<'info> {
    /// Группа объявлена первой: constraint `owner` ссылается на `group.owner`,
    /// а Anchor разрешает ссылаться только на уже объявленные аккаунты.
    #[account(
        mut,
        constraint = group.status == GroupStatus::Active @ SplitSolError::GroupNotActive,
    )]
    pub group: Account<'info, Group>,

    #[account(mut, address = group.owner @ SplitSolError::UnauthorizedOwner)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = escrow_token_account.mint == group.token_mint @ SplitSolError::WrongMint,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CancelGroup>) -> Result<()> {
    let group_key = ctx.accounts.group.key();
    assert_group_pda(&ctx.accounts.group, &group_key, &ctx.program_id)?;

    let joined_count = ctx.accounts.group.joined_count as usize;
    require!(
        ctx.remaining_accounts.len() == joined_count,
        SplitSolError::IncompleteMemberList
    );

    let collected = ctx.accounts.group.collected_amount();
    require!(
        ctx.accounts.escrow_token_account.amount == collected,
        SplitSolError::AmountMismatch
    );

    // Собираем токен-аккаунты всех участников из remaining_accounts.
    let mut token_accounts = [Pubkey::default(); MAX_MEMBERS];
    let mut wallets = [Pubkey::default(); MAX_MEMBERS];
    for (index, info) in ctx.remaining_accounts.iter().enumerate() {
        require!(index < MAX_MEMBERS, SplitSolError::TooManyMembers);
        let mut data = info.try_borrow_data()?;
        let member = Member::try_deserialize(&mut &data[..])?;
        require_keys_eq!(
            member.group,
            group_key,
            SplitSolError::UnauthorizedMember
        );
        token_accounts[index] = member.token_account;
        wallets[index] = member.wallet;
    }

    let owner = ctx.accounts.group.owner;
    let group_id = ctx.accounts.group.group_id;
    let bump = [ctx.accounts.group.bump];
    let seeds: &[&[u8]] = &Group::seeds(&owner, &group_id, &bump);
    let group_account_info = ctx.accounts.group.to_account_info();
    let escrow_info = ctx.accounts.escrow_token_account.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();

    let group = &mut ctx.accounts.group;

    for index in 0..MAX_MEMBERS {
        let amount = group.paid_amounts[index];
        if amount == 0 {
            continue;
        }
        let wallet = group.paid_members[index];

        let destination = (0..joined_count).find(|slot| wallets[*slot] == wallet);
        let destination = match destination {
            Some(slot) => token_accounts[slot],
            None => return err!(SplitSolError::UnauthorizedMember),
        };
        require_keys_neq!(
            destination,
            Pubkey::default(),
            SplitSolError::InvalidTokenAccount
        );

        token::transfer(
            CpiContext::new_with_signer(
                token_program.clone(),
                Transfer {
                    from: escrow_info.clone(),
                    to: destination,
                    authority: group_account_info.clone(),
                },
                &[seeds],
            ),
            amount,
        )?;

        group.paid_amounts[index] = 0;
        group.paid_members[index] = Pubkey::default();
    }

    group.clear_payments();
    group.status = GroupStatus::Cancelled;

    emit!(GroupCancelled {
        group: group_key,
        owner,
        refunded: collected,
    });

    Ok(())
}

#[event]
pub struct GroupCancelled {
    pub group: Pubkey,
    pub owner: Pubkey,
    pub refunded: u64,
}
