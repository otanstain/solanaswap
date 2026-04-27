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

  // Track remaining balance per token for dynamic amount calculation
  const remainingBalance: Record<string, number> = {};
  if (tokenBalancesUsd) {
    for (const [token, bal] of Object.entries(tokenBalancesUsd)) {
      remainingBalance[token] = bal * 0.8; // 20% reserve for gas
    }
  }

  // Count how many swaps will use each token (for dividing balance)
  const swapsPerToken: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    const pair = shuffledPairs[i % shuffledPairs.length];
    swapsPerToken[pair.from] = (swapsPerToken[pair.from] ?? 0) + 1;
  }

  for (let i = 0; i < count; i++) {
    const pair = shuffledPairs[i % shuffledPairs.length];

    // Dynamic swap amount based on actual available balance
    let amountUsd: number;
    if (tokenBalancesUsd) {
      const available = remainingBalance[pair.from] ?? 0;
      const swapsLeft = Math.max(1, swapsPerToken[pair.from] ?? 1);

      // Divide remaining balance evenly among remaining swaps for this token
      // Add ±30% randomization for natural-looking behavior
      const perSwap = available / swapsLeft;
      const minAmount = Math.max(SWAP_AMOUNT_MIN_USD, perSwap * 0.7);
      const maxAmount = Math.min(perSwap * 1.3, available);
      amountUsd = maxAmount <= minAmount
        ? Math.round(Math.max(SWAP_AMOUNT_MIN_USD, minAmount) * 100) / 100
        : Math.round(randomInRange(minAmount, maxAmount) * 100) / 100;

      // Deduct from remaining balance for this token
      remainingBalance[pair.from] = Math.max(0, available - amountUsd);
      swapsPerToken[pair.from] = Math.max(0, swapsLeft - 1);
    } else {
      // Fallback to fixed range if no balances available
      amountUsd = Math.round(randomInRange(SWAP_AMOUNT_MIN_USD, SWAP_AMOUNT_MAX_USD) * 100) / 100;
    }

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
