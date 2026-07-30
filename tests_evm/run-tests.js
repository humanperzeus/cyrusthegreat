#!/usr/bin/env node

/**
 * Simple test runner for CrossChainBank8 contract tests
 * Usage: node run-tests.js [test-name]
 */

const CrossChainBank8Tester = require('./CrossChainBank8.test.js');

async function runSpecificTest(testName, chain = null) {
    const tester = new CrossChainBank8Tester(chain);
    
    try {
        await tester.loadContract();
        await tester.getCurrentFee();
        await tester.setupTestTokens();
        
        switch (testName.toLowerCase()) {
            case 'deposit':
            case 'native-deposit':
                return await tester.testNativeDeposit();
                
            case 'withdraw':
            case 'native-withdraw':
                return await tester.testNativeWithdraw();
                
            case 'transfer':
            case 'native-transfer':
                return await tester.testNativeInternalTransfer();
                
            case 'token-deposit':
                return await tester.testTokenDeposit();
                
            case 'token-withdraw':
                return await tester.testTokenWithdraw();
                
            case 'token-transfer':
                return await tester.testTokenInternalTransfer();
                
            case 'multi-deposit':
                return await tester.testMultipleTokensDeposit();
                
            case 'multi-withdraw':
                return await tester.testMultipleTokensWithdraw();
                
            case 'multi-transfer':
                return await tester.testMultipleTokensInternalTransfer();
                
            case 'native':
                console.log('🧪 Running all native ETH tests...');
                const results = [];
                results.push(await tester.testNativeDeposit());
                results.push(await tester.testNativeWithdraw());
                results.push(await tester.testNativeInternalTransfer());
                return results.every(r => r);
                
            case 'tokens':
                console.log('🧪 Running all token tests...');
                const tokenResults = [];
                tokenResults.push(await tester.testTokenDeposit());
                tokenResults.push(await tester.testTokenWithdraw());
                tokenResults.push(await tester.testTokenInternalTransfer());
                return tokenResults.every(r => r);
                
            case 'multi':
                console.log('🧪 Running all multi-token tests...');
                const multiResults = [];
                multiResults.push(await tester.testMultipleTokensDeposit());
                multiResults.push(await tester.testMultipleTokensWithdraw());
                multiResults.push(await tester.testMultipleTokensInternalTransfer());
                return multiResults.every(r => r);
                
            default:
                console.log('❌ Unknown test name:', testName);
                console.log('Available tests:');
                console.log('  - deposit, withdraw, transfer (native ETH)');
                console.log('  - token-deposit, token-withdraw, token-transfer');
                console.log('  - multi-deposit, multi-withdraw, multi-transfer');
                console.log('  - native (all native ETH tests)');
                return false;
        }
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return false;
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // Run all tests on default chain
        const chain = process.env.TEST_CHAIN || 'eth';
        const tester = new CrossChainBank8Tester(chain);
        await tester.runAllTests();
    } else if (args.length === 1) {
        // Run specific test on default chain
        const testName = args[0];
        const chain = process.env.TEST_CHAIN || 'eth';
        console.log(`🧪 Running test: ${testName} on ${chain.toUpperCase()}`);
        const success = await runSpecificTest(testName, chain);
        
        if (success) {
            console.log('✅ Test completed successfully');
            process.exit(0);
        } else {
            console.log('❌ Test failed');
            process.exit(1);
        }
    } else {
        // Run specific test on specific chain
        const testName = args[0];
        const chain = args[1];
        console.log(`🧪 Running test: ${testName} on ${chain.toUpperCase()}`);
        const success = await runSpecificTest(testName, chain);
        
        if (success) {
            console.log('✅ Test completed successfully');
            process.exit(0);
        } else {
            console.log('❌ Test failed');
            process.exit(1);
        }
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Test runner failed:', error.message);
        process.exit(1);
    });
}

module.exports = { runSpecificTest };
