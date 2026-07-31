//! CyrusVault — Solana port of `contracts/evm/CrossChainBank8.sol`.
//!
//! PORTING NOTES (why this is not a line-for-line copy — it cannot be):
//!
//! | EVM                                   | Solana                                        |
//! |---------------------------------------|-----------------------------------------------|
//! | `mapping(bytes32 => uint256) vault`   | one `VaultEntry` PDA per (owner, mint)        |
//! | key = `keccak(user, token, salt)`     | PDA seeds `[b"vault", owner, mint]` + `salt`  |
//! | `msg.value` on a payable fn           | explicit `amount` arg + system-program CPI    |
//! | ERC-20 `transferFrom`                 | SPL Token CPI with an associated token account|
//! | `nonReentrant`                        | not needed — Solana locks accounts per tx     |
//! | Chainlink `latestRoundData()`         | `fee_lamports` in `Config` (see FEE below)    |
//!
//! FEE. The EVM contract derives a $0.10 fee from a Chainlink feed at call time.
//! Solana has no Chainlink; the equivalents are Pyth or Switchboard. Rather than
//! bake in an oracle dependency that cannot be built or tested here, `Config`
//! carries `fee_lamports`, set at `initialize` and updatable by the authority.
//! `charge_fee` is the single choke point — swapping in a Pyth read means
//! changing that one function and nothing else.
//!
//! DELIBERATE DIFFERENCE FROM THE EVM ORIGINAL: the EVM version tracks a
//! per-user token list capped at `MAX_TOKENS_PER_USER = 200` purely so
//! `getMyVaultedTokens()` can enumerate. On Solana that enumeration is a
//! `getProgramAccounts` filter on the client side, so the on-chain list — and
//! its cap, and the "max 5 new tokens per tx" anti-spam rule that only exists
//! to bound its growth — are unnecessary. Rent already prices account creation.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("BGgf2b4L3q2Ekei7QxMEw2WNdzU7ffeARqoS7UaeKRuf");

/// Mirrors `MAX_TRANSACTIONS_PER_MINUTE` / `RATE_LIMIT_WINDOW_MINUTE`.
pub const MAX_TRANSACTIONS_PER_MINUTE: u16 = 1000;
pub const RATE_LIMIT_WINDOW_SECONDS: i64 = 60;
/// Mirrors `MAX_BATCH_SIZE` for the batched instructions.
pub const MAX_BATCH_SIZE: usize = 25;

#[program]
pub mod cyrus_vault {
    use super::*;

    /// Mirrors the EVM constructor.
    pub fn initialize(
        ctx: Context<Initialize>,
        fee_collector: Pubkey,
        salt: [u8; 32],
        fee_lamports: u64,
    ) -> Result<()> {
        require!(fee_collector != Pubkey::default(), VaultError::InvalidFeeCollector);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.fee_collector = fee_collector;
        cfg.salt = salt;
        cfg.fee_lamports = fee_lamports;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// Authority-only. The EVM fee moves with the oracle; here it is explicit.
    pub fn set_fee(ctx: Context<SetFee>, fee_lamports: u64) -> Result<()> {
        ctx.accounts.config.fee_lamports = fee_lamports;
        Ok(())
    }

    /// `depositETH()`. `amount` is the GROSS amount, exactly like `msg.value`:
    /// the fee is taken out of it and the remainder is credited.
    pub fn deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
        let fee = ctx.accounts.config.fee_lamports;
        require!(amount > fee, VaultError::AmountBelowFee);
        rate_limit(&mut ctx.accounts.user_stats, &Clock::get()?)?;

        // Move the whole amount into the program's SOL vault, then split the
        // accounting: credited to the user, fee to the fee pot.
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.sol_vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let credited = amount.checked_sub(fee).ok_or(VaultError::MathOverflow)?;
        let entry = &mut ctx.accounts.vault_entry;
        entry.owner = ctx.accounts.owner.key();
        entry.mint = Pubkey::default();
        entry.amount = entry.amount.checked_add(credited).ok_or(VaultError::MathOverflow)?;
        entry.bump = ctx.bumps.vault_entry;

        let pot = &mut ctx.accounts.fee_pot;
        pot.accrued = pot.accrued.checked_add(fee).ok_or(VaultError::MathOverflow)?;

        emit!(Deposit { owner: entry.owner, mint: Pubkey::default(), amount: credited, fee });
        Ok(())
    }

