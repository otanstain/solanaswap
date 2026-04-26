import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SwapStats } from '../types';
import { loadStats } from '../services/storage';
import { formatSol } from '../utils/randomizer';

export default function StatsScreen() {
  const [stats, setStats] = useState<SwapStats>({
    totalSwapsAllTime: 0,
    totalGasAllTime: 0,
    totalVolumeUsd: 0,
    sessionsCompleted: 0,
    lastSessionDate: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const loaded = await loadStats();
    setStats(loaded);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#14F195" />
      }
    >
      <Text style={styles.title}>Statistics</Text>

      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalSwapsAllTime}</Text>
          <Text style={styles.statLabel}>Total Swaps</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.sessionsCompleted}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>

        <View style={[styles.statCard, styles.wideCard]}>
          <Text style={styles.statValue}>
            ${stats.totalVolumeUsd.toFixed(2)}
          </Text>
          <Text style={styles.statLabel}>Total Volume (USD)</Text>
        </View>

        <View style={[styles.statCard, styles.wideCard]}>
          <Text style={styles.statValue}>
            {formatSol(stats.totalGasAllTime)}
          </Text>
          <Text style={styles.statLabel}>Total Gas Spent</Text>
        </View>

        <View style={[styles.statCard, styles.wideCard]}>
          <Text style={styles.statValue}>
            {stats.lastSessionDate ?? 'Never'}
          </Text>
          <Text style={styles.statLabel}>Last Session</Text>
        </View>
      </View>

      {stats.totalSwapsAllTime > 0 && (
        <View style={styles.avgCard}>
          <Text style={styles.avgTitle}>Averages</Text>
          <View style={styles.avgRow}>
            <Text style={styles.avgLabel}>Avg Volume / Swap</Text>
            <Text style={styles.avgValue}>
              ${(stats.totalVolumeUsd / stats.totalSwapsAllTime).toFixed(2)}
            </Text>
          </View>
          <View style={styles.avgRow}>
            <Text style={styles.avgLabel}>Avg Gas / Swap</Text>
            <Text style={styles.avgValue}>
              {formatSol(
                Math.round(stats.totalGasAllTime / stats.totalSwapsAllTime),
              )}
            </Text>
          </View>
          {stats.sessionsCompleted > 0 && (
            <View style={styles.avgRow}>
              <Text style={styles.avgLabel}>Avg Swaps / Session</Text>
              <Text style={styles.avgValue}>
                {Math.round(stats.totalSwapsAllTime / stats.sessionsCompleted)}
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    width: '47%',
    alignItems: 'center',
  },
  wideCard: {
    width: '100%',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#14F195',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#888',
  },
  avgCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
  },
  avgTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  avgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  avgLabel: {
    color: '#888',
    fontSize: 14,
  },
  avgValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
