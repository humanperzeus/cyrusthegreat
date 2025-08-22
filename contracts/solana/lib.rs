use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use anchor_spl::associated_token::AssociatedToken;
use pyth_sdk_solana::state::SolanaPriceAccount;
use pyth_sdk_solana::Price;

// Constants - Performance optimized
const MAX_TRANSACTIONS_PER_SECOND: u8 = 100;
const RATE_LIMIT_WINDOW_SECOND: i64 = 1;
const MAX_TRANSACTIONS_PER_MINUTE: u16 = 1000;
const RATE_LIMIT_WINDOW_MINUTE: i64 = 60;

declare_id!("BXAFYZ4SVLvNJ5rVfYprvaMy88ffQGt4iseromVYTcEw");

#[program]
pub mod crosschain_bank5_optimized {
    use super::*;

    // Initialize bank
    pub fn initialize(ctx: Context<Initialize>, fee_collector: Pubkey, salt: [u8; 32], price_feed_id: [u8; 32]) -> Result<()> {
        let mut bank = &mut ctx.accounts.bank;
        bank.fee_collector = fee_collector;
        bank.salt = salt;
        bank.price_feed_id = price_feed_id;
        bank.price_feed = ctx.accounts.price_feed.key();
        bank.bump = ctx.bumps.bank;
        bank.version = 1;

        emit!(BankInitializedEvent {
            fee_collector,
            salt,
            price_feed_id,
            price_feed: ctx.accounts.price_feed.key(),
        });
        Ok(())
    }

    // Deposit SOL - Performance optimized
    pub fn deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        require!(amount > 0, BankError::ZeroDeposit);

        let price = get_pyth_price(&ctx.accounts.price_feed, &bank.price_feed_id)?;
        let fee = calculate_usd_based_fee(price.price, price.expo)?;
        require!(amount > fee, BankError::AmountMustExceedFee);

        let mut user_vault = &mut ctx.accounts.user_vault;
        user_vault.version = 1;

        let mut fee_vault = &mut ctx.accounts.fee_vault;
        fee_vault.version = 1;

        let token = Pubkey::default();
        check_and_update_anti_spam(&mut user_vault)?;

        let user_key = ctx.accounts.user.key();
        let user_salt = generate_user_salt(&bank.salt, &user_key)?;

        // Optimized vault operations - direct manipulation
        let key = generate_vault_key(&user_key, token, user_salt);
        let mut found = false;

        // Find existing balance slot
        for i in 0..5 {
            if user_vault.balance_keys[i] == key && user_vault.balance_used[i] {
                user_vault.balance_values[i] = user_vault.balance_values[i].checked_add(amount - fee).ok_or(BankError::Overflow)?;
                found = true;
                break;
            }
        }

        // Add to new slot if not found
        if !found {
            require!(user_vault.balance_count < 5, BankError::TooManyBalances);
            let mut slot_found = false;
            for i in 0..5 {
                if !user_vault.balance_used[i] {
                    user_vault.balance_keys[i] = key;
                    user_vault.balance_values[i] = amount - fee;
                    user_vault.balance_used[i] = true;
                    user_vault.balance_count = user_vault.balance_count.checked_add(1).ok_or(BankError::Overflow)?;
                    slot_found = true;
                    break;
                }
            }
            require!(slot_found, BankError::NoAvailableSlots);
        }

        // Track token with zero-copy efficiency
        track_token(&mut user_vault, token)?;

        // Add fee to fee vault
        fee_vault.total_fees = fee_vault.total_fees.checked_add(fee).ok_or(BankError::Overflow)?;
        fee_vault.last_collection = Clock::get()?.unix_timestamp;