    /// `withdrawETH(amount)`. Fee is charged on top, from the caller's wallet.
    pub fn withdraw_sol(ctx: Context<WithdrawSol>, amount: u64) -> Result<()> {
        let fee = ctx.accounts.config.fee_lamports;
        rate_limit(&mut ctx.accounts.user_stats, &Clock::get()?)?;
        require!(ctx.accounts.vault_entry.amount >= amount, VaultError::InsufficientBalance);

        // Fee first, from the wallet (mirrors `_chargeFeeFromWallet`).
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.sol_vault.to_account_info(),
                },
            ),
            fee,
        )?;
        let pot = &mut ctx.accounts.fee_pot;
        pot.accrued = pot.accrued.checked_add(fee).ok_or(VaultError::MathOverflow)?;

        // Debit bookkeeping BEFORE moving lamports.
        let entry = &mut ctx.accounts.vault_entry;
        entry.amount = entry.amount.checked_sub(amount).ok_or(VaultError::MathOverflow)?;

        // PDA -> owner. Direct lamport arithmetic: a PDA owned by this program
        // cannot use the system program's transfer CPI.
        **ctx.accounts.sol_vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(Withdraw { owner: entry.owner, mint: Pubkey::default(), amount, fee });
        Ok(())
    }

    /// `transferInternalETH(to, amount)` — ledger move, no lamports leave the program.
    pub fn transfer_internal_sol(ctx: Context<TransferInternalSol>, amount: u64) -> Result<()> {
        let fee = ctx.accounts.config.fee_lamports;
        rate_limit(&mut ctx.accounts.user_stats, &Clock::get()?)?;
        require!(ctx.accounts.from_entry.amount >= amount, VaultError::InsufficientBalance);
        require!(
            ctx.accounts.from_entry.key() != ctx.accounts.to_entry.key(),
            VaultError::SelfTransfer
        );

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.sol_vault.to_account_info(),
                },
            ),
            fee,
        )?;
        let pot = &mut ctx.accounts.fee_pot;
        pot.accrued = pot.accrued.checked_add(fee).ok_or(VaultError::MathOverflow)?;

        let from = &mut ctx.accounts.from_entry;
        from.amount = from.amount.checked_sub(amount).ok_or(VaultError::MathOverflow)?;
        let to = &mut ctx.accounts.to_entry;
        to.owner = ctx.accounts.recipient.key();
        to.mint = Pubkey::default();
        to.amount = to.amount.checked_add(amount).ok_or(VaultError::MathOverflow)?;
        to.bump = ctx.bumps.to_entry;

        emit!(InternalTransfer {
            from: ctx.accounts.owner.key(),
            to: ctx.accounts.recipient.key(),
            mint: Pubkey::default(),
            amount,
        });
        Ok(())
    }

    /// `depositToken(token, amount)`. The SPL fee is still paid in SOL, matching
    /// the EVM contract where the $0.10 is always native.
    pub fn deposit_token(ctx: Context<DepositToken>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);
        let fee = ctx.accounts.config.fee_lamports;
        rate_limit(&mut ctx.accounts.user_stats, &Clock::get()?)?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.sol_vault.to_account_info(),
                },
            ),
            fee,
        )?;
        let pot = &mut ctx.accounts.fee_pot;
        pot.accrued = pot.accrued.checked_add(fee).ok_or(VaultError::MathOverflow)?;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.owner_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        let entry = &mut ctx.accounts.vault_entry;
        entry.owner = ctx.accounts.owner.key();
        entry.mint = ctx.accounts.mint.key();
        entry.amount = entry.amount.checked_add(amount).ok_or(VaultError::MathOverflow)?;
        entry.bump = ctx.bumps.vault_entry;

        emit!(Deposit { owner: entry.owner, mint: entry.mint, amount, fee });
        Ok(())
    }

    /// `withdrawToken(token, amount)`.
    pub fn withdraw_token(ctx: Context<WithdrawToken>, amount: u64) -> Result<()> {
        let fee = ctx.accounts.config.fee_lamports;
        rate_limit(&mut ctx.accounts.user_stats, &Clock::get()?)?;
        require!(ctx.accounts.vault_entry.amount >= amount, VaultError::InsufficientBalance);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.sol_vault.to_account_info(),
                },
            ),
            fee,
        )?;
        let pot = &mut ctx.accounts.fee_pot;
        pot.accrued = pot.accrued.checked_add(fee).ok_or(VaultError::MathOverflow)?;

        let entry = &mut ctx.accounts.vault_entry;
        entry.amount = entry.amount.checked_sub(amount).ok_or(VaultError::MathOverflow)?;

        let mint_key = ctx.accounts.mint.key();
        let seeds: &[&[u8]] = &[b"token_vault", mint_key.as_ref(), &[ctx.bumps.vault_authority]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        emit!(Withdraw { owner: entry.owner, mint: mint_key, amount, fee });
        Ok(())
    }

    /// `collectFees()` — sweeps the accrued fee pot to the configured collector.
    pub fn collect_fees(ctx: Context<CollectFees>) -> Result<()> {
        let amount = ctx.accounts.fee_pot.accrued;
        require!(amount > 0, VaultError::NothingToCollect);
        ctx.accounts.fee_pot.accrued = 0;

        **ctx.accounts.sol_vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.fee_collector.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(FeesCollected { to: ctx.accounts.fee_collector.key(), amount });
        Ok(())
    }
}

