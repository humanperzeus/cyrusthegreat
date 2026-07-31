//! CyrusTresor — Solana port of the commit/reveal anonymity pool in
//! `contracts/evm/CyrusTresor1.sol`.
//!
//! WHAT PORTS CLEANLY: the whole privacy construction. keccak256 is a Solana
//! syscall, so the commitment scheme carries over directly; epochs are
//! `unix_timestamp / EPOCH_LENGTH` exactly as on EVM; fixed denomination
//! buckets work the same way.
//!
//! WHAT CHANGES:
//!   * `commitments[bytes32]` mapping -> one `Commitment` PDA per commitment,
//!     seeds `[b"commit", commitment]`. PDA existence replaces the
//!     `depositEpoch == 0` "unused" sentinel, and is strictly better: a second
//!     commit with the same hash fails at account creation, so replay is
//!     rejected by the runtime rather than by a require().
//!   * `block.chainid` has no Solana equivalent. The commitment binds
//!     `program_id` instead, which already differs per deployment and per
//!     cluster, giving the same "this proof is not valid elsewhere" property.
//!   * The EVM version reverts if `zkVerifier != address(0)`; v1 here simply
//!     has no verifier field. A v2 would add a separate instruction.
//!
//! PRIVACY CAVEAT, unchanged from the EVM original and worth restating: this is
//! k-anonymity within an epoch+bucket cohort, NOT cryptographic anonymity. An
//! observer watching a bucket with only one participant in an epoch can link
//! commit to reveal. The UI must keep saying so.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_lang::system_program;

declare_id!("9rZHsP3T2n1symzKxyqzE6Ah7VTvTRcvw24DZXjFpDd7");

/// Mirrors `EPOCH_LENGTH = 3600` in the EVM contract.
pub const EPOCH_LENGTH: i64 = 3600;
/// Mirrors the per-token bucket schedule; capped so the account stays bounded.
pub const MAX_BUCKETS: usize = 8;

#[program]
pub mod cyrus_tresor {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        fee_collector: Pubkey,
        fee_lamports: u64,
    ) -> Result<()> {
        require!(fee_collector != Pubkey::default(), TresorError::InvalidFeeCollector);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.fee_collector = fee_collector;
        cfg.fee_lamports = fee_lamports;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// Registers the fixed denominations for a mint. Mirrors the EVM
    /// constructor's `_bucketSchedules`. `Pubkey::default()` == native SOL.
    pub fn set_buckets(ctx: Context<SetBuckets>, mint: Pubkey, sizes: Vec<u64>) -> Result<()> {
        require!(!sizes.is_empty(), TresorError::EmptyBucketSchedule);
        require!(sizes.len() <= MAX_BUCKETS, TresorError::TooManyBuckets);
        require!(sizes.iter().all(|s| *s > 0), TresorError::ZeroBucketSize);
        let pool = &mut ctx.accounts.pool;
        pool.mint = mint;
        pool.sizes = sizes;
        pool.bump = ctx.bumps.pool;
        Ok(())
    }

    /// `commitToPool(commitment, token, bucketIdx)`.
    ///
    /// The caller supplies only the HASH. The preimage never touches the chain
    /// until reveal — that is the entire point, so this instruction cannot and
    /// must not validate it.
    pub fn commit_to_pool(
        ctx: Context<CommitToPool>,
        commitment: [u8; 32],
        bucket_idx: u8,
    ) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let size = *pool
            .sizes
            .get(bucket_idx as usize)
            .ok_or(TresorError::BadBucketIndex)?;

        let fee = ctx.accounts.config.fee_lamports;
        let total = size.checked_add(fee).ok_or(TresorError::MathOverflow)?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.pool_vault.to_account_info(),
                },
            ),
            total,
        )?;

        let clock = Clock::get()?;
        let mint = pool.mint;
        let c = &mut ctx.accounts.commitment_account;
        c.hash = commitment;
        c.deposit_epoch = clock.unix_timestamp / EPOCH_LENGTH;
        c.mint = mint;
        c.bucket_idx = bucket_idx;
        c.spent = false;
        c.bump = ctx.bumps.commitment_account;
        let deposit_epoch = c.deposit_epoch;

        let pot = &mut ctx.accounts.fee_pot;
        pot.accrued = pot.accrued.checked_add(fee).ok_or(TresorError::MathOverflow)?;

        emit!(PoolDeposit { commitment, mint, bucket_idx, deposit_epoch });
        Ok(())
    }

    /// `revealFromPool(secret, userSalt, withdrawTo, token, bucketIdx, zkProof)`.
    ///
    /// Recomputes the commitment from the preimage. Any tampering — above all
    /// with `withdraw_to`, the MEV-redirect target — yields a different hash,
    /// which no longer matches the stored one.
    pub fn reveal_from_pool(
        ctx: Context<RevealFromPool>,
        secret: [u8; 32],
        user_salt: [u8; 32],
        bucket_idx: u8,
    ) -> Result<()> {
        {
            let c = &ctx.accounts.commitment_account;
            require!(!c.spent, TresorError::AlreadySpent);
            require!(c.bucket_idx == bucket_idx, TresorError::BucketMismatch);

            // Epoch separation IS the privacy property: a same-epoch reveal
            // would link deposit and withdrawal directly.
            let clock = Clock::get()?;
            let now_epoch = clock.unix_timestamp / EPOCH_LENGTH;
            require!(now_epoch > c.deposit_epoch, TresorError::SameEpoch);

            let expected = compute_commitment(
                &secret,
                &user_salt,
                &ctx.accounts.withdraw_to.key(),
                &c.mint,
                bucket_idx,
                &crate::ID,
            );
            require!(expected == c.hash, TresorError::CommitmentMismatch);
        }

        let size = *ctx
            .accounts
            .pool
            .sizes
            .get(bucket_idx as usize)
            .ok_or(TresorError::BadBucketIndex)?;

        // Mark spent BEFORE moving value.
        let (hash, mint) = {
            let c = &mut ctx.accounts.commitment_account;
            c.spent = true;
            (c.hash, c.mint)
        };

        **ctx.accounts.pool_vault.to_account_info().try_borrow_mut_lamports()? -= size;
        **ctx.accounts.withdraw_to.to_account_info().try_borrow_mut_lamports()? += size;

        emit!(PoolReveal {
            commitment: hash,
            mint,
            bucket_idx,
            withdraw_to: ctx.accounts.withdraw_to.key(),
        });
        Ok(())
    }

    pub fn collect_fees(ctx: Context<CollectFees>) -> Result<()> {
        let amount = ctx.accounts.fee_pot.accrued;
        require!(amount > 0, TresorError::NothingToCollect);
        ctx.accounts.fee_pot.accrued = 0;
        **ctx.accounts.pool_vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.fee_collector.to_account_info().try_borrow_mut_lamports()? += amount;
        Ok(())
    }
}

