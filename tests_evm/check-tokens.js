#!/usr/bin/env node

/**
 * Token Balance Checker
 * Scans wallet1 and wallet2 for ERC20 tokens that can be used for testing
 */

const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

class TokenChecker {
    constructor(chain = null) {
        this.chain = chain || process.env.TEST_CHAIN || 'eth';
        this.networkMode = process.env.VITE_NETWORK_MODE || 'testnet';
        this.web3 = null;
        this.wallet1 = null;
        this.wallet2 = null;
        this.setupWeb3();
        this.setupWallets();
    }

    setupWeb3() {
        try {
            console.log(`🌐 Chain: ${this.chain.toUpperCase()}`);
            console.log(`🌐 Network Mode: ${this.networkMode}`);
            
            // Determine RPC URL based on chain and network mode
            let rpcUrl;
            const chainUpper = this.chain.toUpperCase();
            const modeUpper = this.networkMode.toUpperCase();
            
            if (this.chain === 'eth') {
                if (this.networkMode === 'testnet') {
                    rpcUrl = process.env.VITE_ALCHEMY_ETH_TESTNET_RPC_URL || 
                            process.env.VITE_ANKR_ETH_TESTNET_RPC_URL;
                } else {
                    rpcUrl = process.env.VITE_ALCHEMY_ETH_MAINNET_RPC_URL || 
                            process.env.VITE_ANKR_ETH_MAINNET_RPC_URL;
                }
            } else if (this.chain === 'bsc') {
                if (this.networkMode === 'testnet') {
                    rpcUrl = process.env.VITE_ALCHEMY_BSC_TESTNET_RPC_URL || 
                            process.env.VITE_ANKR_BSC_TESTNET_RPC_URL;
                } else {
                    rpcUrl = process.env.VITE_ALCHEMY_BSC_MAINNET_RPC_URL || 
                            process.env.VITE_ANKR_BSC_MAINNET_RPC_URL;
                }
            } else if (this.chain === 'base') {
                if (this.networkMode === 'testnet') {
                    rpcUrl = process.env.VITE_ALCHEMY_BASE_TESTNET_RPC_URL || 
                            process.env.VITE_ANKR_BASE_TESTNET_RPC_URL;
                } else {
                    rpcUrl = process.env.VITE_ALCHEMY_BASE_MAINNET_RPC_URL || 
                            process.env.VITE_ANKR_BASE_MAINNET_RPC_URL;
                }
            } else {
                throw new Error(`❌ Unsupported chain: ${this.chain}. Supported chains: eth, bsc, base`);
            }
            
            if (!rpcUrl || rpcUrl.includes('your_')) {
                throw new Error(`❌ Invalid RPC URL for ${chainUpper} ${modeUpper}. Please configure your .env file with actual API keys.`);
            }
            
            this.web3 = new Web3(rpcUrl);
            console.log(`✅ Web3 connected to ${chainUpper} ${modeUpper}: ${rpcUrl.substring(0, 50)}...`);
        } catch (error) {
            console.error('❌ Failed to setup Web3:', error.message);
            process.exit(1);
        }
    }

    setupWallets() {
        try {
            const wallet1PrivateKey = process.env.WALLET1_PRIVK;
            const wallet2PrivateKey = process.env.WALLET2_PRIVK;
            
            this.wallet1 = this.web3.eth.accounts.privateKeyToAccount(wallet1PrivateKey);
            this.wallet2 = this.web3.eth.accounts.privateKeyToAccount(wallet2PrivateKey);
            
            console.log(`👛 Wallet1: ${this.wallet1.address}`);
            console.log(`👛 Wallet2: ${this.wallet2.address}`);
        } catch (error) {
            console.error('❌ Failed to setup wallets:', error.message);
            process.exit(1);
        }
    }

