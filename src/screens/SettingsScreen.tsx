import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { AppSettings } from '../types';
import { loadSettings, saveSettings, clearAllData } from '../services/storage';
import {
  MIN_SWAPS_PER_DAY,
  MAX_SWAPS_PER_DAY,
  TOKENS,
} from '../constants/tokens';

const FROM_TOKEN_OPTIONS = ['ALL', ...Object.keys(TOKENS)];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>({
    swapsPerDay: 50,
    dailyBudgetUsd: 100,
    enableNotifications: true,
    enableBackgroundSwaps: false,
    preferredFromToken: 'ALL',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

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
});
