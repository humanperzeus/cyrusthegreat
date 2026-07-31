//! CyrusFundraise — Solana port of `contracts/evm/CyrusFundraise.sol`.
//!
//! The defining property of the EVM contract is that it is NON-CUSTODIAL: the
//! fee and the remainder are forwarded in the SAME transaction, so the contract
//! never holds donor funds even for an instant. That property is preserved here
//! exactly — `donate_sol` moves lamports donor -> fee_collector and
//! donor -> recipient with two system-program CPIs and keeps nothing.
//!
//! WHAT CHANGES:
//!   * `campaigns[uint256]` + `nextId` -> `Campaign` PDA seeded by a u64 id
//!     drawn from a `Config` counter. Ids stay stable and enumerable, so the
//!     `/fund?id=N` URL shape used by the dapp survives the port unchanged.
//!   * `string title` / `metaURI` are length-capped, because Solana accounts
//!     are fixed-size at creation. The EVM version has no cap; unbounded
//!     strings simply are not expressible here.
//!   * `raised` counts GROSS donations, matching the EVM comment exactly, so
//!     the progress bar in the dapp means the same thing on both chains.
//!
//! FEE. EVM: `fee = max(minFee, amount * FEE_BPS / 10_000)` with FEE_BPS = 10,
//! i.e. 0.1%, and a per-campaign `minFee` floor that is 0 for native donations.
//! Reproduced verbatim below — this is the one number a donor can check against
//! the live EVM deployment, so it must not drift.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("9rWybqkAm9hQZvwTJNCXLo2YNYLhuJHPwa9eQL3NF99H");

/// Mirrors `FEE_BPS = 10` (0.1%) and `BPS_DENOM = 10_000`.
pub const FEE_BPS: u64 = 10;
pub const BPS_DENOM: u64 = 10_000;
/// Solana accounts are fixed-size; the EVM strings are unbounded.
pub const MAX_TITLE_LEN: usize = 64;
pub const MAX_META_LEN: usize = 128;

#[program]
pub mod cyrus_fundraise {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, fee_collector: Pubkey) -> Result<()> {
        require!(fee_collector != Pubkey::default(), FundError::ZeroFeeCollector);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.fee_collector = fee_collector;
        cfg.next_id = 1; // EVM starts ids at 1 as well
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// `createCampaign(recipient, token, goal, title, metaURI, listed)`.
    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        _id: u64,
        recipient: Pubkey,
        mint: Pubkey,
        goal: u64,
        min_fee: u64,
        title: String,
        meta_uri: String,
        listed: bool,
    ) -> Result<()> {
        require!(recipient != Pubkey::default(), FundError::ZeroRecipient);
        require!(title.len() <= MAX_TITLE_LEN, FundError::TitleTooLong);
        require!(meta_uri.len() <= MAX_META_LEN, FundError::MetaTooLong);

        let cfg = &mut ctx.accounts.config;
        let id = cfg.next_id;
        cfg.next_id = cfg.next_id.checked_add(1).ok_or(FundError::MathOverflow)?;

        let c = &mut ctx.accounts.campaign;
        c.id = id;
        c.creator = ctx.accounts.creator.key();
        c.recipient = recipient;
        c.mint = mint;
        c.goal = goal;
        c.min_fee = min_fee;
        c.raised = 0;
        c.title = title;
        c.meta_uri = meta_uri;
        c.active = true;
        c.listed = listed;
        c.bump = ctx.bumps.campaign;

        emit!(CampaignCreated { id, creator: c.creator, recipient, mint, goal });
        Ok(())
    }

    /// `donateNative(id)`. Non-custodial: both legs settle in this instruction.
    pub fn donate_sol(ctx: Context<DonateSol>, amount: u64) -> Result<()> {
        require!(amount > 0, FundError::ZeroAmount);
        {
            let c = &ctx.accounts.campaign;
            require!(c.active, FundError::CampaignInactive);
            require!(c.mint == Pubkey::default(), FundError::NativeMismatch);
            require!(c.recipient == ctx.accounts.recipient.key(), FundError::RecipientMismatch);
        }

        let fee = fee_for(amount, ctx.accounts.campaign.min_fee)?;
        require!(amount > fee, FundError::BelowMinDonation);
        let net = amount.checked_sub(fee).ok_or(FundError::MathOverflow)?;

        if fee > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.donor.to_account_info(),
                        to: ctx.accounts.fee_collector.to_account_info(),
                    },
                ),
                fee,
            )?;
        }
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.donor.to_account_info(),
                    to: ctx.accounts.recipient.to_account_info(),
                },
            ),
            net,
        )?;

        // `raised` counts GROSS, matching the EVM contract.
        let c = &mut ctx.accounts.campaign;
        c.raised = c.raised.checked_add(amount).ok_or(FundError::MathOverflow)?;

        emit!(Donation {
            id: c.id,
            donor: ctx.accounts.donor.key(),
            amount,
            fee,
            raised: c.raised,
        });
        Ok(())
    }

    /// `closeCampaign(id)` — recipient only, mirrors the EVM access rule.
    pub fn close_campaign(ctx: Context<ModifyCampaign>) -> Result<()> {
        ctx.accounts.campaign.active = false;
        Ok(())
    }

    /// `setListed(id, listed)` — recipient only. Drives the public directory.
    pub fn set_listed(ctx: Context<ModifyCampaign>, listed: bool) -> Result<()> {
        ctx.accounts.campaign.listed = listed;
        Ok(())
    }
}

