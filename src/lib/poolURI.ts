/**
 * Teleport URI codec for CyrusTresor1's anonymity pool.
 *
 * The pool's "teleport" UX is built ON TOP of commit/reveal: the depositor
 * generates a random (secret, userSalt) pair off-chain, computes the
 * commitment hash, calls commitToPool(). The (secret, userSalt) — along
 * with the metadata needed to reconstruct the commitment — must then reach
 * the eventual recipient via some off-chain channel (QR, signal message,
 * encrypted email, etc.).
 *
 * This module encodes/decodes those params as URL hash fragments so they
 * can be shared as a single link like:
 *
 *   https://cyrusthegreat.dev/claim#c=...&s=...&u=...&t=...&b=...&a=...&n=...
 *
 * SECURITY NOTES:
 *  - Anyone who has the URI can spend the commitment (after the epoch wait).
 *    Treat it like cash. Use end-to-end-encrypted channels (Signal, Matrix
 *    with E2EE, etc.) — NOT plain SMS, email, Discord, etc.
 *  - URI parameters live in the HASH fragment (`#`) rather than the query
 *    string (`?`), which means they are NOT sent to the server in HTTP
 *    requests. cyrusthegreat.dev's hosting (Cloudflare Pages) cannot see
 *    them; only the user's browser does.
 *  - The full secret + salt are visible in the URL itself though, so DON'T
 *    paste these in public chats or screenshots.
 */

import { keccak256, AbiCoder, getAddress } from 'ethers';

/** Parameters needed to reveal a pool commitment. */
export interface TeleportClaim {
  /** 32-byte hex (0x-prefixed) user-side entropy; matches commit-time secret */
  secret: `0x${string}`;
  /** 32-byte hex (0x-prefixed) additional user-side entropy */
  userSalt: `0x${string}`;
  /** Address that receives the bucket on reveal — baked into commitment for MEV-safety */
  withdrawTo: `0x${string}`;
  /** address(0) = native ETH/BNB; else the ERC-20 contract address */
  token: `0x${string}`;
  /** Index into the contract's poolBucketSizes[token] schedule */
  bucketIdx: number;
  /** CyrusTresor1 contract address on the chain where the commit happened */
  contractAddress: `0x${string}`;
  /** EVM chain id (e.g., 11155111 for Sepolia) */
  chainId: number;
}

/** Compact hash-fragment keys to keep URIs short. */
const KEYS = {
  secret: 'c',         // commit secret
  userSalt: 's',       // salt
  withdrawTo: 'u',     // user (recipient)
  token: 't',          // token address (0x0 = native)
  bucketIdx: 'b',      // bucket index
  contractAddress: 'a', // address (contract)
  chainId: 'n',        // network (chain id)
} as const;

const HEX32 = /^0x[a-fA-F0-9]{64}$/;
const HEX_ADDR = /^0x[a-fA-F0-9]{40}$/;

function _validateClaim(c: Partial<TeleportClaim>): asserts c is TeleportClaim {
  if (!c.secret || !HEX32.test(c.secret)) throw new Error('Invalid secret (must be 0x + 64 hex)');
  if (!c.userSalt || !HEX32.test(c.userSalt)) throw new Error('Invalid userSalt (must be 0x + 64 hex)');
  if (!c.withdrawTo || !HEX_ADDR.test(c.withdrawTo)) throw new Error('Invalid withdrawTo address');
  if (!c.token || !HEX_ADDR.test(c.token)) throw new Error('Invalid token address (use 0x0…0 for native)');
  if (typeof c.bucketIdx !== 'number' || c.bucketIdx < 0 || c.bucketIdx > 255) throw new Error('Invalid bucketIdx (0-255)');
  if (!c.contractAddress || !HEX_ADDR.test(c.contractAddress)) throw new Error('Invalid contract address');
  if (typeof c.chainId !== 'number' || c.chainId <= 0) throw new Error('Invalid chainId');
}

/**
 * Compute the on-chain commitment hash for a given claim. Must match
 * CyrusTresor1.sol's keccak256(abi.encode(...)) layout EXACTLY — any
 * drift here makes commitToPool / revealFromPool incompatible with each
 * other off-chain ↔ on-chain.
 */
export function computeCommitment(c: TeleportClaim): `0x${string}` {
  const enc = AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32', 'address', 'address', 'uint8', 'address', 'uint256'],
    [c.secret, c.userSalt, c.withdrawTo, c.token, c.bucketIdx, c.contractAddress, c.chainId],
  );
  return keccak256(enc) as `0x${string}`;
}