    // Common ERC20 tokens on Sepolia testnet
    getKnownTokens() {
        return {
            // USDC on Sepolia
            '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238': {
                name: 'USD Coin',
                symbol: 'USDC',
                decimals: 6
            },
            // USDT on Sepolia  
            '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06': {
                name: 'Tether USD',
                symbol: 'USDT', 
                decimals: 6
            },
            // WETH on Sepolia
            '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14': {
                name: 'Wrapped Ether',
                symbol: 'WETH',
                decimals: 18
            },
            // LINK on Sepolia
            '0x779877A7B0D9E8603169DdbD7836e478b4624789': {
                name: 'ChainLink Token',
                symbol: 'LINK',
                decimals: 18
            },
            // DAI on Sepolia
            '0xFF34B3d4Aee8ddcd6F9AFFFB6Fe49bD371b8a357': {
                name: 'Dai Stablecoin',
                symbol: 'DAI',
                decimals: 18
            }
        };
    }

    // Common ERC20 tokens on Base Sepolia testnet
    getBaseTokens() {
        return {
            // USDC on Base Sepolia
            '0x036CbD53842c5426634e7929541eC2318f3dCF7e': {
                name: 'USD Coin',
                symbol: 'USDC',
                decimals: 6
            },
            // WETH on Base Sepolia
            '0x4200000000000000000000000000000000000006': {
                name: 'Wrapped Ether',
                symbol: 'WETH',
                decimals: 18
            },
            // LINK on Base Sepolia
            '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196': {
                name: 'ChainLink Token',
                symbol: 'LINK',
                decimals: 18
            }
        };
    }

