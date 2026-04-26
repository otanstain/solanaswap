import { PublicKey } from '@solana/web3.js';

export interface TokenInfo {
  symbol: string;
  name: string;
  mint: PublicKey;
  decimals: number;
  coingeckoId?: string;
}

export const TOKENS: Record<string, TokenInfo> = {
  SOL: {
    symbol: 'SOL',
    name: 'Solana',
    mint: new PublicKey('So11111111111111111111111111111111111111112'),
    decimals: 9,
    coingeckoId: 'solana',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    decimals: 6,
    coingeckoId: 'usd-coin',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether',
    mint: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
    decimals: 6,
    coingeckoId: 'tether',
  },
  SKR: {
    symbol: 'SKR',
    name: 'Seeker',
    mint: new PublicKey('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'),
    decimals: 9,
  },
};

export interface TradingPair {
  from: string;
  to: string;
  label: string;
}

export const TRADING_PAIRS: TradingPair[] = [
  { from: 'SOL', to: 'USDC', label: 'SOL → USDC' },
  { from: 'USDC', to: 'SOL', label: 'USDC → SOL' },
  { from: 'SOL', to: 'USDT', label: 'SOL → USDT' },
  { from: 'USDT', to: 'SOL', label: 'USDT → SOL' },
  { from: 'USDC', to: 'USDT', label: 'USDC → USDT' },
  { from: 'USDT', to: 'USDC', label: 'USDT → USDC' },
  { from: 'SOL', to: 'SKR', label: 'SOL → SKR' },
  { from: 'SKR', to: 'SOL', label: 'SKR → SOL' },
];

export const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
export const JUPITER_API_URL = 'https://quote-api.jup.ag/v6';

export const PLATFORM_FEE_BPS = 25; // 0.25%
export const PLATFORM_FEE_ACCOUNT = 'J6X5C1QmsENS4wKa1rQz1cxFxGN5msNK4NYNFeHdPdT8';

export const SWAP_AMOUNT_MIN_USD = 1;
export const SWAP_AMOUNT_MAX_USD = 15;
export const DELAY_MIN_MINUTES = 2;
export const DELAY_MAX_MINUTES = 8;
export const SLIPPAGE_MIN_BPS = 50;   // 0.5%
export const SLIPPAGE_MAX_BPS = 150;  // 1.5%
export const DEFAULT_SWAPS_PER_DAY = 50;
export const MAX_SWAPS_PER_DAY = 100;
export const MIN_SWAPS_PER_DAY = 50;