        emit!(DepositEvent {
            token,
            user: user_key,
            amount: amount - fee,
        });
        Ok(())
    }

    // Withdraw SOL - Performance optimized
    pub fn withdraw_sol(ctx: Context<WithdrawSol>, amount: u64) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        let mut user_vault = &mut ctx.accounts.user_vault;
        require_eq!(user_vault.version, 1, BankError::InvalidVersion);

        let token = Pubkey::default();
        check_and_update_anti_spam(&mut user_vault)?;

        let user_key = ctx.accounts.user.key();
        let user_salt = generate_user_salt(&bank.salt, &user_key)?;

        // Optimized balance lookup
        let key = generate_vault_key(&user_key, token, user_salt);
        let mut balance = 0u64;
        let mut index = None;

        for i in 0..5 {
            if user_vault.balance_keys[i] == key && user_vault.balance_used[i] {
                balance = user_vault.balance_values[i];
                index = Some(i);
                break;
            }
        }

        require!(balance >= amount, BankError::InsufficientBalance);

        if let Some(i) = index {
            user_vault.balance_values[i] = user_vault.balance_values[i].checked_sub(amount).ok_or(BankError::Overflow)?;

            // Zero-copy cleanup if balance is zero
            if user_vault.balance_values[i] == 0 {
                user_vault.balance_used[i] = false;
                for j in 0..5 {
                    if user_vault.user_tokens[j] == token && user_vault.token_used[j] {
                        user_vault.token_used[j] = false;
                        break;
                    }
                }
                emit!(TokenPrunedEvent {
                    user: user_key,
                    token,
                });
            }
        }

        emit!(WithdrawEvent {
            token,
            user: user_key,
            amount,
        });
        Ok(())
    }

    // Internal transfer SOL - Anonymous banking feature
    pub fn transfer_internal_sol(ctx: Context<TransferInternalSol>, to: Pubkey, amount: u64) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        let mut user_vault = &mut ctx.accounts.user_vault;
        require_eq!(user_vault.version, 1, BankError::InvalidVersion);
        let mut recipient_vault = &mut ctx.accounts.recipient_vault;
        if recipient_vault.version == 0 {
            recipient_vault.version = 1;
        }

        require!(to != ctx.accounts.user.key(), BankError::InvalidRecipient);
        require!(to == ctx.accounts.recipient.key(), BankError::InvalidRecipient);

        let token = Pubkey::default();
        check_and_update_anti_spam(&mut user_vault)?;

        let from_key = ctx.accounts.user.key();
        let user_salt = generate_user_salt(&bank.salt, &from_key)?;

        // Optimized subtract from sender
        let key = generate_vault_key(&from_key, token, user_salt);
        let mut balance = 0u64;
        let mut index = None;

        for i in 0..5 {
            if user_vault.balance_keys[i] == key && user_vault.balance_used[i] {
                balance = user_vault.balance_values[i];
                index = Some(i);
                break;
            }
        }

        require!(balance >= amount, BankError::InsufficientBalance);

        if let Some(i) = index {
            user_vault.balance_values[i] = user_vault.balance_values[i].checked_sub(amount).ok_or(BankError::Overflow)?;
        }

        // Optimized add to recipient
        let recipient_salt = generate_user_salt(&bank.salt, &to)?;
        let key = generate_vault_key(&to, token, recipient_salt);
        let mut found = false;

        for i in 0..5 {
            if recipient_vault.balance_keys[i] == key && recipient_vault.balance_used[i] {
                recipient_vault.balance_values[i] = recipient_vault.balance_values[i].checked_add(amount).ok_or(BankError::Overflow)?;
                found = true;
                break;
            }
        }

        if !found {
            require!(recipient_vault.balance_count < 5, BankError::TooManyBalances);
            let mut slot_found = false;
            for i in 0..5 {
                if !recipient_vault.balance_used[i] {
                    recipient_vault.balance_keys[i] = key;
                    recipient_vault.balance_values[i] = amount;
                    recipient_vault.balance_used[i] = true;
                    recipient_vault.balance_count = recipient_vault.balance_count.checked_add(1).ok_or(BankError::Overflow)?;
                    slot_found = true;
                    break;
                }
            }
            require!(slot_found, BankError::NoAvailableSlots);
        }

        // Track token for recipient
        track_token(&mut recipient_vault, token)?;

        // Zero-copy cleanup for sender
        if let Some(i) = index {
            if user_vault.balance_values[i] == 0 {
                user_vault.balance_used[i] = false;
                for j in 0..5 {
                    if user_vault.user_tokens[j] == token && user_vault.token_used[j] {
                        user_vault.token_used[j] = false;
                        break;
                    }
                }
            }
        }

        emit!(InternalTransferEvent {
            token,
            from: from_key,
            to,
            amount,
        });
        Ok(())
    }

    // Deposit SPL Token - Full SPL integration
    pub fn deposit_token(ctx: Context<DepositToken>, amount: u64) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        require!(amount > 0, BankError::ZeroDeposit);

        let price = get_pyth_price(&ctx.accounts.price_feed, &bank.price_feed_id)?;
        let fee = calculate_usd_based_fee(price.price, price.expo)?;
        require!(amount > fee, BankError::AmountMustExceedFee);

        let (authority, _) = Pubkey::find_program_address(&[b"program_authority"], &ctx.program_id);
        require!(ctx.accounts.program_authority.key() == authority, BankError::NotAuthorized);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.program_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        let mut user_vault = &mut ctx.accounts.user_vault;
        user_vault.version = 1;

        let token = ctx.accounts.token_mint.key();
        let user_key = ctx.accounts.user.key();
        let user_salt = generate_user_salt(&bank.salt, &user_key)?;

        // Optimized vault operations for SPL tokens
        let key = generate_vault_key(&user_key, token, user_salt);
        let mut found = false;

        for i in 0..5 {
            if user_vault.balance_keys[i] == key && user_vault.balance_used[i] {
                user_vault.balance_values[i] = user_vault.balance_values[i].checked_add(amount).ok_or(BankError::Overflow)?;
                found = true;
                break;
            }
        }

        if !found {
            require!(user_vault.balance_count < 5, BankError::TooManyBalances);
            let mut slot_found = false;
            for i in 0..5 {
                if !user_vault.balance_used[i] {
                    user_vault.balance_keys[i] = key;
                    user_vault.balance_values[i] = amount;
                    user_vault.balance_used[i] = true;
                    user_vault.balance_count = user_vault.balance_count.checked_add(1).ok_or(BankError::Overflow)?;
                    slot_found = true;
                    break;
                }
            }
            require!(slot_found, BankError::NoAvailableSlots);
        }

        track_token(&mut user_vault, token)?;

        emit!(DepositEvent {
            token,
            user: user_key,
            amount,
        });
        Ok(())
    }

    // Withdraw SPL Token - Full SPL integration
    pub fn withdraw_token(ctx: Context<WithdrawToken>, amount: u64) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        let mut user_vault = &mut ctx.accounts.user_vault;
        require_eq!(user_vault.version, 1, BankError::InvalidVersion);

        let (authority, _) = Pubkey::find_program_address(&[b"program_authority"], &ctx.program_id);
        require!(ctx.accounts.program_authority.key() == authority, BankError::NotAuthorized);

        let token = ctx.accounts.token_mint.key();
        let user_key = ctx.accounts.user.key();
        let user_salt = generate_user_salt(&bank.salt, &user_key)?;

        // Optimized balance check and withdrawal
        let key = generate_vault_key(&user_key, token, user_salt);
        let mut balance = 0u64;
        let mut index = None;

        for i in 0..5 {
            if user_vault.balance_keys[i] == key && user_vault.balance_used[i] {
                balance = user_vault.balance_values[i];
                index = Some(i);
                break;
            }
        }

        require!(balance >= amount, BankError::InsufficientBalance);

        if let Some(i) = index {
            user_vault.balance_values[i] = user_vault.balance_values[i].checked_sub(amount).ok_or(BankError::Overflow)?;
        }

        // Zero-copy cleanup
        if let Some(i) = index {
            if user_vault.balance_values[i] == 0 {
                user_vault.balance_used[i] = false;
                for j in 0..5 {
                    if user_vault.user_tokens[j] == token && user_vault.token_used[j] {
                        user_vault.token_used[j] = false;
                        break;
                    }
                }
                emit!(TokenPrunedEvent {
                    user: user_key,
                    token,
                });
            }
        }

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.program_token_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.program_authority.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(WithdrawEvent {
            token,
            user: user_key,
            amount,
        });
        Ok(())
    }

    // Transfer Internal Token - Anonymous SPL transfers
    pub fn transfer_internal_token(ctx: Context<TransferInternalToken>, to: Pubkey, amount: u64) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        let mut user_vault = &mut ctx.accounts.user_vault;
        require_eq!(user_vault.version, 1, BankError::InvalidVersion);
        let mut recipient_vault = &mut ctx.accounts.recipient_vault;
        if recipient_vault.version == 0 {
            recipient_vault.version = 1;
        }

        require!(to != ctx.accounts.user.key(), BankError::InvalidRecipient);
        require!(to == ctx.accounts.recipient.key(), BankError::InvalidRecipient);

        let token = ctx.accounts.token_mint.key();
        check_and_update_anti_spam(&mut user_vault)?;

        let from_key = ctx.accounts.user.key();
        let user_salt = generate_user_salt(&bank.salt, &from_key)?;

        // Optimized subtract from sender
        let key = generate_vault_key(&from_key, token, user_salt);
        let mut balance = 0u64;
        let mut index = None;

        for i in 0..5 {
            if user_vault.balance_keys[i] == key && user_vault.balance_used[i] {
                balance = user_vault.balance_values[i];
                index = Some(i);
                break;
            }
        }

        require!(balance >= amount, BankError::InsufficientBalance);

        if let Some(i) = index {
            user_vault.balance_values[i] = user_vault.balance_values[i].checked_sub(amount).ok_or(BankError::Overflow)?;
        }

        // Optimized add to recipient
        let recipient_salt = generate_user_salt(&bank.salt, &to)?;
        let key = generate_vault_key(&to, token, recipient_salt);
        let mut found = false;

        for i in 0..5 {
            if recipient_vault.balance_keys[i] == key && recipient_vault.balance_used[i] {
                recipient_vault.balance_values[i] = recipient_vault.balance_values[i].checked_add(amount).ok_or(BankError::Overflow)?;
                found = true;
                break;
            }
        }

        if !found {
            require!(recipient_vault.balance_count < 5, BankError::TooManyBalances);
            let mut slot_found = false;
            for i in 0..5 {
                if !recipient_vault.balance_used[i] {
                    recipient_vault.balance_keys[i] = key;
                    recipient_vault.balance_values[i] = amount;
                    recipient_vault.balance_used[i] = true;
                    recipient_vault.balance_count = recipient_vault.balance_count.checked_add(1).ok_or(BankError::Overflow)?;
                    slot_found = true;
                    break;
                }
            }
            require!(slot_found, BankError::NoAvailableSlots);
        }

        track_token(&mut recipient_vault, token)?;

        // Zero-copy cleanup for sender
        if let Some(i) = index {
            if user_vault.balance_values[i] == 0 {
                user_vault.balance_used[i] = false;
                for j in 0..5 {
                    if user_vault.user_tokens[j] == token && user_vault.token_used[j] {
                        user_vault.token_used[j] = false;
                        break;
                    }
                }
            }
        }

        emit!(InternalTransferEvent {
            token,
            from: from_key,
            to,
            amount,
        });
        Ok(())
    }

    // Multi-Token Internal Transfer - Anonymous batch transfers
    pub fn transfer_multiple_tokens_internal(ctx: Context<TransferMultipleTokensInternal>, amounts: Vec<u64>) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        let mut user_vault = &mut ctx.accounts.user_vault;
        require_eq!(user_vault.version, 1, BankError::InvalidVersion);
        let mut recipient_vault = &mut ctx.accounts.recipient_vault;

        require!(amounts.len() > 0 && amounts.len() <= 5, BankError::InvalidInput);
        require!(ctx.accounts.user.key() != ctx.accounts.recipient.key(), BankError::InvalidRecipient);

        if recipient_vault.version == 0 {
            recipient_vault.version = 1;
        }

        let user_key = ctx.accounts.user.key();
        let user_salt = generate_user_salt(&bank.salt, &user_key)?;

        check_and_update_anti_spam(&mut user_vault)?;

        // Process each token in the custom bundle transfer
        for (i, &amount) in amounts.iter().enumerate() {
            require!(amount > 0, BankError::ZeroTransfer);

            let token_mint = match i {
                0 => ctx.accounts.token_mint_1.as_ref(),
                1 => ctx.accounts.token_mint_2.as_ref(),
                2 => ctx.accounts.token_mint_3.as_ref(),
                3 => ctx.accounts.token_mint_4.as_ref(),
                4 => ctx.accounts.token_mint_5.as_ref(),
                _ => return Err(BankError::InvalidInput.into()),
            };

            if let Some(mint) = token_mint {
                let token = mint.key();
                let recipient_key = ctx.accounts.recipient.key();
                let recipient_salt = generate_user_salt(&bank.salt, &recipient_key)?;

                // Check sender balance for this token
                let sender_key = generate_vault_key(&user_key, token, user_salt);
                let mut sender_balance = 0u64;
                let mut sender_index = None;

                for j in 0..5 {
                    if user_vault.balance_keys[j] == sender_key && user_vault.balance_used[j] {
                        sender_balance = user_vault.balance_values[j];
                        sender_index = Some(j);
                        break;
                    }
                }

                require!(sender_balance >= amount, BankError::InsufficientBalance);

                // Update sender vault (subtract)
                if let Some(j) = sender_index {
                    user_vault.balance_values[j] = user_vault.balance_values[j].checked_sub(amount).ok_or(BankError::Overflow)?;

                    // Clean up sender if balance is zero
                    if user_vault.balance_values[j] == 0 {
                        user_vault.balance_used[j] = false;
                        for k in 0..5 {
                            if user_vault.user_tokens[k] == token && user_vault.token_used[k] {
                                user_vault.token_count = user_vault.token_count.checked_sub(1).ok_or(BankError::Overflow)?;
                                user_vault.token_used[k] = false;
                                break;
                            }
                        }
                    }
                }

                // Update recipient vault (add)
                let recipient_vault_key = generate_vault_key(&recipient_key, token, recipient_salt);
                let mut recipient_found = false;

                for j in 0..5 {
                    if recipient_vault.balance_keys[j] == recipient_vault_key && recipient_vault.balance_used[j] {
                        recipient_vault.balance_values[j] = recipient_vault.balance_values[j].checked_add(amount).ok_or(BankError::Overflow)?;
                        recipient_found = true;
                        break;
                    }
                }

                if !recipient_found {
                    require!(recipient_vault.balance_count < 5, BankError::TooManyBalances);
                    let mut slot_found = false;
                    for j in 0..5 {
                        if !recipient_vault.balance_used[j] {
                            recipient_vault.balance_keys[j] = recipient_vault_key;
                            recipient_vault.balance_values[j] = amount;
                            recipient_vault.balance_used[j] = true;
                            recipient_vault.balance_count = recipient_vault.balance_count.checked_add(1).ok_or(BankError::Overflow)?;
                            slot_found = true;
                            break;
                        }
                    }
                    require!(slot_found, BankError::NoAvailableSlots);
                }

                track_token(&mut recipient_vault, token)?;

                emit!(InternalTransferEvent {
                    token,
                    from: user_key,
                    to: recipient_key,
                    amount,
                });
            }
        }

        Ok(())
    }

    // Multi-Token Deposit - Custom bundle deposits (no presets)
    pub fn deposit_multiple_tokens(ctx: Context<DepositMultipleTokens>, amounts: Vec<u64>) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        require!(amounts.len() > 0 && amounts.len() <= 5, BankError::InvalidInput);

        let price = get_pyth_price(&ctx.accounts.price_feed, &bank.price_feed_id)?;
        let (authority, _) = Pubkey::find_program_address(&[b"program_authority"], &ctx.program_id);
        require!(ctx.accounts.program_authority.key() == authority, BankError::NotAuthorized);

        let mut user_vault = &mut ctx.accounts.user_vault;
        user_vault.version = 1;

        let user_key = ctx.accounts.user.key();
        let user_salt = generate_user_salt(&bank.salt, &user_key)?;

        // Process each token in the custom bundle
        for (i, &amount) in amounts.iter().enumerate() {
            require!(amount > 0, BankError::ZeroDeposit);

            let fee = calculate_usd_based_fee(price.price, price.expo)?;
            require!(amount > fee, BankError::AmountMustExceedFee);

            // Get token mint from instruction data (passed via accounts)
            let token_mint = match i {
                0 => ctx.accounts.token_mint_1.as_ref(),
                1 => ctx.accounts.token_mint_2.as_ref(),
                2 => ctx.accounts.token_mint_3.as_ref(),
                3 => ctx.accounts.token_mint_4.as_ref(),
                4 => ctx.accounts.token_mint_5.as_ref(),
                _ => return Err(BankError::InvalidInput.into()),
            };

            if let Some(mint) = token_mint {
                let token = mint.key();

                // Transfer token using associated token accounts
                token::transfer(
                    CpiContext::new(
                        ctx.accounts.token_program.to_account_info(),
                        token::Transfer {
                            from: match i {
                                0 => ctx.accounts.user_token_account_1.to_account_info(),
                                1 => ctx.accounts.user_token_account_2.as_ref().unwrap().to_account_info(),
                                2 => ctx.accounts.user_token_account_3.as_ref().unwrap().to_account_info(),
                                3 => ctx.accounts.user_token_account_4.as_ref().unwrap().to_account_info(),
                                4 => ctx.accounts.user_token_account_5.as_ref().unwrap().to_account_info(),
                                _ => return Err(BankError::InvalidInput.into()),
                            },
                            to: match i {
                                0 => ctx.accounts.program_token_account_1.to_account_info(),
                                1 => ctx.accounts.program_token_account_2.as_ref().unwrap().to_account_info(),
                                2 => ctx.accounts.program_token_account_3.as_ref().unwrap().to_account_info(),
                                3 => ctx.accounts.program_token_account_4.as_ref().unwrap().to_account_info(),
                                4 => ctx.accounts.program_token_account_5.as_ref().unwrap().to_account_info(),
                                _ => return Err(BankError::InvalidInput.into()),
                            },
                            authority: ctx.accounts.user.to_account_info(),
                        },
                    ),
                    amount,
                )?;

                // Update vault balance for this token
                let key = generate_vault_key(&user_key, token, user_salt);
                let mut found = false;

                for j in 0..5 {
                    if user_vault.balance_keys[j] == key && user_vault.balance_used[j] {
                        user_vault.balance_values[j] = user_vault.balance_values[j].checked_add(amount).ok_or(BankError::Overflow)?;
                        found = true;
                        break;
                    }
                }

                if !found {
                    require!(user_vault.balance_count < 5, BankError::TooManyBalances);
                    let mut slot_found = false;
                    for j in 0..5 {
                        if !user_vault.balance_used[j] {
                            user_vault.balance_keys[j] = key;
                            user_vault.balance_values[j] = amount;
                            user_vault.balance_used[j] = true;
                            user_vault.balance_count = user_vault.balance_count.checked_add(1).ok_or(BankError::Overflow)?;
                            slot_found = true;
                            break;
                        }
                    }
                    require!(slot_found, BankError::NoAvailableSlots);
                }

                track_token(&mut user_vault, token)?;

                emit!(DepositEvent {
                    token,
                    user: user_key,
                    amount,
                });
            }
        }

        Ok(())
    }

    // Multi-Token Withdrawal - Custom bundle withdrawals (no presets)
    pub fn withdraw_multiple_tokens(ctx: Context<WithdrawMultipleTokens>, amounts: Vec<u64>) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        let mut user_vault = &mut ctx.accounts.user_vault;
        require_eq!(user_vault.version, 1, BankError::InvalidVersion);

        require!(amounts.len() > 0 && amounts.len() <= 5, BankError::InvalidInput);

        let (authority, _) = Pubkey::find_program_address(&[b"program_authority"], &ctx.program_id);
        require!(ctx.accounts.program_authority.key() == authority, BankError::NotAuthorized);

        let user_key = ctx.accounts.user.key();
        let user_salt = generate_user_salt(&bank.salt, &user_key)?;

        // Process each token in the custom bundle
        for (i, &amount) in amounts.iter().enumerate() {
            require!(amount > 0, BankError::ZeroWithdrawal);

            let token_mint = match i {
                0 => ctx.accounts.token_mint_1.as_ref(),
                1 => ctx.accounts.token_mint_2.as_ref(),
                2 => ctx.accounts.token_mint_3.as_ref(),
                3 => ctx.accounts.token_mint_4.as_ref(),
                4 => ctx.accounts.token_mint_5.as_ref(),
                _ => return Err(BankError::InvalidInput.into()),
            };

            if let Some(mint) = token_mint {
                let token = mint.key();

                // Check balance for this token
                let key = generate_vault_key(&user_key, token, user_salt);
                let mut balance = 0u64;
                let mut index = None;

                for j in 0..5 {
                    if user_vault.balance_keys[j] == key && user_vault.balance_used[j] {
                        balance = user_vault.balance_values[j];
                        index = Some(j);
                        break;
                    }
                }

                require!(balance >= amount, BankError::InsufficientBalance);

                // Transfer token from program to user
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        token::Transfer {
                            from: match i {
                                0 => ctx.accounts.program_token_account_1.to_account_info(),
                                1 => ctx.accounts.program_token_account_2.as_ref().unwrap().to_account_info(),
                                2 => ctx.accounts.program_token_account_3.as_ref().unwrap().to_account_info(),
                                3 => ctx.accounts.program_token_account_4.as_ref().unwrap().to_account_info(),
                                4 => ctx.accounts.program_token_account_5.as_ref().unwrap().to_account_info(),
                                _ => return Err(BankError::InvalidInput.into()),
                            },
                            to: match i {
                                0 => ctx.accounts.user_token_account_1.to_account_info(),
                                1 => ctx.accounts.user_token_account_2.as_ref().unwrap().to_account_info(),
                                2 => ctx.accounts.user_token_account_3.as_ref().unwrap().to_account_info(),
                                3 => ctx.accounts.user_token_account_4.as_ref().unwrap().to_account_info(),
                                4 => ctx.accounts.user_token_account_5.as_ref().unwrap().to_account_info(),
                                _ => return Err(BankError::InvalidInput.into()),
                            },
                            authority: ctx.accounts.program_authority.to_account_info(),
                        },
                        &[&[b"program_authority", &[ctx.bumps.program_authority]]],
                    ),
                    amount,
                )?;

                // Update vault balance
                if let Some(j) = index {
                    user_vault.balance_values[j] = user_vault.balance_values[j].checked_sub(amount).ok_or(BankError::Overflow)?;

                    // Clean up if balance is zero
                    if user_vault.balance_values[j] == 0 {
                        user_vault.balance_used[j] = false;
                        for k in 0..5 {
                            if user_vault.user_tokens[k] == token && user_vault.token_used[k] {
                                user_vault.token_used[k] = false;
                                user_vault.token_count = user_vault.token_count.checked_sub(1).ok_or(BankError::Overflow)?;
                                break;
                            }
                        }
                    }
                }

                emit!(WithdrawEvent {
                    token,
                    user: user_key,
                    amount,
                });
            }
        }

        Ok(())
    }

    // Get current fee - Price feed integration
    pub fn get_current_fee(ctx: Context<GetCurrentFee>) -> Result<u64> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);

        let price = get_pyth_price(&ctx.accounts.price_feed, &bank.price_feed_id)?;
        calculate_usd_based_fee(price.price, price.expo)
    }

    // Get user's vaulted tokens - Complete vault overview
    pub fn get_my_vaulted_tokens(ctx: Context<GetMyVaultedTokens>) -> Result<Vec<(Pubkey, u64)>> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        let user_vault = &ctx.accounts.user_vault;
        require_eq!(user_vault.version, 1, BankError::InvalidVersion);

        let user_key = ctx.accounts.user.key();
        let user_salt = generate_user_salt(&bank.salt, &user_key)?;

        let mut result = Vec::with_capacity(25); // Support for all expansion vaults

        // Process starter vault
        for i in 0..5 {
            if user_vault.token_used[i] {
                let token = user_vault.user_tokens[i];
                let key = generate_vault_key(&user_key, token, user_salt);
                let mut balance = 0u64;
                for j in 0..5 {
                    if user_vault.balance_keys[j] == key && user_vault.balance_used[j] {
                        balance = user_vault.balance_values[j];
                        break;
                    }
                }
                if balance > 0 {
                    result.push((token, balance));
                }
            }
        }

        // Process expansion vaults if they exist
        if let Some(expansion_vault_1_info) = &ctx.accounts.expansion_vault_1 {
            if let Ok(expansion_vault_1) = ExpansionVault::try_deserialize(&mut &expansion_vault_1_info.data.borrow()[..]) {
                require_eq!(expansion_vault_1.version, 1, BankError::InvalidVersion);
                for i in 0..5 {
                    if expansion_vault_1.token_used[i] {
                        let token = expansion_vault_1.user_tokens[i];
                        let key = generate_vault_key(&user_key, token, user_salt);
                        let mut balance = 0u64;
                        for j in 0..5 {
                            if expansion_vault_1.balance_keys[j] == key && expansion_vault_1.balance_used[j] {
                                balance = expansion_vault_1.balance_values[j];
                                break;
                            }
                        }
                        if balance > 0 {
                            result.push((token, balance));
                        }
                    }
                }
            }
        }

        if let Some(expansion_vault_2_info) = &ctx.accounts.expansion_vault_2 {
            if let Ok(expansion_vault_2) = ExpansionVault::try_deserialize(&mut &expansion_vault_2_info.data.borrow()[..]) {
                require_eq!(expansion_vault_2.version, 1, BankError::InvalidVersion);
                for i in 0..5 {
                    if expansion_vault_2.token_used[i] {
                        let token = expansion_vault_2.user_tokens[i];
                        let key = generate_vault_key(&user_key, token, user_salt);
                        let mut balance = 0u64;
                        for j in 0..5 {
                            if expansion_vault_2.balance_keys[j] == key && expansion_vault_2.balance_used[j] {
                                balance = expansion_vault_2.balance_values[j];
                                break;
                            }
                        }
                        if balance > 0 {
                            result.push((token, balance));
                        }
                    }
                }
            }
        }

        if let Some(expansion_vault_3_info) = &ctx.accounts.expansion_vault_3 {
            if let Ok(expansion_vault_3) = ExpansionVault::try_deserialize(&mut &expansion_vault_3_info.data.borrow()[..]) {
                require_eq!(expansion_vault_3.version, 1, BankError::InvalidVersion);
                for i in 0..5 {
                    if expansion_vault_3.token_used[i] {
                        let token = expansion_vault_3.user_tokens[i];
                        let key = generate_vault_key(&user_key, token, user_salt);
                        let mut balance = 0u64;
                        for j in 0..5 {
                            if expansion_vault_3.balance_keys[j] == key && expansion_vault_3.balance_used[j] {
                                balance = expansion_vault_3.balance_values[j];
                                break;
                            }
                        }
                        if balance > 0 {
                            result.push((token, balance));
                        }
                    }
                }
            }
        }

        if let Some(expansion_vault_4_info) = &ctx.accounts.expansion_vault_4 {
            if let Ok(expansion_vault_4) = ExpansionVault::try_deserialize(&mut &expansion_vault_4_info.data.borrow()[..]) {
                require_eq!(expansion_vault_4.version, 1, BankError::InvalidVersion);
                for i in 0..5 {
                    if expansion_vault_4.token_used[i] {
                        let token = expansion_vault_4.user_tokens[i];
                        let key = generate_vault_key(&user_key, token, user_salt);
                        let mut balance = 0u64;
                        for j in 0..5 {
                            if expansion_vault_4.balance_keys[j] == key && expansion_vault_4.balance_used[j] {
                                balance = expansion_vault_4.balance_values[j];
                                break;
                            }
                        }
                        if balance > 0 {
                            result.push((token, balance));
                        }
                    }
                }
            }
        }

        Ok(result)
    }

    // Collect fees - Fee collector functionality
    pub fn collect_fees(ctx: Context<CollectFees>) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        let mut fee_vault = &mut ctx.accounts.fee_vault;
        require_eq!(fee_vault.version, 1, BankError::InvalidVersion);
        require!(ctx.accounts.fee_collector.key() == bank.fee_collector, BankError::NotAuthorized);

        let total_fees = fee_vault.total_fees;
        require!(total_fees > 0, BankError::NoFees);

        fee_vault.total_fees = 0;
        fee_vault.last_collection = Clock::get()?.unix_timestamp;

        emit!(FeesCollectedEvent { amount: total_fees });
        Ok(())
    }

    // Create expansion vault - Progressive expansion system
    pub fn create_expansion_vault(ctx: Context<CreateExpansionVault>) -> Result<()> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);

        // Store keys before mutable borrow
        let user_vault_key = ctx.accounts.user_vault.key();
        let expansion_vault_key = ctx.accounts.expansion_vault.key();
        let user_key = ctx.accounts.user.key();

        let mut user_vault = &mut ctx.accounts.user_vault;
        require_eq!(user_vault.version, 1, BankError::InvalidVersion);

        // Determine current phase and requirements
        let current_phase = if user_vault.expansion_vault_1.is_none() { 1 }
        else if user_vault.expansion_vault_2.is_none() { 2 }
        else if user_vault.expansion_vault_3.is_none() { 3 }
        else if user_vault.expansion_vault_4.is_none() { 4 }
        else { return Err(BankError::AllExpansionsCreated.into()) };

        let required_tokens = match current_phase {
            1 => 5,
            2 => 10,
            3 => 15,
            4 => 20,
            _ => return Err(BankError::InvalidPhase.into()),
        };

        require!(user_vault.token_count >= required_tokens, BankError::PreviousVaultNotFull);

        let mut expansion_vault = &mut ctx.accounts.expansion_vault;
        expansion_vault.parent_vault = user_vault_key;
        expansion_vault.user_owner = user_key;
        expansion_vault.vault_phase = current_phase;
        expansion_vault.version = 1;

        // Link expansion vault to user vault
        match current_phase {
            1 => user_vault.expansion_vault_1 = Some(expansion_vault_key),
            2 => user_vault.expansion_vault_2 = Some(expansion_vault_key),
            3 => user_vault.expansion_vault_3 = Some(expansion_vault_key),
            4 => user_vault.expansion_vault_4 = Some(expansion_vault_key),
            _ => return Err(BankError::InvalidPhase.into()),
        };

        user_vault.current_phase = current_phase;
        user_vault.total_capacity = 5 + (current_phase as u16 * 5);

        emit!(ExpansionVaultCreatedEvent {
            user: user_key,
            starter_vault: user_vault_key,
            expansion_vault: expansion_vault_key,
            total_capacity: user_vault.total_capacity,
        });
        Ok(())
    }

    // Get vault info - Complete vault status
    pub fn get_vault_info(ctx: Context<GetMyVaultedTokens>) -> Result<VaultInfo> {
        let bank = &ctx.accounts.bank;
        require_eq!(bank.version, 1, BankError::InvalidVersion);
        let user_vault = &ctx.accounts.user_vault;
        require_eq!(user_vault.version, 1, BankError::InvalidVersion);

        let info = VaultInfo {
            starter_tokens: user_vault.token_count,
            starter_capacity: 5,
            has_expansion_1: user_vault.expansion_vault_1.is_some(),
            has_expansion_2: user_vault.expansion_vault_2.is_some(),
            has_expansion_3: user_vault.expansion_vault_3.is_some(),
            has_expansion_4: user_vault.expansion_vault_4.is_some(),
            total_capacity: user_vault.total_capacity,
            current_phase: user_vault.current_phase,
        };
        Ok(info)
    }
}

