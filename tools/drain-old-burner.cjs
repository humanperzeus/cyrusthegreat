#!/usr/bin/env node
/*
 * tools/drain-old-burner.js
 *
 * Sweeps a leaked testnet burner to a fresh destination. Run from repo root:
 *     node tools/drain-old-burner.js
 *
 * Prompts:
 *   1. OLD private key (hidden input).
 *   2. Destination public address (the new clean wallet).
 *
 * For each of the 4 configured testnets (Sepolia, BSC Testnet, Base Sepolia,
 * HyperEVM Testnet) it:
 *   - Connects via the RPC from tools/hardhat-deploy/.env (fallback to public RPC).
 *   - Reads the source's native + every known ERC-20 balance.
 *   - For each token with balance > 0, sends `transfer(dest, balance)`.
 *   - Then sweeps native: sends `(balance - gas-reserve)` to dest, leaving a
 *     small buffer so the sweep tx itself can be paid for.
 *   - Skips chains where everything is zero.
 *
 * Testnet only. If this key controls any mainnet funds, abort.
 */

const path = require('path');
const fs = require('fs');

let ethers;
try {
  ethers = require(path.join(__dirname, 'hardhat-deploy', 'node_modules', 'ethers'));
} catch (e) {
  console.error('ERROR: ethers not found at tools/hardhat-deploy/node_modules/ethers.');
  console.error('Run `cd tools/hardhat-deploy && npm install` first, then retry.');
  process.exit(1);
}

// --- Load env from tools/hardhat-deploy/.env ---------------------------
const envPath = path.join(__dirname, 'hardhat-deploy', '.env');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

// --- Chain registry: known tokens + RPC + native symbol ----------------
const CHAINS = [
  {
    name: 'Sepolia',
    chainId: 11155111,
    rpc: env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    nativeSymbol: 'sETH',
    tokens: [
      { addr: '0xD649712915595bcE7A4BA3a821C64850853FcD02', symbol: 'USD1' },
      { addr: '0x4Ed43Ca34731696caa2B813070AB65F18510eaA1', symbol: 'WLFI' },
    ],
  },
  {
    name: 'BSC Testnet',
    chainId: 97,
    rpc: env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com',
    nativeSymbol: 'tBNB',
    tokens: [],
  },
  {
    name: 'Base Sepolia',
    chainId: 84532,
    rpc: env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com',
    nativeSymbol: 'ETH',
    tokens: [],
  },
  {
    name: 'HyperEVM Testnet',
    chainId: 998,
    rpc: env.HYPER_TESTNET_RPC_URL || 'https://rpc.hyperliquid-testnet.xyz/evm',
    nativeSymbol: 'HYPE',
    tokens: [],
  },
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address,uint256) returns (bool)',
];

// --- Hidden-input prompt (no echo) -------------------------------------
function promptHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let input = '';
    const onData = (key) => {
      if (key === '\r' || key === '\n' || key === '') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (key === '') { // Ctrl+C
        process.stdout.write('\n');
        process.exit(0);
      } else if (key === '' || key === '\b') { // Backspace
        if (input.length > 0) input = input.slice(0, -1);
      } else {
        input += key;
      }
    };
    stdin.on('data', onData);
  });
}

