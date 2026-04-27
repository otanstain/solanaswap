import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { AppSettings } from '../types';
import { loadSettings, saveSettings, clearAllData } from '../services/storage';
import {
  MIN_SWAPS_PER_DAY,
  MAX_SWAPS_PER_DAY,
  TOKENS,
  PLATFORM_FEE_ACCOUNT,
} from '../constants/tokens';
import { useMobileWallet } from '../hooks/useMobileWallet';
import { checkFeeWalletATAs, createMissingATAs, AtaStatus } from '../services/ataSetup';

const FROM_TOKEN_OPTIONS = ['ALL', ...Object.keys(TOKENS)];

export default function SettingsScreen() {
  const { publicKey, isAuthorized, signAndSendTransaction } = useMobileWallet();

  const [settings, setSettings] = useState<AppSettings>({
    swapsPerDay: 50,
    dailyBudgetUsd: 100,
    enableNotifications: true,
    enableBackgroundSwaps: false,
    preferredFromToken: 'ALL',
    delayMinMinutes: 2,
    delayMaxMinutes: 8,
    sessionDurationHours: 8,
  });
  const [saved, setSaved] = useState(false);
  const [ataStatuses, setAtaStatuses] = useState<AtaStatus[]>([]);
  const [ataLoading, setAtaLoading] = useState(false);
  const [ataCreating, setAtaCreating] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const handleCheckATAs = useCallback(async () => {
    setAtaLoading(true);
    try {
      const statuses = await checkFeeWalletATAs();
      setAtaStatuses(statuses);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to check ATAs');
    } finally {
      setAtaLoading(false);
    }
  }, []);

  const handleCreateATAs = useCallback(async () => {
    if (!publicKey || !isAuthorized) {
      Alert.alert('Not Connected', 'Connect wallet on Swap screen first');
      return;
    }
    setAtaCreating(true);
    try {
      const result = await createMissingATAs(publicKey, signAndSendTransaction as never);
      if (result.created.length > 0) {
        Alert.alert('ATAs Created', `Created: ${result.created.join(', ')}`);
      }
      if (result.errors.length > 0) {
        Alert.alert('ATA Errors', result.errors.join('\n'));
      }
      if (result.created.length === 0 && result.errors.length === 0) {
        Alert.alert('All ATAs Exist', 'All fee token accounts already exist');
      }
      await handleCheckATAs();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create ATAs');
    } finally {
      setAtaCreating(false);
    }
  }, [publicKey, isAuthorized, signAndSendTransaction, handleCheckATAs]);

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [settings]);

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset All Data',
      'This will clear all settings and statistics. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            const fresh = await loadSettings();
            setSettings(fresh);
          },
        },
      ],
    );
  }, []);

  const adjustSwaps = useCallback(
    (delta: number) => {
      const newVal = Math.max(
        MIN_SWAPS_PER_DAY,
        Math.min(MAX_SWAPS_PER_DAY, settings.swapsPerDay + delta),
      );
      updateSetting('swapsPerDay', newVal);
    },
    [settings.swapsPerDay, updateSetting],
  );

  const adjustBudget = useCallback(
    (delta: number) => {
      const newVal = Math.max(10, Math.min(1000, settings.dailyBudgetUsd + delta));
      updateSetting('dailyBudgetUsd', newVal);
    },
    [settings.dailyBudgetUsd, updateSetting],
  );

  const adjustDelayMin = useCallback(
    (delta: number) => {
      const newVal = Math.max(0.5, Math.min(settings.delayMaxMinutes - 0.5, settings.delayMinMinutes + delta));
      updateSetting('delayMinMinutes', Math.round(newVal * 10) / 10);
    },
    [settings.delayMinMinutes, settings.delayMaxMinutes, updateSetting],
  );

  const adjustDelayMax = useCallback(
    (delta: number) => {
      const newVal = Math.max(settings.delayMinMinutes + 0.5, Math.min(60, settings.delayMaxMinutes + delta));
      updateSetting('delayMaxMinutes', Math.round(newVal * 10) / 10);
    },
    [settings.delayMaxMinutes, settings.delayMinMinutes, updateSetting],
  );

  const adjustSessionDuration = useCallback(
    (delta: number) => {
      const newVal = Math.max(1, Math.min(24, settings.sessionDurationHours + delta));
      updateSetting('sessionDurationHours', newVal);
    },
    [settings.sessionDurationHours, updateSetting],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      {/* Swaps Per Day */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Swaps Per Day</Text>
        <Text style={styles.cardSubtitle}>
          {MIN_SWAPS_PER_DAY}–{MAX_SWAPS_PER_DAY} swaps
        </Text>
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustSwaps(-5)}>
            <Text style={styles.stepBtnText}>-5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustSwaps(-1)}>
            <Text style={styles.stepBtnText}>-1</Text>
          </TouchableOpacity>
          <Text style={styles.stepValue}>{settings.swapsPerDay}</Text>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustSwaps(1)}>
            <Text style={styles.stepBtnText}>+1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustSwaps(5)}>
            <Text style={styles.stepBtnText}>+5</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Daily Budget */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Budget</Text>
        <Text style={styles.cardSubtitle}>Maximum USD to spend per session</Text>
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustBudget(-25)}>
            <Text style={styles.stepBtnText}>-25</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustBudget(-5)}>
            <Text style={styles.stepBtnText}>-5</Text>
          </TouchableOpacity>
          <Text style={styles.stepValue}>${settings.dailyBudgetUsd}</Text>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustBudget(5)}>
            <Text style={styles.stepBtnText}>+5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustBudget(25)}>
            <Text style={styles.stepBtnText}>+25</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Delay Between Swaps */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Delay Between Swaps</Text>
        <Text style={styles.cardSubtitle}>Random delay range (minutes)</Text>
        <View style={styles.delayRow}>
          <View style={styles.delayCol}>
            <Text style={styles.delayLabel}>Min</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => adjustDelayMin(-1)}>
                <Text style={styles.stepBtnText}>-1</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{settings.delayMinMinutes}m</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => adjustDelayMin(1)}>
                <Text style={styles.stepBtnText}>+1</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.delayCol}>
            <Text style={styles.delayLabel}>Max</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => adjustDelayMax(-1)}>
                <Text style={styles.stepBtnText}>-1</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{settings.delayMaxMinutes}m</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => adjustDelayMax(1)}>
                <Text style={styles.stepBtnText}>+1</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Session Duration */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session Duration</Text>
        <Text style={styles.cardSubtitle}>Total time for all swaps (hours)</Text>
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustSessionDuration(-1)}>
            <Text style={styles.stepBtnText}>-1</Text>
          </TouchableOpacity>
          <Text style={styles.stepValue}>{settings.sessionDurationHours}h</Text>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustSessionDuration(1)}>
            <Text style={styles.stepBtnText}>+1</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Preferred From Token */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Swap From Token</Text>
        <Text style={styles.cardSubtitle}>
          Choose which token to swap from (ALL = random pairs)
        </Text>
        <View style={styles.tokenSelector}>
          {FROM_TOKEN_OPTIONS.map((token) => (
            <TouchableOpacity
              key={token}
              style={[
                styles.tokenBtn,
                settings.preferredFromToken === token && styles.tokenBtnActive,
              ]}
              onPress={() => updateSetting('preferredFromToken', token)}
            >
              <Text
                style={[
                  styles.tokenBtnText,
                  settings.preferredFromToken === token && styles.tokenBtnTextActive,
                ]}
              >
                {token}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Notifications */}
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.cardTitle}>Notifications</Text>
            <Text style={styles.cardSubtitle}>Alert before each swap</Text>
          </View>
          <Switch
            value={settings.enableNotifications}
            onValueChange={(v) => updateSetting('enableNotifications', v)}
            trackColor={{ false: '#3a3a3a', true: '#14F195' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Background Swaps */}
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.cardTitle}>Background Mode</Text>
            <Text style={styles.cardSubtitle}>
              Keep session alive in background
            </Text>
          </View>
          <Switch
            value={settings.enableBackgroundSwaps}
            onValueChange={(v) => updateSetting('enableBackgroundSwaps', v)}
            trackColor={{ false: '#3a3a3a', true: '#14F195' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Fee Account ATA Setup */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Fee Account Setup</Text>
        <Text style={styles.cardSubtitle}>
          Create token accounts on fee wallet to collect swap commissions
        </Text>
        <Text style={styles.feeWalletText}>
          {PLATFORM_FEE_ACCOUNT.slice(0, 8)}...{PLATFORM_FEE_ACCOUNT.slice(-8)}
        </Text>

        {ataStatuses.length > 0 && (
          <View style={styles.ataList}>
            {ataStatuses.map((ata) => (
              <View key={ata.token} style={styles.ataRow}>
                <Text style={styles.ataToken}>{ata.token}</Text>
                <Text style={[
                  styles.ataStatus,
                  ata.exists ? styles.ataExists : styles.ataMissing,
                ]}>
                  {ata.exists ? 'Active' : 'Not Created'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.ataButtons}>
          <TouchableOpacity
            style={styles.ataCheckBtn}
            onPress={handleCheckATAs}
            disabled={ataLoading}
          >
            {ataLoading ? (
              <ActivityIndicator color="#14F195" size="small" />
            ) : (
              <Text style={styles.ataCheckBtnText}>Check Status</Text>
            )}
          </TouchableOpacity>

          {ataStatuses.some((a) => !a.exists) && (
            <TouchableOpacity
              style={styles.ataCreateBtn}
              onPress={handleCreateATAs}
              disabled={ataCreating}
            >
              {ataCreating ? (
                <ActivityIndicator color="#0a0a0a" size="small" />
              ) : (
                <Text style={styles.ataCreateBtnText}>Create Missing ATAs</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveBtn, saved && styles.savedBtn]}
        onPress={handleSave}
      >
        <Text style={styles.saveBtnText}>
          {saved ? 'Saved!' : 'Save Settings'}
        </Text>
      </TouchableOpacity>

      {/* Reset */}
      <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
        <Text style={styles.resetBtnText}>Reset All Data</Text>
      </TouchableOpacity>
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
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stepBtn: {
    backgroundColor: '#2a2a4a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stepBtnText: {
    color: '#14F195',
    fontSize: 16,
    fontWeight: '600',
  },
  stepValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    minWidth: 60,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: '#14F195',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  savedBtn: {
    backgroundColor: '#0f9d6e',
  },
  saveBtnText: {
    color: '#0a0a0a',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resetBtn: {
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  resetBtnText: {
    color: '#ff4444',
    fontSize: 14,
  },
  tokenSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tokenBtn: {
    backgroundColor: '#2a2a4a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  tokenBtnActive: {
    borderColor: '#14F195',
    backgroundColor: '#1a3a2e',
  },
  tokenBtnText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  tokenBtnTextActive: {
    color: '#14F195',
  },
  delayRow: {
    flexDirection: 'row',
    gap: 16,
  },
  delayCol: {
    flex: 1,
    alignItems: 'center',
  },
  delayLabel: {
    color: '#888',
    fontSize: 13,
    marginBottom: 8,
  },
  feeWalletText: {
    color: '#555',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  ataList: {
    marginBottom: 12,
  },
  ataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4a',
  },
  ataToken: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  ataStatus: {
    fontSize: 13,
    fontWeight: '500',
  },
  ataExists: {
    color: '#14F195',
  },
  ataMissing: {
    color: '#ff4444',
  },
  ataButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  ataCheckBtn: {
    flex: 1,
    backgroundColor: '#2a2a4a',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  ataCheckBtnText: {
    color: '#14F195',
    fontSize: 14,
    fontWeight: '600',
  },
  ataCreateBtn: {
    flex: 1,
    backgroundColor: '#14F195',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  ataCreateBtnText: {
    color: '#0a0a0a',
    fontSize: 14,
    fontWeight: '600',
  },
});