// Account structures - Performance optimized without zero-copy issues
#[account]
pub struct Bank {
    pub fee_collector: Pubkey,
    pub salt: [u8; 32],
    pub price_feed_id: [u8; 32],
    pub price_feed: Pubkey,
    pub bump: u8,
    pub version: u8,
}

#[account]
pub struct UserVault {
    // Balance storage - optimized for performance
    pub balance_keys: [[u8; 32]; 5],
    pub balance_values: [u64; 5],
    pub balance_count: u8,
    pub balance_used: [bool; 5],

    // Token tracking - optimized for performance
    pub user_tokens: [Pubkey; 5],
    pub token_count: u8,
    pub token_used: [bool; 5],

    // Expansion vault system
    pub expansion_vault_1: Option<Pubkey>,
    pub expansion_vault_2: Option<Pubkey>,
    pub expansion_vault_3: Option<Pubkey>,
    pub expansion_vault_4: Option<Pubkey>,
    pub total_capacity: u16,
    pub current_phase: u8,

    // Anti-spam protection
    pub transaction_count_second: u8,
    pub transaction_count_minute: u16,
    pub last_transaction_second: i64,
    pub last_transaction_minute: i64,
    pub version: u8,
}

#[account]
pub struct FeeVault {
    pub total_fees: u64,
    pub last_collection: i64,
    pub version: u8,
}