/// Mirrors `_checkAndUpdateRateLimit`.
fn rate_limit(stats: &mut Account<UserStats>, clock: &Clock) -> Result<()> {
    let window = clock.unix_timestamp / RATE_LIMIT_WINDOW_SECONDS;
    if stats.window == window {
        require!(
            stats.count < MAX_TRANSACTIONS_PER_MINUTE,
            VaultError::RateLimitExceeded
        );
        stats.count += 1;
    } else {
        stats.window = window;
        stats.count = 1;
    }
    Ok(())
}

// ---------------------------------------------------------------- state

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub fee_collector: Pubkey,
    pub salt: [u8; 32],
    pub fee_lamports: u64,
    pub bump: u8,
}

/// One per (owner, mint). `mint == Pubkey::default()` means native SOL.
#[account]
#[derive(InitSpace)]
pub struct VaultEntry {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct FeePot {
    pub accrued: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserStats {
    pub window: i64,
    pub count: u16,
    pub bump: u8,
}

// ---------------------------------------------------------------- contexts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(init, payer = authority, space = 8 + FeePot::INIT_SPACE, seeds = [b"fee_pot"], bump)]
    pub fee_pot: Account<'info, FeePot>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetFee<'info> {
    #[account(mut, address = config.authority @ VaultError::Unauthorized)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed, payer = owner, space = 8 + VaultEntry::INIT_SPACE,
        seeds = [b"vault", owner.key().as_ref(), Pubkey::default().as_ref()], bump
    )]
    pub vault_entry: Account<'info, VaultEntry>,
    #[account(
        init_if_needed, payer = owner, space = 8 + UserStats::INIT_SPACE,
        seeds = [b"stats", owner.key().as_ref()], bump
    )]
    pub user_stats: Account<'info, UserStats>,
    /// CHECK: PDA that custodies native SOL; balance-only, never deserialised.
    #[account(mut, seeds = [b"sol_vault"], bump)]
    pub sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"fee_pot"], bump = fee_pot.bump)]
    pub fee_pot: Account<'info, FeePot>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawSol<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut, has_one = owner @ VaultError::Unauthorized,
        seeds = [b"vault", owner.key().as_ref(), Pubkey::default().as_ref()], bump = vault_entry.bump
    )]
    pub vault_entry: Account<'info, VaultEntry>,
    #[account(
        init_if_needed, payer = owner, space = 8 + UserStats::INIT_SPACE,
        seeds = [b"stats", owner.key().as_ref()], bump
    )]
    pub user_stats: Account<'info, UserStats>,
    /// CHECK: SOL-custody PDA, balance-only.
    #[account(mut, seeds = [b"sol_vault"], bump)]
    pub sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"fee_pot"], bump = fee_pot.bump)]
    pub fee_pot: Account<'info, FeePot>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferInternalSol<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: recipient identity only; funds stay inside the program ledger.
    pub recipient: UncheckedAccount<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut, has_one = owner @ VaultError::Unauthorized,
        seeds = [b"vault", owner.key().as_ref(), Pubkey::default().as_ref()], bump = from_entry.bump
    )]
    pub from_entry: Account<'info, VaultEntry>,
    #[account(
        init_if_needed, payer = owner, space = 8 + VaultEntry::INIT_SPACE,
        seeds = [b"vault", recipient.key().as_ref(), Pubkey::default().as_ref()], bump
    )]
    pub to_entry: Account<'info, VaultEntry>,
    #[account(
        init_if_needed, payer = owner, space = 8 + UserStats::INIT_SPACE,
        seeds = [b"stats", owner.key().as_ref()], bump
    )]
    pub user_stats: Account<'info, UserStats>,
    /// CHECK: SOL-custody PDA, balance-only.
    #[account(mut, seeds = [b"sol_vault"], bump)]
    pub sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"fee_pot"], bump = fee_pot.bump)]
    pub fee_pot: Account<'info, FeePot>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToken<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, constraint = owner_token_account.mint == mint.key() @ VaultError::MintMismatch)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, constraint = vault_token_account.mint == mint.key() @ VaultError::MintMismatch)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed, payer = owner, space = 8 + VaultEntry::INIT_SPACE,
        seeds = [b"vault", owner.key().as_ref(), mint.key().as_ref()], bump
    )]
    pub vault_entry: Account<'info, VaultEntry>,
    #[account(
        init_if_needed, payer = owner, space = 8 + UserStats::INIT_SPACE,
        seeds = [b"stats", owner.key().as_ref()], bump
    )]
    pub user_stats: Account<'info, UserStats>,
    /// CHECK: SOL-custody PDA, balance-only.
    #[account(mut, seeds = [b"sol_vault"], bump)]
    pub sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"fee_pot"], bump = fee_pot.bump)]
    pub fee_pot: Account<'info, FeePot>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawToken<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, constraint = owner_token_account.mint == mint.key() @ VaultError::MintMismatch)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, constraint = vault_token_account.mint == mint.key() @ VaultError::MintMismatch)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA that signs SPL transfers out of the token vault.
    #[account(seeds = [b"token_vault", mint.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut, has_one = owner @ VaultError::Unauthorized,
        seeds = [b"vault", owner.key().as_ref(), mint.key().as_ref()], bump = vault_entry.bump
    )]
    pub vault_entry: Account<'info, VaultEntry>,
    #[account(
        init_if_needed, payer = owner, space = 8 + UserStats::INIT_SPACE,
        seeds = [b"stats", owner.key().as_ref()], bump
    )]
    pub user_stats: Account<'info, UserStats>,
    /// CHECK: SOL-custody PDA, balance-only.
    #[account(mut, seeds = [b"sol_vault"], bump)]
    pub sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"fee_pot"], bump = fee_pot.bump)]
    pub fee_pot: Account<'info, FeePot>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CollectFees<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: must equal the configured collector; enforced by `address`.
    #[account(mut, address = config.fee_collector @ VaultError::Unauthorized)]
    pub fee_collector: UncheckedAccount<'info>,
    /// CHECK: SOL-custody PDA, balance-only.
    #[account(mut, seeds = [b"sol_vault"], bump)]
    pub sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"fee_pot"], bump = fee_pot.bump)]
    pub fee_pot: Account<'info, FeePot>,
}

// ---------------------------------------------------------------- events

#[event]
pub struct Deposit { pub owner: Pubkey, pub mint: Pubkey, pub amount: u64, pub fee: u64 }
#[event]
pub struct Withdraw { pub owner: Pubkey, pub mint: Pubkey, pub amount: u64, pub fee: u64 }
#[event]
pub struct InternalTransfer { pub from: Pubkey, pub to: Pubkey, pub mint: Pubkey, pub amount: u64 }
#[event]
pub struct FeesCollected { pub to: Pubkey, pub amount: u64 }

#[error_code]
pub enum VaultError {
    #[msg("Invalid fee collector")]
    InvalidFeeCollector,
    #[msg("Amount must exceed the fee")]
    AmountBelowFee,
    #[msg("Zero amount")]
    ZeroAmount,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Cannot transfer to self")]
    SelfTransfer,
    #[msg("Token account mint mismatch")]
    MintMismatch,
    #[msg("Nothing to collect")]
    NothingToCollect,
}
