import { Connection, VersionedTransaction } from '@solana/web3.js';
import { TOKENS, JUPITER_API_URL, PLATFORM_FEE_BPS, PLATFORM_FEE_ACCOUNT } from '../constants/tokens';

export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

export interface SwapResult {
  txSignature: string;
  inputAmount: string;
  outputAmount: string;
}

export async function getQuote(
  fromToken: string,
  toToken: string,
  amountLamports: number,
  slippageBps: number,
): Promise<QuoteResponse> {
  const inputMint = TOKENS[fromToken].mint.toBase58();
  const outputMint = TOKENS[toToken].mint.toBase58();

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: Math.floor(amountLamports).toString(),
    slippageBps: slippageBps.toString(),
    onlyDirectRoutes: 'false',
    asLegacyTransaction: 'false',
    platformFeeBps: PLATFORM_FEE_BPS.toString(),
  });

  const response = await fetch(`${JUPITER_API_URL}/quote?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter quote failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

export async function getSwapTransaction(
  quoteResponse: QuoteResponse,
  userPublicKey: string,
): Promise<VersionedTransaction> {
  const response = await fetch(`${JUPITER_API_URL}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
      feeAccount: PLATFORM_FEE_ACCOUNT,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter swap failed: ${response.status} - ${errorText}`);
  }

  const swapData = await response.json();
  const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
  return VersionedTransaction.deserialize(swapTransactionBuf);
}

export async function getTokenPrice(tokenSymbol: string): Promise<number> {
  const tokenInfo = TOKENS[tokenSymbol];
  if (!tokenInfo) throw new Error(`Unknown token: ${tokenSymbol}`);

  if (tokenSymbol === 'USDC' || tokenSymbol === 'USDT') return 1;

  try {
    const response = await fetch(
      `https://api.jup.ag/price/v2?ids=${tokenInfo.mint.toBase58()}`,
    );
    const data = await response.json();
    const priceData = data.data[tokenInfo.mint.toBase58()];
    return priceData ? parseFloat(priceData.price) : 0;
  } catch {
    return 0;
  }
}

export function usdToTokenAmount(
  usdAmount: number,
  tokenPrice: number,
  decimals: number,
): number {
  if (tokenPrice <= 0) return 0;
  const tokenAmount = usdAmount / tokenPrice;
  return Math.floor(tokenAmount * Math.pow(10, decimals));
}

export async function getTokenBalance(
  connection: Connection,
  walletPubkey: import('@solana/web3.js').PublicKey,
  tokenSymbol: string,
): Promise<{ balance: number; balanceUsd: number }> {
  const tokenInfo = TOKENS[tokenSymbol];
  if (!tokenInfo) return { balance: 0, balanceUsd: 0 };

  try {
    let balance: number;

    if (tokenSymbol === 'SOL') {
      const lamports = await connection.getBalance(walletPubkey);
      balance = lamports / Math.pow(10, tokenInfo.decimals);
    } else {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletPubkey,
        { mint: tokenInfo.mint },
      );
      if (tokenAccounts.value.length > 0) {
        balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0;
      } else {
        balance = 0;
      }
    }

    const price = await getTokenPrice(tokenSymbol);
    return { balance, balanceUsd: balance * price };
  } catch {
    return { balance: 0, balanceUsd: 0 };
  }
}

export async function confirmTransaction(
  connection: Connection,
  signature: string,
  timeoutMs: number = 60000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await connection.getSignatureStatus(signature);

    if (status.value?.confirmationStatus === 'confirmed' ||
        status.value?.confirmationStatus === 'finalized') {
      return !status.value.err;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('Transaction confirmation timeout');
}
