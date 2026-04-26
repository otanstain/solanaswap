import { Connection, PublicKey } from '@solana/web3.js';
import { SwapTask, SessionState } from '../types';
import { generateSwapQueue, formatDuration, SwapQueueOptions } from '../utils/randomizer';
import {
  getQuote,
  getSwapTransaction,
  getTokenPrice,
  usdToTokenAmount,
  confirmTransaction,
  getTokenBalance,
} from './jupiter';
import { TOKENS, RPC_ENDPOINT } from '../constants/tokens';
import { updateStatsAfterSwap } from './storage';

let sessionAbortController: AbortController | null = null;

export function createSession(swapCount: number, options: SwapQueueOptions = {}): SessionState {
  const rawQueue = generateSwapQueue(swapCount, options);
  const swapQueue: SwapTask[] = rawQueue.map((item, index) => ({
    id: `swap-${Date.now()}-${index}`,
    fromToken: item.fromToken,
    toToken: item.toToken,
    amountUsd: item.amountUsd,
    slippageBps: item.slippageBps,
    delayMs: item.delayMs,
    status: 'pending',
  }));

  return {
    isActive: true,
    startedAt: Date.now(),
    swapQueue,
    currentSwapIndex: 0,
    completedToday: 0,
    failedToday: 0,
    totalGasSpent: 0,
    nextSwapTime: Date.now(),
  };
}

export function abortSession(): void {
  if (sessionAbortController) {
    sessionAbortController.abort();
    sessionAbortController = null;
  }
}

export async function executeSwap(
  task: SwapTask,
  userPublicKey: PublicKey,
  signAndSend: (tx: never) => Promise<string>,
  connection: Connection,
  remainingSwaps: number = 1,
): Promise<{ success: boolean; signature?: string; gasUsed?: number; error?: string }> {
  try {
    const fromTokenInfo = TOKENS[task.fromToken];
    if (!fromTokenInfo) {
      throw new Error(`Unknown token: ${task.fromToken}`);
    }

    const tokenPrice = await getTokenPrice(task.fromToken);
    if (tokenPrice <= 0) {
      throw new Error(`Cannot get price for ${task.fromToken}`);
    }

    // Always check SOL for gas — each swap needs ~0.005 SOL for gas
    // Reserve gas for current swap + all remaining swaps (including reverse swaps)
    const GAS_PER_SWAP_SOL = 0.005;
    const gasReserveSol = GAS_PER_SWAP_SOL * (remainingSwaps + 1); // +1 for safety margin

    const { balance: solBalance } = await getTokenBalance(connection, userPublicKey, 'SOL');
    if (solBalance < gasReserveSol) {
      throw new Error(
        `Insufficient SOL for gas: ${solBalance.toFixed(4)} SOL available, need ${gasReserveSol.toFixed(4)} SOL for ${remainingSwaps} remaining swaps`,
      );
    }

    // Check balance of swap token
    const { balance: rawBalance } = await getTokenBalance(connection, userPublicKey, task.fromToken);
    const neededTokenAmount = task.amountUsd / tokenPrice;

    // If swapping SOL, also reserve gas from SOL balance
    const effectiveBalance = task.fromToken === 'SOL'
      ? rawBalance - gasReserveSol
      : rawBalance;

    if (effectiveBalance < neededTokenAmount) {
      const availableUsd = Math.max(0, effectiveBalance) * tokenPrice;
      throw new Error(
        `Insufficient ${task.fromToken}: $${availableUsd.toFixed(2)} available, $${task.amountUsd.toFixed(2)} needed (reserving gas for ${remainingSwaps} swaps)`,
      );
    }

    const amountLamports = usdToTokenAmount(
      task.amountUsd,
      tokenPrice,
      fromTokenInfo.decimals,
    );

    if (amountLamports <= 0) {
      throw new Error('Calculated amount is too small');
    }

    const quote = await getQuote(
      task.fromToken,
      task.toToken,
      amountLamports,
      task.slippageBps,
    );

    const swapTx = await getSwapTransaction(
      quote,
      userPublicKey.toBase58(),
      { fromToken: task.fromToken, toToken: task.toToken, amountLamports, slippageBps: task.slippageBps },
    );

    const signature = await signAndSend(swapTx as never);

    const confirmed = await confirmTransaction(connection, signature);
    if (!confirmed) {
      throw new Error('Transaction failed on-chain');
    }

    const txInfo = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    const gasUsed = txInfo?.meta?.fee ?? 5000;

    await updateStatsAfterSwap(gasUsed, task.amountUsd);

    return { success: true, signature, gasUsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function runSwapSession(
  session: SessionState,
  userPublicKey: PublicKey,
  signAndSend: (tx: never) => Promise<string>,
  onUpdate: (session: SessionState) => void,
  onSwapComplete: (task: SwapTask, result: { success: boolean; signature?: string }) => void,
): Promise<void> {
  sessionAbortController = new AbortController();
  const { signal } = sessionAbortController;
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');

  for (let i = session.currentSwapIndex; i < session.swapQueue.length; i++) {
    if (signal.aborted) {
      session.isActive = false;
      onUpdate({ ...session });
      return;
    }

    const task = session.swapQueue[i];
    session.currentSwapIndex = i;

    // Wait for delay
    if (task.delayMs > 0) {
      session.nextSwapTime = Date.now() + task.delayMs;
      onUpdate({ ...session });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, task.delayMs);
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('Aborted'));
        });
      }).catch(() => {
        session.isActive = false;
        onUpdate({ ...session });
        return;
      });
    }

    if (signal.aborted) {
      session.isActive = false;
      onUpdate({ ...session });
      return;
    }

    // Execute swap
    task.status = 'executing';
    onUpdate({ ...session });

    const remainingSwaps = session.swapQueue.length - i;
    const result = await executeSwap(task, userPublicKey, signAndSend, connection, remainingSwaps);

    if (result.success) {
      task.status = 'completed';
      task.txSignature = result.signature;
      task.gasUsed = result.gasUsed;
      task.executedAt = Date.now();
      session.completedToday += 1;
      session.totalGasSpent += result.gasUsed ?? 0;
    } else {
      task.status = 'failed';
      task.errorMessage = result.error;
      session.failedToday += 1;

      // Stop session if out of SOL for gas
      if (result.error?.includes('Insufficient SOL for gas')) {
        session.isActive = false;
        session.nextSwapTime = null;
        onSwapComplete(task, result);
        onUpdate({ ...session });
        return;
      }
    }

    onSwapComplete(task, result);
    onUpdate({ ...session });
  }

  session.isActive = false;
  session.nextSwapTime = null;
  onUpdate({ ...session });
}
