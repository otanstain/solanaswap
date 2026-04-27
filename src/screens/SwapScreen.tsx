import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { SessionState, SwapTask, AppSettings } from '../types';
import { useMobileWallet } from '../hooks/useMobileWallet';
import { createSession, runSwapSession, abortSession, SwapResult } from '../services/swapEngine';
import { loadSettings } from '../services/storage';
import { formatDuration, formatUsd, formatSol } from '../utils/randomizer';
import { getTokenBalance } from '../services/jupiter';
import { TOKENS, SWAP_AMOUNT_MIN_USD, SWAP_AMOUNT_MAX_USD } from '../constants/tokens';
import {
  scheduleNextSwapNotification,
  sendSwapCompletedNotification,
  sendSessionCompleteNotification,
  cancelAllNotifications,
  requestNotificationPermissions,
} from '../services/notifications';

const FROM_TOKEN_OPTIONS = ['ALL', ...Object.keys(TOKENS)];

export default function SwapScreen() {
  const {
    publicKey,
    isAuthorized,
    connect,
    disconnect,
    signAndSendTransaction,
    connection,
  } = useMobileWallet();

  const [session, setSession] = useState<SessionState | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [balances, setBalances] = useState<Record<string, { balance: number; balanceUsd: number }>>({
    SOL: { balance: 0, balanceUsd: 0 },
    USDC: { balance: 0, balanceUsd: 0 },
    USDT: { balance: 0, balanceUsd: 0 },
    SKR: { balance: 0, balanceUsd: 0 },
  });
  const [selectedFromToken, setSelectedFromToken] = useState<string>('ALL');
  const [balancesLoading, setBalancesLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadSettings().then((loaded) => {
      setSettings(loaded);
      if (loaded.preferredFromToken) {
        setSelectedFromToken(loaded.preferredFromToken);
      }
    });
  }, []);

  const fetchBalances = useCallback(async () => {
    if (!publicKey || !connection) return;
    setBalancesLoading(true);
    try {
      const tokens = ['SOL', 'USDC', 'USDT', 'SKR'];
      const results = await Promise.all(
        tokens.map(async (token) => {
          const result = await getTokenBalance(connection, publicKey, token);
          return [token, result] as const;
        }),
      );
      setBalances(Object.fromEntries(results));
    } finally {
      setBalancesLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (isAuthorized) {
      fetchBalances();
    }
  }, [isAuthorized, fetchBalances]);

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (session?.isActive && session.nextSwapTime) {
      timerRef.current = setInterval(() => {
        const remaining = (session.nextSwapTime ?? 0) - Date.now();
        if (remaining <= 0) {
          setCountdown('Executing...');
        } else {
          setCountdown(formatDuration(remaining));
        }
      }, 500);
    } else {
      setCountdown('');
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.isActive, session?.nextSwapTime]);

  const handleConnect = useCallback(async () => {
    try {
      await connect();
    } catch (err) {
      Alert.alert('Connection Failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [connect]);

  const handleDisconnect = useCallback(async () => {
    Alert.alert('Disconnect Wallet', 'Are you sure you want to disconnect?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            if (session?.isActive) {
              abortSession();
              await cancelAllNotifications();
            }
            await disconnect();
            setSession(null);
            setBalances({
              SOL: { balance: 0, balanceUsd: 0 },
              USDC: { balance: 0, balanceUsd: 0 },
              USDT: { balance: 0, balanceUsd: 0 },
              SKR: { balance: 0, balanceUsd: 0 },
            });
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to disconnect');
          }
        },
      },
    ]);
  }, [disconnect, session?.isActive]);

  const startSessionWithBalances = useCallback(async (
    freshBalances: Record<string, number>,
    swapCount: number,
  ) => {
    if (!publicKey || !settings || !connection) return;

    await requestNotificationPermissions();
    await cancelAllNotifications();

    const newSession = createSession(swapCount, {
      preferredFromToken: selectedFromToken,
      delayMinMinutes: settings.delayMinMinutes,
      delayMaxMinutes: settings.delayMaxMinutes,
      tokenBalancesUsd: freshBalances,
    });
    setSession(newSession);

    await runSwapSession(
      newSession,
      publicKey,
      signAndSendTransaction as never,
      (updated) => {
        setSession({ ...updated });
      },
      async (task: SwapTask, result: SwapResult) => {
        const totalSwaps = newSession.swapQueue.length;
        const completed = newSession.completedToday;
        const label = `${task.fromToken} → ${task.toToken}`;

        if (settings.enableNotifications) {
          await sendSwapCompletedNotification(
            label,
            result.success,
            completed,
            totalSwaps,
          );
        }

        // Refresh balances after each swap
        fetchBalances();

        // Schedule notification for next swap (skip if session stopped)
        const nextIdx = newSession.currentSwapIndex + 1;
        if (newSession.isActive && nextIdx < newSession.swapQueue.length && settings.enableNotifications) {
          const nextTask = newSession.swapQueue[nextIdx];
          const nextLabel = `${nextTask.fromToken} → ${nextTask.toToken}`;
          await scheduleNextSwapNotification(
            nextTask.delayMs / 1000,
            nextLabel,
            nextTask.amountUsd,
          );
        }
      },
    );

    // Session complete
    if (settings.enableNotifications) {
      await sendSessionCompleteNotification(
        newSession.completedToday,
        newSession.totalGasSpent / 1e9,
      );
    }
  }, [publicKey, settings, signAndSendTransaction, selectedFromToken, fetchBalances, connection]);

  const handleStartSession = useCallback(async () => {
    if (!publicKey || !settings || !connection) return;

    setBalancesLoading(true);
    const tokens = ['SOL', 'USDC', 'USDT', 'SKR'];
    const freshBalances: Record<string, number> = {};
    const freshBalancesFull: Record<string, { balance: number; balanceUsd: number }> = {};
    try {
      const results = await Promise.all(
        tokens.map(async (token) => {
          const result = await getTokenBalance(connection, publicKey, token);
          return { token, result };
        }),
      );
      for (const { token, result } of results) {
        freshBalances[token] = result.balanceUsd;
        freshBalancesFull[token] = result;
      }
      setBalances(freshBalancesFull);
    } catch (err) {
      Alert.alert('Error', `Failed to fetch balances: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    } finally {
      setBalancesLoading(false);
    }

    // Estimate how many swaps are affordable
    const GAS_COST_PER_SWAP_USD = 0.01; // ~0.005 SOL per swap at ~$150/SOL
    const avgSwapUsd = (SWAP_AMOUNT_MIN_USD + SWAP_AMOUNT_MAX_USD) / 2;

    let availableForSwaps: number;
    let affordableTokens: string[] = [];

    if (selectedFromToken !== 'ALL') {
      const tokenBal = freshBalances[selectedFromToken] ?? 0;
      const usable = tokenBal * 0.8; // 20% reserve
      if (usable < SWAP_AMOUNT_MIN_USD) {
        Alert.alert(
          'Insufficient Balance',
          `${selectedFromToken}: $${tokenBal.toFixed(2)} (usable: $${usable.toFixed(2)}).\nNeed at least $${SWAP_AMOUNT_MIN_USD} per swap.\n\nTry "ALL" or add more funds.`,
        );
        return;
      }
      availableForSwaps = usable;
      affordableTokens = [selectedFromToken];
    } else {
      // In ALL mode, sum up usable balances of all tokens that can fund at least 1 swap
      let totalUsable = 0;
      for (const [token, bal] of Object.entries(freshBalances)) {
        const usable = bal * 0.8;
        if (usable >= SWAP_AMOUNT_MIN_USD) {
          totalUsable += usable;
          affordableTokens.push(token);
        }
      }
      if (affordableTokens.length === 0) {
        const totalBal = Object.values(freshBalances).reduce((s, v) => s + v, 0);
        Alert.alert(
          'Insufficient Balance',
          `No token has enough for a swap (min $${SWAP_AMOUNT_MIN_USD}).\nTotal balance: $${totalBal.toFixed(2)}.\n\nAdd more funds to start.`,
        );
        return;
      }
      availableForSwaps = totalUsable;
    }

    // Calculate max affordable swaps (considering gas costs from SOL)
    const solBalUsd = freshBalances['SOL'] ?? 0;
    const maxSwapsByGas = Math.floor(solBalUsd / GAS_COST_PER_SWAP_USD);
    const maxSwapsByBalance = Math.floor(availableForSwaps / avgSwapUsd);
    const estimatedSwaps = Math.min(maxSwapsByGas, maxSwapsByBalance, settings.swapsPerDay);
    const requestedSwaps = settings.swapsPerDay;

    const totalBalUsd = Object.values(freshBalances).reduce((s, v) => s + v, 0);
    const estimatedGasCost = (estimatedSwaps * GAS_COST_PER_SWAP_USD).toFixed(2);

    // Build summary message
    let summaryLines = [
      `Balance: $${totalBalUsd.toFixed(2)}`,
      `Tokens available: ${affordableTokens.join(', ')}`,
      ``,
      `Requested: ${requestedSwaps} swaps`,
      `Estimated possible: ${estimatedSwaps} swaps`,
      `Avg swap: ~$${avgSwapUsd.toFixed(0)}`,
      `Est. gas cost: ~$${estimatedGasCost}`,
    ];

    if (estimatedSwaps < requestedSwaps) {
      if (maxSwapsByGas < maxSwapsByBalance) {
        summaryLines.push(``, `⚠ Limited by SOL for gas ($${solBalUsd.toFixed(2)})`);
      } else {
        summaryLines.push(``, `⚠ Limited by token balance`);
      }
    }

    if (estimatedSwaps === 0) {
      Alert.alert(
        'Cannot Start Session',
        summaryLines.join('\n') + '\n\nNot enough balance for any swaps.',
      );
      return;
    }

    // Confirm with user
    Alert.alert(
      'Start Session?',
      summaryLines.join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Start (${estimatedSwaps} swaps)`,
          onPress: () => startSessionWithBalances(freshBalances, estimatedSwaps),
        },
      ],
    );
  }, [publicKey, settings, connection, selectedFromToken, startSessionWithBalances]);

  const handleStopSession = useCallback(() => {
    Alert.alert('Stop Session', 'Are you sure you want to stop the current session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => {
          abortSession();
          cancelAllNotifications();
        },
      },
    ]);
  }, []);

  const getCurrentSwap = (): SwapTask | null => {
    if (!session) return null;
    return session.swapQueue[session.currentSwapIndex] ?? null;
  };

  const renderSwapItem = ({ item, index }: { item: SwapTask; index: number }) => {
    const isCurrent = session?.currentSwapIndex === index;
    return (
      <View
        style={[
          styles.swapItem,
          isCurrent && styles.swapItemActive,
          item.status === 'completed' && styles.swapItemCompleted,
          item.status === 'failed' && styles.swapItemFailed,
          item.status === 'timeout' && styles.swapItemTimeout,
        ]}
      >
        <View style={styles.swapItemLeft}>
          <Text style={styles.swapIndex}>#{index + 1}</Text>
          <View>
            <Text style={styles.swapPair}>
              {item.fromToken} → {item.toToken}
            </Text>
            <Text style={styles.swapDetail}>
              {formatUsd(item.amountUsd)} · {(item.slippageBps / 100).toFixed(1)}%
            </Text>
          </View>
        </View>
        <View style={styles.swapItemRight}>
          <Text
            style={[
              styles.swapStatus,
              item.status === 'completed' && styles.statusCompleted,
              item.status === 'failed' && styles.statusFailed,
              item.status === 'timeout' && styles.statusTimeout,
              item.status === 'executing' && styles.statusExecuting,
              item.status === 'confirming' && styles.statusConfirming,
            ]}
          >
            {item.status === 'pending'
              ? 'Pending'
              : item.status === 'executing'
              ? 'Signing...'
              : item.status === 'confirming'
              ? 'Confirming...'
              : item.status === 'completed'
              ? (item.confirmationStatus === 'finalized' ? 'Finalized' : 'Confirmed')
              : item.status === 'timeout'
              ? 'Timeout'
              : 'Failed'}
          </Text>
          {item.txSignature && (
            <Text style={styles.txSignatureText}>
              {item.txSignature.slice(0, 8)}...
            </Text>
          )}
        </View>
      </View>
    );
  };

  if (!isAuthorized) {
    return (
      <View style={styles.container}>
        <View style={styles.connectContainer}>
          <Text style={styles.title}>Seeker Auto-Swap</Text>
          <Text style={styles.subtitle}>
            Connect your Seed Vault to start automated swapping
          </Text>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <Text style={styles.connectBtnText}>Connect Wallet</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const currentSwap = getCurrentSwap();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Swap Queue</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={fetchBalances} style={styles.refreshBtn}>
            <Text style={styles.refreshBtnText}>{balancesLoading ? '...' : '↻'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDisconnect} style={styles.walletBtn}>
            <Text style={styles.walletAddress}>
              {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Balances */}
      <View style={styles.balancesBar}>
        {Object.entries(balances).map(([token, { balance }]) => (
          <View key={token} style={styles.balanceItem}>
            <Text style={styles.balanceTokenLabel}>{token}</Text>
            <Text style={[styles.balanceTokenValue, balancesLoading && { color: '#666' }]}>
              {balancesLoading ? '...' : token === 'SOL' ? balance.toFixed(4) : balance.toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      {/* Token Selector */}
      {(!session || !session.isActive) && (
        <View style={styles.tokenSelectorContainer}>
          <Text style={styles.tokenSelectorLabel}>Swap From:</Text>
          <View style={styles.tokenSelector}>
            {FROM_TOKEN_OPTIONS.map((token) => (
              <TouchableOpacity
                key={token}
                style={[
                  styles.tokenBtn,
                  selectedFromToken === token && styles.tokenBtnActive,
                ]}
                onPress={() => setSelectedFromToken(token)}
              >
                <Text
                  style={[
                    styles.tokenBtnText,
                    selectedFromToken === token && styles.tokenBtnTextActive,
                  ]}
                >
                  {token}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Status Bar */}
      {session && (
        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Done</Text>
            <Text style={styles.statusValue}>{session.completedToday}</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Failed</Text>
            <Text style={[styles.statusValue, styles.statusFailed]}>
              {session.failedToday}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Gas</Text>
            <Text style={styles.statusValue}>
              {formatSol(session.totalGasSpent)}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Total</Text>
            <Text style={styles.statusValue}>{session.swapQueue.length}</Text>
          </View>
        </View>
      )}

      {/* Next Swap Timer / Status */}
      {session?.isActive && currentSwap && (
        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>
            {currentSwap.status === 'confirming' ? 'Confirming Transaction' :
             currentSwap.status === 'executing' ? 'Executing Swap' : 'Next Swap'}
          </Text>
          <Text style={styles.timerPair}>
            {currentSwap.fromToken} → {currentSwap.toToken}
          </Text>
          <Text style={styles.timerAmount}>
            {formatUsd(currentSwap.amountUsd)}
          </Text>
          {currentSwap.status === 'confirming' ? (
            <Text style={[styles.timerCountdown, { color: '#FFA500', fontSize: 20 }]}>
              Waiting for confirmation...
            </Text>
          ) : currentSwap.status === 'executing' ? (
            <Text style={[styles.timerCountdown, { color: '#9945FF', fontSize: 20 }]}>
              Sign in wallet...
            </Text>
          ) : (
            <Text style={styles.timerCountdown}>{countdown}</Text>
          )}
          <Text style={styles.timerSlippage}>
            Slippage: {(currentSwap.slippageBps / 100).toFixed(1)}%
          </Text>
          {currentSwap.txSignature && currentSwap.status !== 'completed' && (
            <Text style={[styles.timerSlippage, { fontFamily: 'monospace', marginTop: 4 }]}>
              TX: {currentSwap.txSignature.slice(0, 12)}...
            </Text>
          )}
        </View>
      )}

      {/* Swap List */}
      {session && (
        <FlatList
          data={session.swapQueue}
          renderItem={renderSwapItem}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Action Button */}
      <View style={styles.footer}>
        {!session || !session.isActive ? (
          <TouchableOpacity
            style={styles.startBtn}
            onPress={handleStartSession}
          >
            <Text style={styles.startBtnText}>Start Daily Session</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.stopBtn}
            onPress={handleStopSession}
          >
            <Text style={styles.stopBtnText}>Stop Session</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  connectContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 32,
  },
  connectBtn: {
    backgroundColor: '#9945FF',
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: 16,
  },
  connectBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshBtn: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshBtnText: {
    color: '#14F195',
    fontSize: 18,
    fontWeight: 'bold',
  },
  walletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletAddress: {
    color: '#14F195',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tokenSelectorContainer: {
    marginHorizontal: 20,
    marginBottom: 8,
  },
  tokenSelectorLabel: {
    color: '#888',
    fontSize: 13,
    marginBottom: 6,
  },
  tokenSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  tokenBtn: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a2e',
  },
  tokenBtnActive: {
    borderColor: '#14F195',
    backgroundColor: '#1a3a2e',
  },
  tokenBtnText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  tokenBtnTextActive: {
    color: '#14F195',
  },
  balancesBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center',
  },
  balanceTokenLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 2,
  },
  balanceTokenValue: {
    color: '#14F195',
    fontSize: 13,
    fontWeight: '600',
  },
  statusBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  statusItem: {
    flex: 1,
    alignItems: 'center',
  },
  statusLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  statusValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  timerCard: {
    marginHorizontal: 20,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#14F195',
  },
  timerLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  timerPair: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  timerAmount: {
    color: '#14F195',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  timerCountdown: {
    color: '#9945FF',
    fontSize: 36,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  timerSlippage: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  swapItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#333',
  },
  swapItemActive: {
    borderLeftColor: '#9945FF',
    backgroundColor: '#1a1a2e',
  },
  swapItemCompleted: {
    borderLeftColor: '#14F195',
    opacity: 0.7,
  },
  swapItemFailed: {
    borderLeftColor: '#ff4444',
    opacity: 0.7,
  },
  swapItemTimeout: {
    borderLeftColor: '#FF8C00',
    opacity: 0.7,
  },
  swapItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  swapIndex: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
    width: 28,
  },
  swapPair: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  swapDetail: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  swapItemRight: {
    alignItems: 'flex-end',
  },
  swapStatus: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
  },
  statusCompleted: {
    color: '#14F195',
  },
  statusFailed: {
    color: '#ff4444',
  },
  statusExecuting: {
    color: '#9945FF',
  },
  statusConfirming: {
    color: '#FFA500',
  },
  statusTimeout: {
    color: '#FF8C00',
  },
  txSignatureText: {
    color: '#555',
    fontSize: 10,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  footer: {
    padding: 20,
    paddingBottom: 32,
  },
  startBtn: {
    backgroundColor: '#14F195',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  startBtnText: {
    color: '#0a0a0a',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stopBtn: {
    backgroundColor: '#ff4444',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  stopBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
