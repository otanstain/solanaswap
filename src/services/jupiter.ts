import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TOKENS, JUPITER_API_URL, PLATFORM_FEE_BPS, PLATFORM_FEE_ACCOUNT } from '../constants/tokens';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const FEE_WALLET = new PublicKey(PLATFORM_FEE_ACCOUNT);

function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

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

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries: number = 3,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Fetch attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}`);
    }
  }

  throw new Error(`Network request failed after ${maxRetries} attempts: ${lastError?.message}`);
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

  const response = await fetchWithRetry(`${JUPITER_API_URL}/quote?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter quote error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function getSwapTransaction(
  quoteResponse: QuoteResponse,
  userPublicKey: string,
): Promise<VersionedTransaction> {
  // Derive fee token account for the output mint
  const outputMint = new PublicKey(quoteResponse.outputMint);
  const feeTokenAccount = getAssociatedTokenAddress(FEE_WALLET, outputMint);

  // Try with fee first, fall back without fee if it fails
  let response = await fetchWithRetry(`${JUPITER_API_URL}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
      feeAccount: feeTokenAccount.toBase58(),
    }),
  });

  // If fee account fails (e.g. ATA doesn't exist), retry without fee
  if (!response.ok) {
    console.warn('Swap with fee failed, retrying without fee...');
    response = await fetchWithRetry(`${JUPITER_API_URL}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter swap error (${response.status}): ${errorText}`);
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
    const response = await fetchWithRetry(
      `https://api.jup.ag/price/v2?ids=${tokenInfo.mint.toBase58()}`,
      undefined,
      2,
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