/// The EVM side hashes `abi.encode(secret, userSalt, withdrawTo, token,
/// bucketIdx, address(this), block.chainid)`. Same fields, same order; the
/// chain id is replaced by the program id (see the module docs).
pub fn compute_commitment(
    secret: &[u8; 32],
    user_salt: &[u8; 32],
    withdraw_to: &Pubkey,
    mint: &Pubkey,
    bucket_idx: u8,
    program_id: &Pubkey,
) -> [u8; 32] {
    keccak::hashv(&[
        secret,
        user_salt,
        withdraw_to.as_ref(),
        mint.as_ref(),
        &[bucket_idx],
        program_id.as_ref(),
    ])
    .0
}

// ---------------------------------------------------------------- state

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub fee_collector: Pubkey,
    pub fee_lamports: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub mint: Pubkey,
    #[max_len(MAX_BUCKETS)]
    pub sizes: Vec<u64>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Commitment {
    pub hash: [u8; 32],
    pub mint: Pubkey,
    pub deposit_epoch: i64,
    pub bucket_idx: u8,
    pub spent: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct FeePot {
    pub accrued: u64,
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
#[instruction(mint: Pubkey)]
pub struct SetBuckets<'info> {
    #[account(mut, address = config.authority @ TresorError::Unauthorized)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed, payer = authority, space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", mint.as_ref()], bump
    )]
    pub pool: Account<'info, Pool>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(commitment: [u8; 32])]