function prompt(question) {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// --- Per-chain sweep ---------------------------------------------------
async function sweepChain(chain, wallet, dest) {
  console.log(`\n== ${chain.name} (chainId ${chain.chainId}) ==`);
  console.log(`   RPC: ${chain.rpc}`);

  let provider;
  try {
    provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId);
    await provider.getBlockNumber(); // ping
  } catch (e) {
    console.log(`   RPC unreachable: ${(e.message || '').slice(0, 100)}`);
    return;
  }

  const signer = wallet.connect(provider);
  let nativeBal;
  try {
    nativeBal = await provider.getBalance(signer.address);
  } catch (e) {
    console.log(`   getBalance failed: ${(e.message || '').slice(0, 100)}`);
    return;
  }
  console.log(`   Native ${chain.nativeSymbol}: ${ethers.formatEther(nativeBal)}`);

  // Check tokens
  const tokensWithBalance = [];
  for (const tok of chain.tokens) {
    try {
      const erc20 = new ethers.Contract(tok.addr, ERC20_ABI, signer);
      const [bal, dec, sym] = await Promise.all([
        erc20.balanceOf(signer.address),
        erc20.decimals().catch(() => 18),
        erc20.symbol().catch(() => tok.symbol),
      ]);
      console.log(`   ${sym} (${tok.addr}): ${ethers.formatUnits(bal, dec)}`);
      if (bal > 0n) tokensWithBalance.push({ erc20, bal, dec, sym });
    } catch (e) {
      console.log(`   ${tok.symbol} (${tok.addr}): error — ${(e.message || '').slice(0, 80)}`);
    }
  }

  if (nativeBal === 0n && tokensWithBalance.length === 0) {
    console.log('   → nothing to sweep, skipping.');
    return;
  }

  // Sweep ERC-20s first (each costs native gas)
  for (const t of tokensWithBalance) {
    try {
      console.log(`   Sweeping ${ethers.formatUnits(t.bal, t.dec)} ${t.sym} → ${dest}`);
      const tx = await t.erc20.transfer(dest, t.bal);
      console.log(`     tx: ${tx.hash}`);
      await tx.wait();
      console.log(`     confirmed.`);
    } catch (e) {
      console.log(`     FAILED: ${(e.message || '').slice(0, 150)}`);
    }
  }

  // Re-read native balance (some was consumed by token sweeps)
  const remainingBal = await provider.getBalance(signer.address);
  if (remainingBal === 0n) {
    console.log('   No native left to sweep.');
    return;
  }

  try {
    const feeData = await provider.getFeeData();
    const gasPrice =
      feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits('50', 'gwei');
    const gasCost = gasPrice * 21000n;
    const reserve = (gasCost * 3n) / 2n; // 50% buffer
    if (remainingBal <= reserve) {
      console.log(
        `   Native ${ethers.formatEther(remainingBal)} ${chain.nativeSymbol} ≤ gas reserve ${ethers.formatEther(reserve)} — leaving as dust.`,
      );
      return;
    }
    const sendAmount = remainingBal - reserve;
    console.log(`   Sweeping ${ethers.formatEther(sendAmount)} ${chain.nativeSymbol} → ${dest}`);
    const tx = await signer.sendTransaction({
      to: dest,
      value: sendAmount,
      gasLimit: 21000n,
    });
    console.log(`     tx: ${tx.hash}`);
    await tx.wait();
    console.log(`     confirmed.`);
  } catch (e) {
    console.log(`     FAILED native sweep: ${(e.message || '').slice(0, 150)}`);
  }
}

// --- Main --------------------------------------------------------------
async function main() {
  console.log('');
  console.log('============================================================');
  console.log('  Drain old burner — testnet only');
  console.log('============================================================');
  console.log('');
  console.log('Sweeps all known native + ERC-20 holdings of an OLD leaked');
  console.log('burner key to a destination address you provide.');
  console.log('');
  console.log('⚠️  TESTNET ONLY. If this key controls mainnet funds, abort.');
  console.log('');

  const keyRaw = await promptHidden('Paste OLD private key (hidden input): ');
  const destRaw = await prompt('Paste destination public address: ');

  let wallet;
  try {
    const cleaned = keyRaw.replace(/\s/g, '');
    const keyWith0x = cleaned.startsWith('0x') ? cleaned : '0x' + cleaned;
    wallet = new ethers.Wallet(keyWith0x);
  } catch (e) {
    console.error('ERROR: invalid private key —', (e.message || '').slice(0, 100));
    process.exit(1);
  }

  const dest = destRaw.trim();
  if (!ethers.isAddress(dest)) {
    console.error('ERROR: destination is not a valid 0x-address:', dest);
    process.exit(1);
  }

  if (wallet.address.toLowerCase() === dest.toLowerCase()) {
    console.error('ERROR: source and destination are the same address. Aborted.');
    process.exit(1);
  }

  console.log(`\nSource (old burner): ${wallet.address}`);
  console.log(`Destination:         ${dest}`);

  const confirm = await prompt('\nProceed with sweep across all 4 testnets? [y/N] ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  for (const chain of CHAINS) {
    try {
      await sweepChain(chain, wallet, dest);
    } catch (e) {
      console.log(`   ${chain.name}: unexpected error — ${(e.message || '').slice(0, 150)}`);
    }
  }

  console.log('\n✅ Done. Re-run with the other old burner key + destination if needed.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