    async getTokenBalancesFromAlchemy(address) {
        try {
            const networkMode = process.env.VITE_NETWORK_MODE || 'testnet';
            let rpcUrl;
            if (networkMode === 'testnet') {
                rpcUrl = process.env.VITE_ALCHEMY_ETH_TESTNET_RPC_URL || 
                        process.env.VITE_ANKR_ETH_TESTNET_RPC_URL;
            } else {
                rpcUrl = process.env.VITE_ALCHEMY_ETH_MAINNET_RPC_URL || 
                        process.env.VITE_ANKR_ETH_MAINNET_RPC_URL;
            }

            // Use Alchemy's getTokenBalances API
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'alchemy_getTokenBalances',
                    params: [address, 'erc20'],
                    id: 1
                })
            });

            const data = await response.json();
            if (data.result && data.result.tokenBalances) {
                return data.result.tokenBalances;
            }
            return [];
        } catch (error) {
            console.error('❌ Failed to get token balances from Alchemy:', error.message);
            return [];
        }
    }

    async getTokenBalance(tokenAddress, userAddress) {
        try {
            // ERC20 balanceOf function
            const balance = await this.web3.eth.call({
                to: tokenAddress,
                data: this.web3.eth.abi.encodeFunctionCall({
                    name: 'balanceOf',
                    type: 'function',
                    inputs: [{ type: 'address', name: 'account' }]
                }, [userAddress])
            });
            
            return this.web3.utils.hexToNumberString(balance);
        } catch (error) {
            return '0';
        }
    }

    async getTokenInfo(tokenAddress) {
        try {
            // Get token name
            const name = await this.web3.eth.call({
                to: tokenAddress,
                data: this.web3.eth.abi.encodeFunctionCall({
                    name: 'name',
                    type: 'function',
                    inputs: []
                }, [])
            });

            // Get token symbol
            const symbol = await this.web3.eth.call({
                to: tokenAddress,
                data: this.web3.eth.abi.encodeFunctionCall({
                    name: 'symbol',
                    type: 'function',
                    inputs: []
                }, [])
            });

            // Get token decimals
            const decimals = await this.web3.eth.call({
                to: tokenAddress,
                data: this.web3.eth.abi.encodeFunctionCall({
                    name: 'decimals',
                    type: 'function',
                    inputs: []
                }, [])
            });

            return {
                name: this.web3.utils.hexToAscii(name).replace(/\0/g, ''),
                symbol: this.web3.utils.hexToAscii(symbol).replace(/\0/g, ''),
                decimals: parseInt(decimals, 16)
            };
        } catch (error) {
            return null;
        }
    }

    formatTokenAmount(amount, decimals) {
        try {
            // Handle hex values
            let bigIntAmount;
            if (typeof amount === 'string' && amount.startsWith('0x')) {
                // Remove 0x prefix and convert to BigInt for large numbers
                const hexValue = amount.slice(2);
                if (hexValue === '0' || hexValue === '') {
                    return '0.000000';
                }
                bigIntAmount = BigInt('0x' + hexValue);
            } else {
                bigIntAmount = BigInt(amount);
            }
            
            if (bigIntAmount === 0n) {
                return '0.000000';
            }
            
            // Convert to string for division to avoid precision loss
            const divisor = BigInt(Math.pow(10, decimals));
            const quotient = bigIntAmount / divisor;
            const remainder = bigIntAmount % divisor;
            
            // Format with decimals
            const quotientStr = quotient.toString();
            const remainderStr = remainder.toString().padStart(decimals, '0');
            
            if (remainderStr === '0'.repeat(decimals)) {
                return quotientStr + '.000000';
            }
            
            // Take first 6 decimal places
            const decimalPart = remainderStr.substring(0, 6).padEnd(6, '0');
            return quotientStr + '.' + decimalPart;
        } catch (error) {
            return '0.000000';
        }
    }

    async checkWalletTokens(wallet, walletName) {
        console.log(`\n🔍 Checking tokens for ${walletName} (${wallet.address})`);
        console.log('='.repeat(60));
        
        // First, get all tokens from Alchemy
        console.log('🔍 Fetching all tokens from Alchemy...');
        const alchemyTokens = await this.getTokenBalancesFromAlchemy(wallet.address);
        
        const knownTokens = this.getKnownTokens();
        const tokensWithBalance = [];
        const allTokens = [];
        
        // Process Alchemy results
        if (alchemyTokens.length > 0) {
            console.log(`📊 Found ${alchemyTokens.length} tokens from Alchemy:`);
            
            for (const tokenData of alchemyTokens) {
                const tokenAddress = tokenData.contractAddress;
                const balance = tokenData.tokenBalance;
                
                // Get token info
                let tokenInfo = knownTokens[tokenAddress];
                if (!tokenInfo) {
                    // Try to get token info from contract
                    tokenInfo = await this.getTokenInfo(tokenAddress);
                    if (!tokenInfo || isNaN(tokenInfo.decimals)) {
                        tokenInfo = {
                            name: 'Unknown Token',
                            symbol: 'UNKNOWN',
                            decimals: 18
                        };
                    }
                }
                
                const formattedBalance = this.formatTokenAmount(balance, tokenInfo.decimals);
                const hasBalance = balance !== '0x0' && balance !== '0' && balance !== '0x0000000000000000000000000000000000000000000000000000000000000000';
                

                
                console.log(`${hasBalance ? '✅' : '⚪'} ${tokenInfo.name} (${tokenInfo.symbol})`);
                console.log(`   Address: ${tokenAddress}`);
                console.log(`   Balance: ${formattedBalance} ${tokenInfo.symbol}`);
                console.log(`   Raw: ${balance}`);
                
                allTokens.push({
                    address: tokenAddress,
                    name: tokenInfo.name,
                    symbol: tokenInfo.symbol,
                    decimals: tokenInfo.decimals,
                    balance: balance,
                    formattedBalance: formattedBalance,
                    hasBalance: hasBalance
                });
                
                if (hasBalance) {
                    tokensWithBalance.push({
                        address: tokenAddress,
                        name: tokenInfo.name,
                        symbol: tokenInfo.symbol,
                        decimals: tokenInfo.decimals,
                        balance: balance,
                        formattedBalance: formattedBalance
                    });
                }
            }
        } else {
            console.log('⚠️  No tokens found via Alchemy API');
            
            // Fallback to manual checking of known tokens
            console.log('🔍 Checking known tokens manually...');
            for (const [tokenAddress, tokenInfo] of Object.entries(knownTokens)) {
                const balance = await this.getTokenBalance(tokenAddress, wallet.address);
                const formattedBalance = this.formatTokenAmount(balance, tokenInfo.decimals);
                const hasBalance = balance !== '0' && balance !== '0x0' && balance !== '0x0000000000000000000000000000000000000000000000000000000000000000';
                
                console.log(`${hasBalance ? '✅' : '⚪'} ${tokenInfo.name} (${tokenInfo.symbol})`);
                console.log(`   Address: ${tokenAddress}`);
                console.log(`   Balance: ${formattedBalance} ${tokenInfo.symbol}`);
                console.log(`   Raw: ${balance}`);
                
                allTokens.push({
                    address: tokenAddress,
                    name: tokenInfo.name,
                    symbol: tokenInfo.symbol,
                    decimals: tokenInfo.decimals,
                    balance: balance,
                    formattedBalance: formattedBalance,
                    hasBalance: hasBalance
                });
                
                if (hasBalance) {
                    tokensWithBalance.push({
                        address: tokenAddress,
                        name: tokenInfo.name,
                        symbol: tokenInfo.symbol,
                        decimals: tokenInfo.decimals,
                        balance: balance,
                        formattedBalance: formattedBalance
                    });
                }
            }
        }
        
        return { tokensWithBalance, allTokens };
    }

    async runTokenCheck() {
        console.log('🚀 Checking wallet token balances...');
        console.log('='.repeat(60));
        
        const wallet1Result = await this.checkWalletTokens(this.wallet1, 'Wallet1');
        const wallet2Result = await this.checkWalletTokens(this.wallet2, 'Wallet2');
        
        const wallet1Tokens = wallet1Result.tokensWithBalance;
        const wallet2Tokens = wallet2Result.tokensWithBalance;
        const wallet1AllTokens = wallet1Result.allTokens;
        const wallet2AllTokens = wallet2Result.allTokens;
        
        console.log('\n📊 SUMMARY');
        console.log('='.repeat(60));
        console.log(`Wallet1 total tokens: ${wallet1AllTokens.length}`);
        console.log(`Wallet1 tokens with balance: ${wallet1Tokens.length}`);
        console.log(`Wallet2 total tokens: ${wallet2AllTokens.length}`);
        console.log(`Wallet2 tokens with balance: ${wallet2Tokens.length}`);
        
        // Check if we should test on Base testnet
        const totalTokensWithBalance = wallet1Tokens.length + wallet2Tokens.length;
        const uniqueTokensWithBalance = new Set([
            ...wallet1Tokens.map(t => t.address),
            ...wallet2Tokens.map(t => t.address)
        ]).size;
        
        console.log(`\n🔍 Token Analysis:`);
        console.log(`   Total unique tokens with balance: ${uniqueTokensWithBalance}`);
        
        if (uniqueTokensWithBalance <= 1) {
            console.log('\n⚠️  Only 1 or fewer tokens with balance found on Sepolia!');
            console.log('🔄 Checking Base Sepolia testnet for more tokens...');
            
            // Check Base testnet
            await this.checkBaseTestnet();
        }
        
        if (wallet1Tokens.length > 0 || wallet2Tokens.length > 0) {
            console.log('\n🎉 Found tokens! You can use these for testing:');
            
            if (wallet1Tokens.length > 0) {
                console.log('\nWallet1 tokens with balance:');
                wallet1Tokens.forEach(token => {
                    console.log(`  - ${token.symbol} (${token.address}) - ${token.formattedBalance}`);
                });
            }
            
            if (wallet2Tokens.length > 0) {
                console.log('\nWallet2 tokens with balance:');
                wallet2Tokens.forEach(token => {
                    console.log(`  - ${token.symbol} (${token.address}) - ${token.formattedBalance}`);
                });
            }
            
            // Save token info for test updates
            const tokenData = {
                network: 'ethereum-sepolia',
                wallet1: {
                    tokensWithBalance: wallet1Tokens,
                    allTokens: wallet1AllTokens
                },
                wallet2: {
                    tokensWithBalance: wallet2Tokens,
                    allTokens: wallet2AllTokens
                },
                timestamp: new Date().toISOString()
            };
            
            fs.writeFileSync('available-tokens.json', JSON.stringify(tokenData, null, 2));
            console.log('\n💾 Token data saved to available-tokens.json');
            
        } else {
            console.log('\n⚠️  No tokens found with balance. You may need to:');
            console.log('   1. Get test tokens from faucets');
            console.log('   2. Deploy test tokens');
            console.log('   3. Check other token addresses');
        }
    }

    async checkBaseTestnet() {
        try {
            console.log('\n🌐 Checking Base Sepolia testnet...');
            
            // Switch to Base testnet RPC
            const baseRpcUrl = process.env.VITE_ALCHEMY_BASE_TESTNET_RPC_URL;
            if (!baseRpcUrl || baseRpcUrl.includes('your_')) {
                console.log('❌ Base testnet RPC not configured in .env');
                return;
            }
            
            const baseWeb3 = new Web3(baseRpcUrl);
            console.log(`✅ Connected to Base Sepolia: ${baseRpcUrl.substring(0, 50)}...`);
            
            // Check if wallets have any ETH on Base
            const wallet1EthBalance = await baseWeb3.eth.getBalance(this.wallet1.address);
            const wallet2EthBalance = await baseWeb3.eth.getBalance(this.wallet2.address);
            
            console.log(`\n📊 Base Sepolia ETH balances:`);
            console.log(`   Wallet1: ${baseWeb3.utils.fromWei(wallet1EthBalance, 'ether')} ETH`);
            console.log(`   Wallet2: ${baseWeb3.utils.fromWei(wallet2EthBalance, 'ether')} ETH`);
            
            if (wallet1EthBalance === '0' && wallet2EthBalance === '0') {
                console.log('⚠️  No ETH on Base Sepolia - wallets need funding for testing');
                console.log('   Get Base Sepolia ETH from: https://bridge.base.org/deposit');
                return;
            }
            
            // Check for tokens on Base
            const baseTokens = this.getBaseTokens();
            let baseTokensFound = 0;
            
            for (const [tokenAddress, tokenInfo] of Object.entries(baseTokens)) {
                const wallet1Balance = await this.getTokenBalanceOnNetwork(baseWeb3, tokenAddress, this.wallet1.address);
                const wallet2Balance = await this.getTokenBalanceOnNetwork(baseWeb3, tokenAddress, this.wallet2.address);
                
                if (wallet1Balance !== '0' || wallet2Balance !== '0') {
                    baseTokensFound++;
                    console.log(`✅ ${tokenInfo.name} (${tokenInfo.symbol}) on Base Sepolia:`);
                    console.log(`   Wallet1: ${baseWeb3.utils.fromWei(wallet1Balance, 'ether')} ${tokenInfo.symbol}`);
                    console.log(`   Wallet2: ${baseWeb3.utils.fromWei(wallet2Balance, 'ether')} ${tokenInfo.symbol}`);
                }
            }
            
            if (baseTokensFound > 0) {
                console.log(`\n🎉 Found ${baseTokensFound} tokens on Base Sepolia!`);
                console.log('💡 Consider testing on Base testnet for more token variety');
            } else {
                console.log('\n⚠️  No tokens found on Base Sepolia either');
            }
            
        } catch (error) {
            console.error('❌ Failed to check Base testnet:', error.message);
        }
    }

    async getTokenBalanceOnNetwork(web3, tokenAddress, userAddress) {
        try {
            const balance = await web3.eth.call({
                to: tokenAddress,
                data: web3.eth.abi.encodeFunctionCall({
                    name: 'balanceOf',
                    type: 'function',
                    inputs: [{ type: 'address', name: 'account' }]
                }, [userAddress])
            });
            
            return web3.utils.hexToNumberString(balance);
        } catch (error) {
            return '0';
        }
    }
}

// Run token check if this file is executed directly
if (require.main === module) {
    const chain = process.argv[2] || process.env.TEST_CHAIN || 'eth';
    const checker = new TokenChecker(chain);
    checker.runTokenCheck().catch(console.error);
}

module.exports = TokenChecker;