#[account]
pub struct ExpansionVault {
    // Balance storage - same structure as UserVault for consistency
    pub balance_keys: [[u8; 32]; 5],
    pub balance_values: [u64; 5],
    pub balance_count: u8,
    pub balance_used: [bool; 5],

    // Token tracking - same structure as UserVault for consistency
    pub user_tokens: [Pubkey; 5],
    pub token_count: u8,
    pub token_used: [bool; 5],

    // Linking and metadata
    pub parent_vault: Pubkey,
    pub user_owner: Pubkey,
    pub vault_phase: u8,
    pub version: u8,
}

// Events - optimized for performance
#[event]
pub struct BankInitializedEvent {
    pub fee_collector: Pubkey,
    pub salt: [u8; 32],
    pub price_feed_id: [u8; 32],
    pub price_feed: Pubkey,
}

#[event]
pub struct DepositEvent {
    pub token: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct WithdrawEvent {
    pub token: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct InternalTransferEvent {
    pub token: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct FeesCollectedEvent {
    pub amount: u64,
}

#[event]
pub struct TokenPrunedEvent {
    pub user: Pubkey,
    pub token: Pubkey,
}

#[event]
pub struct ExpansionVaultCreatedEvent {
    pub user: Pubkey,
    pub starter_vault: Pubkey,
    pub expansion_vault: Pubkey,
    pub total_capacity: u16,
}

#[event]
pub struct VaultInfo {
    pub starter_tokens: u8,
    pub starter_capacity: u8,
    pub has_expansion_1: bool,
    pub has_expansion_2: bool,
    pub has_expansion_3: bool,
    pub has_expansion_4: bool,
    pub total_capacity: u16,
    pub current_phase: u8,
}

// Account contexts - Optimized for performance
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 32 + 32 + 1 + 1,
        seeds = [b"bank"],
        bump
    )]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Pyth price feed account
    pub price_feed: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 160 + 40 + 1 + 5 + 160 + 1 + 5 + 128 + 2 + 1 + 2 + 8 + 1,
        seeds = [b"user_vault", user.key().as_ref()],
        bump
    )]
    pub user_vault: Box<Account<'info, UserVault>>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 8 + 8 + 1,
        seeds = [b"fee_vault"],
        bump
    )]
    pub fee_vault: Account<'info, FeeVault>,
    /// CHECK: Pyth price feed account
    pub price_feed: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawSol<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_vault: Box<Account<'info, UserVault>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferInternalSol<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_vault: Box<Account<'info, UserVault>>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 160 + 40 + 1 + 5 + 160 + 1 + 5 + 128 + 2 + 1 + 2 + 8 + 1,
        seeds = [b"user_vault", recipient.key().as_ref()],
        bump
    )]
    pub recipient_vault: Box<Account<'info, UserVault>>,
    /// CHECK: Recipient account
    pub recipient: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToken<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint,
        associated_token::authority = program_authority,
    )]
    pub program_token_account: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    /// CHECK: Program authority
    #[account(seeds = [b"program_authority"], bump)]
    pub program_authority: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 160 + 40 + 1 + 5 + 160 + 1 + 5 + 128 + 2 + 1 + 2 + 8 + 1,
        seeds = [b"user_vault", user.key().as_ref()],
        bump
    )]
    pub user_vault: Box<Account<'info, UserVault>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    /// CHECK: Pyth price feed account
    pub price_feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct WithdrawToken<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub program_token_account: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    /// CHECK: Program authority
    #[account(seeds = [b"program_authority"], bump)]
    pub program_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub user_vault: Box<Account<'info, UserVault>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferInternalToken<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_vault: Box<Account<'info, UserVault>>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 160 + 40 + 1 + 5 + 160 + 1 + 5 + 128 + 2 + 1 + 2 + 8 + 1,
        seeds = [b"user_vault", recipient.key().as_ref()],
        bump
    )]
    pub recipient_vault: Box<Account<'info, UserVault>>,
    /// CHECK: Recipient account
    pub recipient: AccountInfo<'info>,
    pub token_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositMultipleTokens<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 160 + 40 + 1 + 5 + 160 + 1 + 5 + 128 + 2 + 1 + 2 + 8 + 1,
        seeds = [b"user_vault", user.key().as_ref()],
        bump
    )]
    pub user_vault: Box<Account<'info, UserVault>>,
    /// CHECK: Pyth price feed account
    pub price_feed: AccountInfo<'info>,
    /// CHECK: Program authority
    #[account(seeds = [b"program_authority"], bump)]
    pub program_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    // Optional token accounts for custom bundles (up to 5 tokens)
    pub user_token_account_1: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint_1,
        associated_token::authority = program_authority,
    )]
    pub program_token_account_1: Account<'info, TokenAccount>,
    pub token_mint_1: Option<Account<'info, Mint>>,

    pub user_token_account_2: Option<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint_2,
        associated_token::authority = program_authority,
    )]
    pub program_token_account_2: Option<Account<'info, TokenAccount>>,
    pub token_mint_2: Option<Account<'info, Mint>>,

    pub user_token_account_3: Option<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint_3,
        associated_token::authority = program_authority,
    )]
    pub program_token_account_3: Option<Account<'info, TokenAccount>>,
    pub token_mint_3: Option<Account<'info, Mint>>,

    pub user_token_account_4: Option<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint_4,
        associated_token::authority = program_authority,
    )]
    pub program_token_account_4: Option<Account<'info, TokenAccount>>,
    pub token_mint_4: Option<Account<'info, Mint>>,

    pub user_token_account_5: Option<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint_5,
        associated_token::authority = program_authority,
    )]
    pub program_token_account_5: Option<Account<'info, TokenAccount>>,
    pub token_mint_5: Option<Account<'info, Mint>>,
}

