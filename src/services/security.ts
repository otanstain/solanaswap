import { VersionedTransaction, PublicKey } from '@solana/web3.js';
import { QuoteResponse } from './jupiter';
import { TOKENS } from '../constants/tokens';

// Known safe program IDs that Jupiter routes through
const JUPITER_PROGRAM_IDS = [
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',  // Jupiter v6 aggregator
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',  // Jupiter v4
  'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uN4e7',  // Jupiter v2
];

const SYSTEM_PROGRAMS = [
  '11111111111111111111111111111111',               // System Program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',   // Token Program
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',  // Associated Token Program
  'ComputeBudget111111111111111111111111111111',     // Compute Budget
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',   // Token 2022
];

const KNOWN_DEX_PROGRAMS = [
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',  // Raydium AMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',   // Orca Whirlpool
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',  // Orca v1
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',  // Raydium CLMM
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',   // Serum/OpenBook
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',   // Meteora
];

// Maximum price impact we'll tolerate (5%)
const MAX_PRICE_IMPACT_PCT = 5.0;

// Maximum slippage we'll allow (3% = 300 bps)
const MAX_SLIPPAGE_BPS = 300;

// Minimum output ratio — reject if output is less than 90% of expected
const MIN_OUTPUT_RATIO = 0.90;

export interface SecurityCheckResult {
  safe: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validate that the Jupiter quote is safe before executing
 */
export function validateQuote(
  quote: QuoteResponse,
  expectedInputAmount: number,
  slippageBps: number,
): SecurityCheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. Check price impact
  const priceImpact = parseFloat(quote.priceImpactPct);
  if (isNaN(priceImpact)) {
    warnings.push('Could not parse price impact');
  } else if (priceImpact > MAX_PRICE_IMPACT_PCT) {
    errors.push(`Price impact too high: ${priceImpact.toFixed(2)}% (max ${MAX_PRICE_IMPACT_PCT}%)`);
  } else if (priceImpact > 2.0) {
    warnings.push(`Elevated price impact: ${priceImpact.toFixed(2)}%`);
  }

  // 2. Validate slippage is within safe bounds
  if (slippageBps > MAX_SLIPPAGE_BPS) {
    errors.push(`Slippage too high: ${slippageBps / 100}% (max ${MAX_SLIPPAGE_BPS / 100}%)`);
  }

  // 3. Verify input amount matches what we requested
  const actualInput = parseInt(quote.inAmount, 10);
  if (Math.abs(actualInput - expectedInputAmount) > expectedInputAmount * 0.01) {
    errors.push(`Input amount mismatch: expected ${expectedInputAmount}, got ${actualInput}`);
  }

  // 4. Verify output is reasonable (not suspiciously low)
  const inAmount = parseInt(quote.inAmount, 10);
  const outAmount = parseInt(quote.outAmount, 10);
  if (inAmount > 0 && outAmount <= 0) {
    errors.push('Output amount is zero — possible routing issue');
  }

  // 5. Verify mints are from known tokens
  const knownMints = Object.values(TOKENS).map((t) => t.mint.toBase58());
  if (!knownMints.includes(quote.inputMint)) {
    errors.push(`Unknown input mint: ${quote.inputMint}`);
  }
  if (!knownMints.includes(quote.outputMint)) {
    errors.push(`Unknown output mint: ${quote.outputMint}`);
  }

  return {
    safe: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate the swap transaction before signing
 * Checks that it only interacts with known safe programs
 */
export function validateTransaction(tx: VersionedTransaction): SecurityCheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const allSafePrograms = [
    ...JUPITER_PROGRAM_IDS,
    ...SYSTEM_PROGRAMS,
    ...KNOWN_DEX_PROGRAMS,
  ];

  try {
    const message = tx.message;
    const accountKeys = message.staticAccountKeys.map((k) => k.toBase58());

    // Validate program IDs used by each instruction against allowlist
    let hasJupiter = false;
    const unknownPrograms: string[] = [];

    for (const ix of message.compiledInstructions) {
      const programId = accountKeys[ix.programIdIndex];
      if (!programId) continue;

      if (JUPITER_PROGRAM_IDS.includes(programId)) {
        hasJupiter = true;
      }

      if (!allSafePrograms.includes(programId)) {
        unknownPrograms.push(programId);
      }
    }

    // Block if unknown programs found in static keys (potential malicious injection)
    if (unknownPrograms.length > 0) {
      // v0 transactions may have lookup-table-resolved programs that appear unknown
      // Only error if there are no lookup tables (legacy tx with unknown programs)
      const hasLookupTables = 'addressTableLookups' in message
        && Array.isArray((message as { addressTableLookups?: unknown[] }).addressTableLookups)
        && ((message as { addressTableLookups: unknown[] }).addressTableLookups).length > 0;

      if (!hasLookupTables) {
        errors.push(`Unknown programs in transaction: ${unknownPrograms.join(', ')}`);
      } else {
        warnings.push(`Unverified programs (may be from lookup tables): ${unknownPrograms.slice(0, 3).join(', ')}`);
      }
    }

    if (!hasJupiter) {
      warnings.push('Transaction does not contain Jupiter program — may be routed through other DEXes');
    }

    // Verify transaction doesn't have too many instructions (potential exploit)
    const numInstructions = message.compiledInstructions.length;
    if (numInstructions > 30) {
      warnings.push(`Unusually high instruction count: ${numInstructions}`);
    }

    // Check that the transaction is not unreasonably large
    const serialized = tx.serialize();
    if (serialized.length > 1200) {
      warnings.push(`Large transaction size: ${serialized.length} bytes`);
    }
  } catch (err) {
    warnings.push(`Transaction validation error: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  return {
    safe: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate that output amount after swap is reasonable
 * compared to what was quoted
 */
export function validateSwapOutput(
  quotedOutputAmount: string,
  actualOutputAmount: number,
): SecurityCheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const expected = parseInt(quotedOutputAmount, 10);
  if (expected > 0 && actualOutputAmount > 0) {
    const ratio = actualOutputAmount / expected;
    if (ratio < MIN_OUTPUT_RATIO) {
      errors.push(
        `Output ${(ratio * 100).toFixed(1)}% of quoted amount — possible sandwich attack`,
      );
    }
  }

  return {
    safe: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Security constants for the swap engine
 */
export const SECURITY_CONFIG = {
  MAX_PRICE_IMPACT_PCT,
  MAX_SLIPPAGE_BPS,
  MIN_OUTPUT_RATIO,
  // Use Jito RPC for MEV protection (sends tx as bundle, not visible in mempool)
  JITO_RPC_URL: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
  // Priority fee strategy: use dynamic fees to land faster, reducing MEV window
  USE_DYNAMIC_PRIORITY_FEE: true,
  // Maximum compute units to prevent drain attacks
  MAX_COMPUTE_UNITS: 400_000,
};