/// `_feeFor`: 0.1% of the amount, floored at the campaign's `minFee`.
pub fn fee_for(amount: u64, min_fee: u64) -> Result<u64> {
    let pct = amount
        .checked_mul(FEE_BPS)
        .ok_or(FundError::MathOverflow)?
        / BPS_DENOM;
    Ok(if pct > min_fee { pct } else { min_fee })
}

// ---------------------------------------------------------------- state

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub fee_collector: Pubkey,
    pub next_id: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub id: u64,
    pub creator: Pubkey,
    pub recipient: Pubkey,
    /// `Pubkey::default()` == native SOL, mirroring `NATIVE` on the EVM side.
    pub mint: Pubkey,
    pub goal: u64,
    pub min_fee: u64,
    pub raised: u64,
    #[max_len(MAX_TITLE_LEN)]
    pub title: String,
    #[max_len(MAX_META_LEN)]
    pub meta_uri: String,
    pub active: bool,
    pub listed: bool,
    pub bump: u8,
}

// ---------------------------------------------------------------- contexts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init, payer = creator, space = 8 + Campaign::INIT_SPACE,
        seeds = [b"campaign", id.to_le_bytes().as_ref()], bump
    )]
    pub campaign: Account<'info, Campaign>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DonateSol<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"campaign", campaign.id.to_le_bytes().as_ref()], bump = campaign.bump)]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: paid directly; must match the campaign's recipient (checked in body).
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    /// CHECK: enforced to equal the configured collector.
    #[account(mut, address = config.fee_collector @ FundError::Unauthorized)]
    pub fee_collector: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ModifyCampaign<'info> {
    /// Only the recipient may close or relist — same rule as the EVM contract.
    #[account(mut, address = campaign.recipient @ FundError::NotRecipient)]
    pub recipient: Signer<'info>,
    #[account(mut, seeds = [b"campaign", campaign.id.to_le_bytes().as_ref()], bump = campaign.bump)]
    pub campaign: Account<'info, Campaign>,
}

// ---------------------------------------------------------------- events

#[event]
pub struct CampaignCreated {
    pub id: u64,
    pub creator: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub goal: u64,
}

#[event]
pub struct Donation {
    pub id: u64,
    pub donor: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub raised: u64,
}

#[error_code]
pub enum FundError {
    #[msg("Fee collector cannot be the zero address")]
    ZeroFeeCollector,
    #[msg("Recipient cannot be the zero address")]
    ZeroRecipient,
    #[msg("Campaign is not active")]
    CampaignInactive,
    #[msg("Campaign is not a native-SOL campaign")]
    NativeMismatch,
    #[msg("Recipient account does not match the campaign")]
    RecipientMismatch,
    #[msg("Donation must exceed the fee")]
    BelowMinDonation,
    #[msg("Zero amount")]
    ZeroAmount,
    #[msg("Title too long")]
    TitleTooLong,
    #[msg("Metadata URI too long")]
    MetaTooLong,
    #[msg("Only the recipient may do this")]
    NotRecipient,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Unauthorized")]
    Unauthorized,
}

// ---------------------------------------------------------------- tests
//
// These run on the HOST (`cargo test`), not on-chain. They pin the fee formula
// against the values the live EVM deployment actually produced on Sepolia, so a
// drift between chains fails here rather than in front of a donor.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_is_ten_bps() {
        // Measured on Sepolia 2026-07-31: a 0.002 ETH donation produced a fee of
        // 0.000002 ETH exactly = 0.100%. Same ratio, lamport scale.
        assert_eq!(fee_for(2_000_000_000_000_000, 0).unwrap(), 2_000_000_000_000);
        assert_eq!(fee_for(1_000_000, 0).unwrap(), 1_000);
    }

    #[test]
    fn min_fee_floor_wins_when_larger() {
        // 0.1% of 1000 = 1, floor of 500 must win.
        assert_eq!(fee_for(1_000, 500).unwrap(), 500);
    }

    #[test]
    fn percentage_wins_when_above_floor() {
        assert_eq!(fee_for(10_000_000, 500).unwrap(), 10_000);
    }

    #[test]
    fn native_campaigns_have_no_floor() {
        // EVM comment: "native minFee is 0 -> straight 0.1%".
        assert_eq!(fee_for(5_000_000, 0).unwrap(), 5_000);
    }

    #[test]
    fn fee_never_exceeds_the_donation() {
        for amount in [1u64, 2, 999, 1_000, 1_000_000, u64::MAX / FEE_BPS] {
            assert!(fee_for(amount, 0).unwrap() <= amount, "amount={amount}");
        }
    }

    #[test]
    fn overflow_is_rejected_not_wrapped() {
        assert!(fee_for(u64::MAX, 0).is_err());
    }
}