#[derive(Accounts)]
pub struct WithdrawMultipleTokens<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_vault: Box<Account<'info, UserVault>>,
    /// CHECK: Program authority
    #[account(seeds = [b"program_authority"], bump)]
    pub program_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,

    // Optional token accounts for custom bundles (up to 5 tokens)
    pub user_token_account_1: Account<'info, TokenAccount>,
    pub program_token_account_1: Account<'info, TokenAccount>,
    pub token_mint_1: Option<Account<'info, Mint>>,

    pub user_token_account_2: Option<Account<'info, TokenAccount>>,
    pub program_token_account_2: Option<Account<'info, TokenAccount>>,
    pub token_mint_2: Option<Account<'info, Mint>>,

    pub user_token_account_3: Option<Account<'info, TokenAccount>>,
    pub program_token_account_3: Option<Account<'info, TokenAccount>>,
    pub token_mint_3: Option<Account<'info, Mint>>,

    pub user_token_account_4: Option<Account<'info, TokenAccount>>,
    pub program_token_account_4: Option<Account<'info, TokenAccount>>,
    pub token_mint_4: Option<Account<'info, Mint>>,

    pub user_token_account_5: Option<Account<'info, TokenAccount>>,
    pub program_token_account_5: Option<Account<'info, TokenAccount>>,
    pub token_mint_5: Option<Account<'info, Mint>>,
}

