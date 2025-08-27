#!/usr/bin/env node

/**
 * Debug Vault Balance Script
 * Check vault balances with proper decimal handling for different token types
 */

const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

class VaultBalanceDebugger {
    constructor() {
        this.chain = process.env.TEST_CHAIN || 'eth';
        this.networkMode = process.env.VITE_NETWORK_MODE || 'testnet';
        this.web3 = null;
        this.vaultContract = null;
        this.setupWeb3();
        this.setupContract();
    }

    setupWeb3() {
        try {
            console.log(`🌐 Chain: ${this.chain.toUpperCase()}`);
            console.log(`🌐 Network Mode: ${this.networkMode}`);
            
            let rpcUrl;
            if (this.chain === 'eth') {
                if (this.networkMode === 'testnet') {
                    rpcUrl = process.env.VITE_ALCHEMY_ETH_TESTNET_RPC_URL;
                } else {
                    rpcUrl = process.env.VITE_ALCHEMY_ETH_MAINNET_RPC_URL;
                }
            }
            
            if (!rpcUrl || rpcUrl.includes('your_')) {
                throw new Error(`❌ Invalid RPC URL for ${this.chain.toUpperCase()} ${this.networkMode.toUpperCase()}`);
            }
            
            this.web3 = new Web3(rpcUrl);
            console.log(`✅ Web3 connected to ${this.chain.toUpperCase()} ${this.networkMode.toUpperCase()}`);
        } catch (error) {
            console.error('❌ Failed to setup Web3:', error.message);
            process.exit(1);
        }
    }

    setupContract() {
        try {
            const contractAddress = process.env.VITE_CTGVAULT_ETH_TESTNET_CONTRACT;
            if (!contractAddress || contractAddress.includes('your_')) {
                throw new Error('❌ Invalid vault contract address in .env file');
            }
            
            const contractABI = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/contracts/abis/CrossChainBank8.json'))).abi;
            this.vaultContract = new this.web3.eth.Contract(contractABI, contractAddress);
            
            console.log(`✅ Vault contract setup: ${contractAddress}`);
        } catch (error) {
            console.error('❌ Failed to setup contract:', error.message);
            process.exit(1);
        }
    }

    async getTokenDecimals(tokenAddress) {
        try {
            if (tokenAddress === '0x0000000000000000000000000000000000000000') {
                return 18; // ETH
            }
            
            // ERC20 decimals() function
            const decimals = await this.web3.eth.call({
                to: tokenAddress,
                data: this.web3.eth.abi.encodeFunctionCall({
                    name: 'decimals',
                    type: 'function',
                    inputs: []
                }, [])
            });
            
            return parseInt(this.web3.utils.hexToNumberString(decimals));
        } catch (error) {
            console.error(`❌ Failed to get decimals for ${tokenAddress}:`, error.message);
            return 18; // Fallback
        }
    }

    async getTokenSymbol(tokenAddress) {
        try {
            if (tokenAddress === '0x0000000000000000000000000000000000000000') {
                return 'ETH';
            }
            
            // ERC20 symbol() function
            const symbol = await this.web3.eth.call({
                to: tokenAddress,
                data: this.web3.eth.abi.encodeFunctionCall({
                    name: 'symbol',
                    type: 'function',
                    inputs: []
                }, [])
            });
            
            return this.web3.utils.hexToString(symbol).replace(/\0/g, '');
        } catch (error) {
            console.error(`❌ Failed to get symbol for ${tokenAddress}:`, error.message);
            return 'UNKNOWN';
        }
    }

    async getVaultBalance(userAddress, tokenAddress) {
        try {
            const balance = await this.vaultContract.methods.getBalance(userAddress, tokenAddress).call();
            return balance;
        } catch (error) {
            console.error(`❌ Failed to get vault balance:`, error.message);
            return '0';
        }
    }

    formatBalance(balance, decimals) {
        const balanceBigInt = BigInt(balance);
        const divisor = BigInt(10 ** decimals);
        const quotient = balanceBigInt / divisor;
        const remainder = balanceBigInt % divisor;
        
        if (remainder === 0n) {
            return quotient.toString();
        } else {
            const remainderStr = remainder.toString().padStart(decimals, '0');
            return quotient.toString() + '.' + remainderStr;
        }
    }

    async debugVaultBalances(userAddress) {
        console.log(`\n🔍 Debugging vault balances for: ${userAddress}`);
        console.log('='.repeat(60));
        
        try {
            // Get all vault tokens
            const vaultTokens = await this.vaultContract.methods.getMyVaultedTokens().call({ from: userAddress });
            console.log('📊 Raw vault tokens data:', vaultTokens);
            
            if (vaultTokens && vaultTokens.tokens && vaultTokens.balances) {
                const tokenAddresses = vaultTokens.tokens;
                const tokenBalances = vaultTokens.balances;
                console.log(`\n🔍 Found ${tokenAddresses.length} tokens in vault`);
                
                for (let i = 0; i < tokenAddresses.length; i++) {
                    const tokenAddress = tokenAddresses[i];
                    const rawBalance = tokenBalances[i];
                    
                    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
                        continue; // Skip ETH, handled separately
                    }
                    
                    console.log(`\n🪙 Token ${i + 1}:`);
                    console.log(`   Address: ${tokenAddress}`);
                    
                    const symbol = await this.getTokenSymbol(tokenAddress);
                    const decimals = await this.getTokenDecimals(tokenAddress);
                    
                    console.log(`   Symbol: ${symbol}`);
                    console.log(`   Decimals: ${decimals}`);
                    console.log(`   Raw Balance: ${rawBalance}`);
                    
                    // Format with correct decimals
                    const formattedBalance = this.formatBalance(rawBalance, decimals);
                    console.log(`   ✅ Correct Balance: ${formattedBalance} ${symbol}`);
                    
                    // Show what happens if we use wrong decimals (18)
                    const wrongBalance = this.formatBalance(rawBalance, 18);
                    console.log(`   ❌ Wrong Balance (18 decimals): ${wrongBalance} ${symbol}`);
                    
                    // Show the difference
                    console.log(`   📊 Difference: ${formattedBalance} vs ${wrongBalance}`);
                }
            }
            
            // Check ETH balance separately
            const ethBalance = await this.getVaultBalance(userAddress, '0x0000000000000000000000000000000000000000');
            console.log(`\n💰 ETH Balance:`);
            console.log(`   Raw: ${ethBalance}`);
            console.log(`   Formatted: ${this.formatBalance(ethBalance, 18)} ETH`);
            
        } catch (error) {
            console.error('❌ Error debugging vault balances:', error.message);
        }
    }

    async run() {
        try {
            console.log('🚀 Starting Vault Balance Debug...');
            
            // Get user address from environment or use a test address
            const userAddress = process.env.TEST_USER_ADDRESS || '0x84064947bcD9729872c5Be91D2aE50380Cbd691E';
            
            await this.debugVaultBalances(userAddress);
            
            console.log('\n✅ Debug complete!');
            
        } catch (error) {
            console.error('❌ Debug failed:', error.message);
        }
    }
}

// Run the debugger
const balanceDebugger = new VaultBalanceDebugger();
balanceDebugger.run();
