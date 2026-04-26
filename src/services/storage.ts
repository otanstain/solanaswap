import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, SwapStats } from '../types';
import { DEFAULT_SWAPS_PER_DAY } from '../constants/tokens';

const KEYS = {
  SETTINGS: '@seeker_auto_swap_settings',
  STATS: '@seeker_auto_swap_stats',
  LAST_SESSION: '@seeker_auto_swap_last_session',
};

const DEFAULT_SETTINGS: AppSettings = {
  swapsPerDay: DEFAULT_SWAPS_PER_DAY,
  dailyBudgetUsd: 100,
  enableNotifications: true,
  enableBackgroundSwaps: false,
  preferredFromToken: 'ALL',
};

const DEFAULT_STATS: SwapStats = {
  totalSwapsAllTime: 0,
  totalGasAllTime: 0,
  totalVolumeUsd: 0,
  sessionsCompleted: 0,
  lastSessionDate: null,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

export async function loadStats(): Promise<SwapStats> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.STATS);
    if (raw) {
      return { ...DEFAULT_STATS, ...JSON.parse(raw) };
    }
    return DEFAULT_STATS;
  } catch {
    return DEFAULT_STATS;
  }
}

export async function saveStats(stats: SwapStats): Promise<void> {
  await AsyncStorage.setItem(KEYS.STATS, JSON.stringify(stats));
}

export async function updateStatsAfterSwap(
  gasLamports: number,
  volumeUsd: number,
): Promise<SwapStats> {
  const stats = await loadStats();
  stats.totalSwapsAllTime += 1;
  stats.totalGasAllTime += gasLamports;
  stats.totalVolumeUsd += volumeUsd;
  await saveStats(stats);
  return stats;
}

export async function updateStatsAfterSession(): Promise<SwapStats> {
  const stats = await loadStats();
  stats.sessionsCompleted += 1;
  stats.lastSessionDate = new Date().toISOString().split('T')[0];
  await saveStats(stats);
  return stats;
}

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}
