#!/usr/bin/env node
/*
 * tools/smoke-test-live-contracts.cjs
 *
 * Programmatic smoke test against the LIVE deployed contracts on all 5
 * testnets. For each (chain × contract) pair, exercises every public view
 * function and reports the result. Catches "contract deployed but reads
 * crash" / "wrong constructor args" / "stale bytecode" / "RPC broken"
 * issues BEFORE the user manually tests via the dapp UI.
 *
 * Does NOT submit any state-changing tx — pure eth_call reads.
 *
 * Run:  node tools/smoke-test-live-contracts.cjs
 */

const path = require('path');
const { JsonRpcProvider, Contract, getAddress } = require(path.join(__dirname, 'hardhat-deploy', 'node_modules', 'ethers'));

// 5-chain test matrix. Bank8 & Tresor1 share the same address on 4 chains,
// differ on HyperEVM (different nonce-alignment).
const CHAINS = [
  { name: 'Sepolia        ', id: 11155111, rpc: 'https://ethereum-sepolia-rpc.publicnode.com', native: 'sETH',
    bank8:   '0xd2fc71e2fbf7a267c2f884160f01c82994175958',
    tresor1: '0x15fe4fd173599b248c6b89f5e3caea60e1c1a1db' },
  { name: 'BSC Testnet    ', id: 97, rpc: 'https://bsc-testnet-rpc.publicnode.com', native: 'tBNB',
    bank8:   '0xd2fc71e2fbf7a267c2f884160f01c82994175958',
    tresor1: '0x15fe4fd173599b248c6b89f5e3caea60e1c1a1db' },
  { name: 'Base Sepolia   ', id: 84532, rpc: 'https://base-sepolia-rpc.publicnode.com', native: 'ETH',
    bank8:   '0xd2fc71e2fbf7a267c2f884160f01c82994175958',
    tresor1: '0x15fe4fd173599b248c6b89f5e3caea60e1c1a1db' },
  { name: 'Arbitrum Sepolia', id: 421614, rpc: 'https://sepolia-rollup.arbitrum.io/rpc', native: 'ETH',
    bank8:   '0xd2fc71e2fbf7a267c2f884160f01c82994175958',
    tresor1: '0x15fe4fd173599b248c6b89f5e3caea60e1c1a1db' },
  { name: 'HyperEVM Testnet', id: 998, rpc: 'https://rpc.hyperliquid-testnet.xyz/evm', native: 'HYPE',
    bank8:   '0xf9aab9b4800e3d5fcd4e4faf1f7fcf539cbd06a9',
    tresor1: '0x15fe4fd173599b248c6b89f5e3caea60e1c1a1db' },
];

// Bank8 (CrossChainBank8) view-fn surface.
// NOTE: feeCollector is `address private immutable` in the contract — no
// public getter by design. So we don't expect to read it externally.
const BANK8_VIEWS = [
  ['priceFeed',          [],         'address',      'returns the configured price feed'],
  ['getCurrentFeeInWei', [],         'uint256',      'computes $0.10 fee in native wei'],
];

// CyrusTresor1 view-fn surface (Bank8 surface + new pool layer)
const TRESOR_VIEWS = [
  ['priceFeed',                [],         'address',      'oracle address'],
  ['getCurrentFeeInWei',       [],         'uint256',      '$0.10 native fee'],
  ['currentEpoch',             [],         'uint256',      'current 1-hr epoch'],
  ['zkVerifier',               [],         'address',      'v1 expects 0x0…0'],
  [
    'getPoolBucketSize',
    ['0x0000000000000000000000000000000000000000', 0],
    'uint256',
    'native bucket 0 size (e.g. 0.001 ETH = 1e15)',
  ],
];

function buildAbi(fns) {
  return fns.map(([name, _args, ret]) =>
    `function ${name}(${
      _args.map((_, i) => i === 0 && typeof _args[0] === 'string' ? 'address' : 'uint8').join(',')
    }) view returns (${ret})`,
  );
}

function abiFragment(name, args, ret) {
  // Build a single-fn ABI fragment as a viem/ethers human-readable string
  const argTypes = (() => {
    if (args.length === 0) return '';
    // crude: treat 0x-strings as address, numbers as uint8 (matches our case)
    return args.map(a => (typeof a === 'string' && a.startsWith('0x')) ? 'address' : 'uint8').join(',');
  })();
  return [`function ${name}(${argTypes}) view returns (${ret})`];
}

async function callView(contract, name, args) {
  try {
    const v = await contract[name](...args);
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: (e.shortMessage || e.message || String(e)).slice(0, 120) };
  }
}

async function runChain(chain) {
  console.log('\n=== ' + chain.name + ' (chainId ' + chain.id + ') ===');
  let provider;
  try {
    provider = new JsonRpcProvider(chain.rpc, chain.id);
    const block = await provider.getBlockNumber();
    console.log('  RPC reachable, block', block);
  } catch (e) {
    console.log('  ❌ RPC unreachable:', e.message.slice(0, 100));
    return { chain: chain.name, total: 0, ok: 0, fail: 1, results: [] };
  }

  const results = [];

  console.log('\n  Bank8 @', chain.bank8);
  for (const [name, args, ret, desc] of BANK8_VIEWS) {
    const c = new Contract(getAddress(chain.bank8), abiFragment(name, args, ret), provider);
    const r = await callView(c, name, args);
    if (r.ok) {
      let val = r.value;
      if (typeof val === 'bigint') val = val.toString();
      console.log('    ✅ ' + name + '() →', val);
    } else {
      console.log('    ❌ ' + name + '():', r.error);
    }
    results.push({ contract: 'Bank8', fn: name, ...r });
  }

  console.log('\n  CyrusTresor1 @', chain.tresor1);
  for (const [name, args, ret, desc] of TRESOR_VIEWS) {
    const c = new Contract(getAddress(chain.tresor1), abiFragment(name, args, ret), provider);
    const r = await callView(c, name, args);
    if (r.ok) {
      let val = r.value;
      if (typeof val === 'bigint') val = val.toString();
      console.log('    ✅ ' + name + '(' + args.join(',') + ') →', val);
    } else {
      console.log('    ❌ ' + name + '(' + args.join(',') + '):', r.error);
    }
    results.push({ contract: 'Tresor1', fn: name, ...r });
  }

  const ok = results.filter(r => r.ok).length;
  return { chain: chain.name, total: results.length, ok, fail: results.length - ok, results };
}

(async () => {
  console.log('============================================================');
  console.log(' Smoke test: live contracts on 5 testnets, view fns only');
  console.log('============================================================');

  const summaries = [];
  for (const c of CHAINS) summaries.push(await runChain(c));

  console.log('\n============================================================');
  console.log(' Summary');
  console.log('============================================================');
  let totalOk = 0, totalFail = 0;
  for (const s of summaries) {
    const tag = s.fail === 0 ? '✅' : '❌';
    console.log('  ' + tag + ' ' + s.chain + '   ' + s.ok + '/' + s.total + ' passed');
    totalOk += s.ok; totalFail += s.fail;
  }
  console.log('\n  Grand total: ' + totalOk + ' passed, ' + totalFail + ' failed across all 5 chains');
  process.exit(totalFail === 0 ? 0 : 1);
})();