#[derive(Accounts)]
pub struct TransferMultipleTokensInternal<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_vault: Box<Account<'info, UserVault>>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 160 + 40 + 1 + 5 + 160 + 1 + 5 + 128 + 2 + 1 + 2 + 8 + 1,
        seeds = [b"user_vault", recipient.key().as_ref()],
        bump
    )]
    pub recipient_vault: Box<Account<'info, UserVault>>,
    /// CHECK: Recipient account
    pub recipient: AccountInfo<'info>,
    pub system_program: Program<'info, System>,

    // Optional token mints for custom bundles (up to 5 tokens)
    pub token_mint_1: Option<Account<'info, Mint>>,
    pub token_mint_2: Option<Account<'info, Mint>>,
    pub token_mint_3: Option<Account<'info, Mint>>,
    pub token_mint_4: Option<Account<'info, Mint>>,
    pub token_mint_5: Option<Account<'info, Mint>>,
}

#[derive(Accounts)]
pub struct GetCurrentFee<'info> {
    pub bank: Account<'info, Bank>,
    /// CHECK: Pyth price feed account
    pub price_feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct GetMyVaultedTokens<'info> {
    /// CHECK: Bank account
    pub bank: Account<'info, Bank>,
    /// CHECK: User account
    pub user: Signer<'info>,
    /// CHECK: User vault account
    pub user_vault: Account<'info, UserVault>,
    /// CHECK: Optional expansion vault 1
    pub expansion_vault_1: Option<AccountInfo<'info>>,
    /// CHECK: Optional expansion vault 2
    pub expansion_vault_2: Option<AccountInfo<'info>>,
    /// CHECK: Optional expansion vault 3
    pub expansion_vault_3: Option<AccountInfo<'info>>,
    /// CHECK: Optional expansion vault 4
    pub expansion_vault_4: Option<AccountInfo<'info>>,
}

