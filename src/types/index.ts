export interface SwapTask {
  id: string;
  fromToken: string;
  toToken: string;
  amountUsd: number;
  slippageBps: number;
  delayMs: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  txSignature?: string;
  errorMessage?: string;
  executedAt?: number;
  gasUsed?: number;
}

export interface SessionState {
  isActive: boolean;
  startedAt: number | null;
  swapQueue: SwapTask[];
  currentSwapIndex: number;
  completedToday: number;
  failedToday: number;
  totalGasSpent: number;
  nextSwapTime: number | null;
}

export interface AppSettings {
  swapsPerDay: number;
  dailyBudgetUsd: number;
  enableNotifications: boolean;
  enableBackgroundSwaps: boolean;
  preferredFromToken: string;
  delayMinMinutes: number;
  delayMaxMinutes: number;
  sessionDurationHours: number;
}

export interface SwapStats {
  totalSwapsAllTime: number;
  totalGasAllTime: number;
  totalVolumeUsd: number;
  sessionsCompleted: number;
  lastSessionDate: string | null;
}

export interface WalletState {
  isAuthorized: boolean;
  publicKey: string | null;
  authToken: string | null;
  label: string | null;
}
