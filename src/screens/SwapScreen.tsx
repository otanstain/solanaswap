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
import { createSession, runSwapSession, abortSession } from '../services/swapEngine';
import { loadSettings } from '../services/storage';
import { formatDuration, formatUsd, formatSol } from '../utils/randomizer';
import {
  scheduleNextSwapNotification,
  sendSwapCompletedNotification,
  sendSessionCompleteNotification,
  cancelAllNotifications,
  requestNotificationPermissions,
} from '../services/notifications';

export default function SwapScreen() {
  const {
    publicKey,
    isAuthorized,
    connect,
    signAndSendTransaction,
    connection,
  } = useMobileWallet();

  const [session, setSession] = useState<SessionState | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

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

  const handleStartSession = useCallback(async () => {
    if (!publicKey || !settings) return;

    await requestNotificationPermissions();
    await cancelAllNotifications();

    const newSession = createSession(settings.swapsPerDay, settings.preferredFromToken);
    setSession(newSession);

    await runSwapSession(
      newSession,
      publicKey,
      signAndSendTransaction as never,
      (updated) => {
        setSession({ ...updated });
      },
      async (task: SwapTask, result) => {
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

        // Schedule notification for next swap
        const nextIdx = newSession.currentSwapIndex + 1;
        if (nextIdx < newSession.swapQueue.length && settings.enableNotifications) {
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
  }, [publicKey, settings, signAndSendTransaction]);

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
              item.status === 'executing' && styles.statusExecuting,
            ]}
          >
            {item.status === 'pending'
              ? 'Pending'
              : item.status === 'executing'
              ? 'Signing...'
              : item.status === 'completed'
              ? 'Done'
              : 'Failed'}
          </Text>
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
        <Text style={styles.walletAddress}>
          {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
        </Text>
      </View>

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

      {/* Next Swap Timer */}
      {session?.isActive && currentSwap && (
        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>Next Swap</Text>
          <Text style={styles.timerPair}>
            {currentSwap.fromToken} → {currentSwap.toToken}
          </Text>
          <Text style={styles.timerAmount}>
            {formatUsd(currentSwap.amountUsd)}
          </Text>
          <Text style={styles.timerCountdown}>{countdown}</Text>
          <Text style={styles.timerSlippage}>
            Slippage: {(currentSwap.slippageBps / 100).toFixed(1)}%
          </Text>
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
  walletAddress: {
    color: '#14F195',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
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