#[derive(Accounts)]
pub struct CollectFees<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub fee_collector: Signer<'info>,
    #[account(mut)]
    pub fee_vault: Account<'info, FeeVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateExpansionVault<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_vault: Account<'info, UserVault>,
    #[account(
        init,
        payer = user,
        space = 8 + 160 + 40 + 1 + 5 + 160 + 1 + 5 + 32 + 32 + 1 + 1,
        seeds = [b"expansion_vault", user.key().as_ref()],
        bump
    )]
    pub expansion_vault: Account<'info, ExpansionVault>,
    pub system_program: Program<'info, System>,
}

// Optimized helper functions
fn check_and_update_anti_spam(user_vault: &mut UserVault) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;

    // Per-second limits
    if current_time - user_vault.last_transaction_second >= RATE_LIMIT_WINDOW_SECOND {
        user_vault.transaction_count_second = 0;
        user_vault.last_transaction_second = current_time;
    }
    require!(user_vault.transaction_count_second < MAX_TRANSACTIONS_PER_SECOND, BankError::RateLimitExceeded);

    // Per-minute limits
    if current_time - user_vault.last_transaction_minute >= RATE_LIMIT_WINDOW_MINUTE {
        user_vault.transaction_count_minute = 0;
        user_vault.last_transaction_minute = current_time;
    }
    require!(user_vault.transaction_count_minute < MAX_TRANSACTIONS_PER_MINUTE, BankError::RateLimitExceeded);

    // Safe increment
    user_vault.transaction_count_second = user_vault.transaction_count_second.checked_add(1).ok_or(BankError::Overflow)?;
    user_vault.transaction_count_minute = user_vault.transaction_count_minute.checked_add(1).ok_or(BankError::Overflow)?;

    Ok(())
}

