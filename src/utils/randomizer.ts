import {
  SWAP_AMOUNT_MIN_USD,
  SWAP_AMOUNT_MAX_USD,
  DELAY_MIN_MINUTES,
  DELAY_MAX_MINUTES,
  SLIPPAGE_MIN_BPS,
  SLIPPAGE_MAX_BPS,
  TRADING_PAIRS,
  TradingPair,
} from '../constants/tokens';

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomIntInRange(min: number, max: number): number {
  return Math.floor(randomInRange(min, max + 1));
}

export function randomSwapAmountUsd(): number {
  return Math.round(randomInRange(SWAP_AMOUNT_MIN_USD, SWAP_AMOUNT_MAX_USD) * 100) / 100;
}

export function randomDelayMs(minMinutes?: number, maxMinutes?: number): number {
  const min = minMinutes ?? DELAY_MIN_MINUTES;
  const max = maxMinutes ?? DELAY_MAX_MINUTES;
  const minutes = randomInRange(min, max);
  return Math.round(minutes * 60 * 1000);
}

export function randomSlippageBps(): number {
  return randomIntInRange(SLIPPAGE_MIN_BPS, SLIPPAGE_MAX_BPS);
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateDailyPairOrder(): TradingPair[] {
  return shuffleArray(TRADING_PAIRS);
}

export function pickRandomPair(): TradingPair {
  const idx = Math.floor(Math.random() * TRADING_PAIRS.length);
  return TRADING_PAIRS[idx];
}

export interface SwapQueueOptions {
  preferredFromToken?: string;
  delayMinMinutes?: number;
  delayMaxMinutes?: number;
  tokenBalancesUsd?: Record<string, number>;
}

export function generateSwapQueue(count: number, options: SwapQueueOptions = {}): Array<{
  fromToken: string;
  toToken: string;
  amountUsd: number;
  slippageBps: number;
  delayMs: number;
}> {
  const { preferredFromToken = 'ALL', delayMinMinutes, delayMaxMinutes, tokenBalancesUsd } = options;
  let pairs = TRADING_PAIRS;
  if (preferredFromToken !== 'ALL') {
    pairs = TRADING_PAIRS.filter((p) => p.from === preferredFromToken);
    if (pairs.length === 0) pairs = TRADING_PAIRS;
  }

  // Filter out pairs where the from-token has zero balance
  if (tokenBalancesUsd) {
    const affordable = pairs.filter((p) => {
      const bal = tokenBalancesUsd[p.from] ?? 0;
      return bal * 0.8 >= SWAP_AMOUNT_MIN_USD;
    });
    if (affordable.length > 0) {
      pairs = affordable;
    }
  }

  const shuffledPairs = shuffleArray(pairs);
  const queue = [];

  for (let i = 0; i < count; i++) {
    const pair = shuffledPairs[i % shuffledPairs.length];

    // Cap swap amount to available balance of from-token
    let maxUsd = SWAP_AMOUNT_MAX_USD;
    if (tokenBalancesUsd) {
      const available = tokenBalancesUsd[pair.from] ?? 0;
      // Reserve 20% of balance for gas/other swaps
      maxUsd = Math.min(SWAP_AMOUNT_MAX_USD, available * 0.8);
    }
    const minUsd = Math.min(SWAP_AMOUNT_MIN_USD, maxUsd);
    const amountUsd = maxUsd <= minUsd
      ? Math.round(minUsd * 100) / 100
      : Math.round(randomInRange(minUsd, maxUsd) * 100) / 100;

    queue.push({
      fromToken: pair.from,
      toToken: pair.to,
      amountUsd,
      slippageBps: randomSlippageBps(),
      delayMs: i === 0 ? 0 : randomDelayMs(delayMinMinutes, delayMaxMinutes),
    });
  }

  return queue;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatSol(lamports: number): string {
  return `${(lamports / 1e9).toFixed(4)} SOL`;
}