/**
 * Generate a fresh random (secret, userSalt) pair using the browser's Web
 * Crypto API. Cryptographically secure — uses the OS's CSPRNG underneath.
 * Throws if the page is not in a secure context (window.crypto.getRandomValues
 * is not available in plain http://, only https:// or localhost).
 */
export function generateClaimEntropy(): { secret: `0x${string}`; userSalt: `0x${string}` } {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('Web Crypto API not available — this page must be served over HTTPS or localhost');
  }
  const buf1 = new Uint8Array(32);
  const buf2 = new Uint8Array(32);
  crypto.getRandomValues(buf1);
  crypto.getRandomValues(buf2);
  const toHex = (b: Uint8Array) =>
    ('0x' + Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
  return { secret: toHex(buf1), userSalt: toHex(buf2) };
}

/**
 * Encode a claim as a URL hash fragment payload.
 * @returns the fragment string starting with `#` (no domain prefix).
 * Caller adds the domain + path (e.g., `https://cyrusthegreat.dev/claim` + fragment).
 */
export function encodeTeleportClaim(claim: TeleportClaim): string {
  _validateClaim(claim);
  const params = new URLSearchParams();
  params.set(KEYS.secret, claim.secret);
  params.set(KEYS.userSalt, claim.userSalt);
  params.set(KEYS.withdrawTo, claim.withdrawTo);
  params.set(KEYS.token, claim.token);
  params.set(KEYS.bucketIdx, String(claim.bucketIdx));
  params.set(KEYS.contractAddress, claim.contractAddress);
  params.set(KEYS.chainId, String(claim.chainId));
  return '#' + params.toString();
}

/**
 * Build a full claim URL given a base URL + claim. Use this for QR codes
 * and share links. Example:
 *   buildClaimURL('https://cyrusthegreat.dev/claim', claim)
 *   → 'https://cyrusthegreat.dev/claim#c=0x…&s=0x…&u=0x…&t=0x0&b=0&a=0x…&n=11155111'
 */
export function buildClaimURL(baseURL: string, claim: TeleportClaim): string {
  return baseURL + encodeTeleportClaim(claim);
}

/**
 * Parse a hash fragment back into a TeleportClaim. Accepts either:
 *   '#c=…&s=…&…'    (raw fragment from window.location.hash)
 *   'https://…#c=…' (full URL — extracts the fragment part)
 * Throws if any required field is missing or malformed.
 */
export function decodeTeleportClaim(input: string): TeleportClaim {
  // Extract the fragment part regardless of input format
  let fragment = input;
  const hashIdx = input.indexOf('#');
  if (hashIdx !== -1) fragment = input.slice(hashIdx + 1);

  const params = new URLSearchParams(fragment);
  const claim: Partial<TeleportClaim> = {
    secret: params.get(KEYS.secret) as `0x${string}` | undefined,
    userSalt: params.get(KEYS.userSalt) as `0x${string}` | undefined,
    withdrawTo: params.get(KEYS.withdrawTo) as `0x${string}` | undefined,
    token: params.get(KEYS.token) as `0x${string}` | undefined,
    bucketIdx: params.get(KEYS.bucketIdx) ? Number(params.get(KEYS.bucketIdx)) : undefined,
    contractAddress: params.get(KEYS.contractAddress) as `0x${string}` | undefined,
    chainId: params.get(KEYS.chainId) ? Number(params.get(KEYS.chainId)) : undefined,
  };
  _validateClaim(claim);
  // Normalize address checksums for downstream consumers
  return {
    ...claim,
    withdrawTo: getAddress(claim.withdrawTo) as `0x${string}`,
    token: claim.token === '0x0000000000000000000000000000000000000000'
      ? claim.token
      : (getAddress(claim.token) as `0x${string}`),
    contractAddress: getAddress(claim.contractAddress) as `0x${string}`,
  };
}

/**
 * Convenience: build a claim from scratch (generates entropy, computes commitment).
 * Used by the depositor flow — encode the result, share the URL with recipient.
 */
export function newClaim(args: {
  withdrawTo: `0x${string}`;
  token: `0x${string}`;
  bucketIdx: number;
  contractAddress: `0x${string}`;
  chainId: number;
}): { claim: TeleportClaim; commitment: `0x${string}` } {
  const entropy = generateClaimEntropy();
  const claim: TeleportClaim = {
    ...entropy,
    withdrawTo: getAddress(args.withdrawTo) as `0x${string}`,
    token: args.token === '0x0000000000000000000000000000000000000000'
      ? args.token
      : (getAddress(args.token) as `0x${string}`),
    bucketIdx: args.bucketIdx,
    contractAddress: getAddress(args.contractAddress) as `0x${string}`,
    chainId: args.chainId,
  };
  return { claim, commitment: computeCommitment(claim) };
}