fn generate_user_salt(bank_salt: &[u8; 32], user_key: &Pubkey) -> Result<[u8; 32]> {
    let mut hasher = anchor_lang::solana_program::keccak::Hasher::default();
    hasher.hash(bank_salt);
    hasher.hash(user_key.as_ref());
    Ok(hasher.result().0)
}

fn generate_vault_key(user: &Pubkey, token: Pubkey, salt: [u8; 32]) -> [u8; 32] {
    let mut hasher = anchor_lang::solana_program::keccak::Hasher::default();
    hasher.hash(user.as_ref());
    hasher.hash(token.as_ref());
    hasher.hash(&salt);
    hasher.result().0
}

fn track_token(user_vault: &mut UserVault, token: Pubkey) -> Result<()> {
    // Check if token already tracked
    for i in 0..5 {
        if user_vault.user_tokens[i] == token && user_vault.token_used[i] {
            return Ok(());
        }
    }

    // Add new token to available slot
    require!(user_vault.token_count < 5, BankError::TokenListFull);
    for i in 0..5 {
        if !user_vault.token_used[i] {
            user_vault.user_tokens[i] = token;
            user_vault.token_used[i] = true;
            user_vault.token_count = user_vault.token_count.checked_add(1).ok_or(BankError::Overflow)?;
            return Ok(());
        }
    }

    Err(BankError::NoAvailableSlots.into())
}

fn get_pyth_price(price_feed: &AccountInfo, _expected_id: &[u8; 32]) -> Result<Price> {
    let price_account = SolanaPriceAccount::account_info_to_feed(price_feed).map_err(|_| BankError::InvalidPrice)?;

    let current_time = Clock::get()?.unix_timestamp;
    let price = price_account.get_price_no_older_than(current_time, 60).ok_or(BankError::InvalidPrice)?;
    require!(price.price > 0, BankError::InvalidPrice);
    require!(price.conf > 0, BankError::InvalidPrice);
    require!(price.expo < 0, BankError::InvalidPrice);

    Ok(price)
}

fn calculate_usd_based_fee(price: i64, expo: i32) -> Result<u64> {
    if price <= 0 || expo >= 0 {
        return Err(BankError::InvalidPrice.into());
    }

    let expo_abs = expo.abs() as u32;
    let numerator: u128 = 10u128.pow(8) * 10u128.pow(expo_abs);
    let denominator: u128 = price as u128;

    (numerator / denominator).try_into().map_err(|_| BankError::Overflow.into())
}

// Error definitions
#[error_code]
pub enum BankError {
    #[msg("Bank is not initialized")]
    BankNotInitialized,
    #[msg("User vault is full")]
    StarterVaultFull,
    #[msg("Too many balances")]
    TooManyBalances,
    #[msg("Token list is full")]
    TokenListFull,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Zero deposit")]
    ZeroDeposit,
    #[msg("Amount must exceed fee")]
    AmountMustExceedFee,
    #[msg("Invalid recipient")]
    InvalidRecipient,
    #[msg("Not authorized")]
    NotAuthorized,
    #[msg("No fees to collect")]
    NoFees,
    #[msg("Invalid price feed")]
    InvalidPrice,
    #[msg("All expansion vaults already created")]
    AllExpansionsCreated,
    #[msg("Previous vault not full")]
    PreviousVaultNotFull,
    #[msg("Invalid phase")]
    InvalidPhase,
    #[msg("No available slots")]
    NoAvailableSlots,
    #[msg("Overflow occurred")]
    Overflow,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Invalid account version")]
    InvalidVersion,
    #[msg("Reentrancy detected")]
    Reentrancy,
    #[msg("Invalid input parameters")]
    InvalidInput,
    #[msg("Zero withdrawal amount")]
    ZeroWithdrawal,
    #[msg("Zero transfer amount")]
    ZeroTransfer,
}