pub struct CommitToPool<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"pool", pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    /// Freshness is enforced by `init`: a duplicate commitment cannot be created.
    #[account(
        init, payer = depositor, space = 8 + Commitment::INIT_SPACE,
        seeds = [b"commit", commitment.as_ref()], bump
    )]
    pub commitment_account: Account<'info, Commitment>,
    /// CHECK: SOL-custody PDA for pooled deposits; balance-only.
    #[account(mut, seeds = [b"pool_vault"], bump)]
    pub pool_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"fee_pot"], bump = fee_pot.bump)]
    pub fee_pot: Account<'info, FeePot>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealFromPool<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"pool", pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [b"commit", commitment_account.hash.as_ref()],
        bump = commitment_account.bump
    )]
    pub commitment_account: Account<'info, Commitment>,
    /// CHECK: bearer payout target, bound into the commitment hash — tampering
    /// changes the hash and the check fails.
    #[account(mut)]
    pub withdraw_to: UncheckedAccount<'info>,
    /// CHECK: SOL-custody PDA, balance-only.
    #[account(mut, seeds = [b"pool_vault"], bump)]
    pub pool_vault: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CollectFees<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: enforced to equal the configured collector.
    #[account(mut, address = config.fee_collector @ TresorError::Unauthorized)]
    pub fee_collector: UncheckedAccount<'info>,
    /// CHECK: SOL-custody PDA, balance-only.
    #[account(mut, seeds = [b"pool_vault"], bump)]
    pub pool_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"fee_pot"], bump = fee_pot.bump)]
    pub fee_pot: Account<'info, FeePot>,
}

// ---------------------------------------------------------------- events

#[event]
pub struct PoolDeposit {
    pub commitment: [u8; 32],
    pub mint: Pubkey,
    pub bucket_idx: u8,
    pub deposit_epoch: i64,
}

#[event]
pub struct PoolReveal {
    pub commitment: [u8; 32],
    pub mint: Pubkey,
    pub bucket_idx: u8,
    pub withdraw_to: Pubkey,
}

#[error_code]
pub enum TresorError {
    #[msg("Invalid fee collector")]
    InvalidFeeCollector,
    #[msg("Bucket schedule is empty")]
    EmptyBucketSchedule,
    #[msg("Too many buckets")]
    TooManyBuckets,
    #[msg("Bucket size must be non-zero")]
    ZeroBucketSize,
    #[msg("Bucket index out of range")]
    BadBucketIndex,
    #[msg("Commitment already spent")]
    AlreadySpent,
    #[msg("Reveal must happen in a later epoch than the deposit")]
    SameEpoch,
    #[msg("Commitment does not match the supplied preimage")]
    CommitmentMismatch,
    #[msg("Bucket index does not match the commitment")]
    BucketMismatch,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Nothing to collect")]
    NothingToCollect,
}

// ---------------------------------------------------------------- tests
#[cfg(test)]
mod tests {
    use super::*;

    fn pk(b: u8) -> Pubkey { Pubkey::new_from_array([b; 32]) }

    #[test]
    fn commitment_is_deterministic() {
        let a = compute_commitment(&[1; 32], &[2; 32], &pk(3), &pk(4), 0, &pk(5));
        let b = compute_commitment(&[1; 32], &[2; 32], &pk(3), &pk(4), 0, &pk(5));
        assert_eq!(a, b);
    }

    #[test]
    fn changing_withdraw_to_changes_the_hash() {
        // This is the MEV-redirect defence: an attacker who rewrites the payout
        // target must produce a different commitment, which will not match.
        let honest = compute_commitment(&[1; 32], &[2; 32], &pk(3), &pk(4), 0, &pk(5));
        let hijack = compute_commitment(&[1; 32], &[2; 32], &pk(9), &pk(4), 0, &pk(5));
        assert_ne!(honest, hijack);
    }

    #[test]
    fn every_field_is_bound_into_the_hash() {
        let base = compute_commitment(&[1; 32], &[2; 32], &pk(3), &pk(4), 0, &pk(5));
        assert_ne!(base, compute_commitment(&[9; 32], &[2; 32], &pk(3), &pk(4), 0, &pk(5)));
        assert_ne!(base, compute_commitment(&[1; 32], &[9; 32], &pk(3), &pk(4), 0, &pk(5)));
        assert_ne!(base, compute_commitment(&[1; 32], &[2; 32], &pk(3), &pk(9), 0, &pk(5)));
        assert_ne!(base, compute_commitment(&[1; 32], &[2; 32], &pk(3), &pk(4), 1, &pk(5)));
        // program id stands in for block.chainid — a commitment must not be
        // replayable against a different deployment.
        assert_ne!(base, compute_commitment(&[1; 32], &[2; 32], &pk(3), &pk(4), 0, &pk(9)));
    }

    #[test]
    fn epoch_length_matches_the_evm_contract() {
        assert_eq!(EPOCH_LENGTH, 3600);
    }
}
