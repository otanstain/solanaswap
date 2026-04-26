import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useMobileWallet } from '../hooks/useMobileWallet';
import { TOKENS } from '../constants/tokens';
import { getQuote, getSwapTransaction } from '../services/jupiter';

export default function StakeScreen() {
  const { publicKey, isAuthorized, connect, signAndSendTransaction, connection } =
    useMobileWallet();

  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [scrBalance, setScrBalance] = useState<number | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!publicKey) return;

    try {
      const sol = await connection.getBalance(publicKey);
      setSolBalance(sol / LAMPORTS_PER_SOL);

      // Get SKR token balance
      const scrMint = TOKENS.SKR.mint;
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: scrMint,
      });

      if (tokenAccounts.value.length > 0) {
        const balance =
          tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        setScrBalance(balance);
      } else {
        setScrBalance(0);
      }
    } catch (err) {
      console.warn('Failed to fetch balances:', err);
    }
  }, [publicKey, connection]);

  const handleConnect = useCallback(async () => {
    try {
      await connect();
    } catch (err) {
      Alert.alert('Connection Failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [connect]);

  const handleBuySKR = useCallback(async () => {
    if (!publicKey || !amount) return;

    const solAmount = parseFloat(amount);
    if (isNaN(solAmount) || solAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid SOL amount');
      return;
    }

    setLoading(true);
    try {
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

      const quote = await getQuote('SOL', 'SKR', lamports, 100);
      const swapTx = await getSwapTransaction(quote, publicKey.toBase58());

      const signature = await signAndSendTransaction(swapTx);
      Alert.alert('Success', `Bought SKR!\nTx: ${String(signature).slice(0, 20)}...`);

      setAmount('');
      fetchBalances();
    } catch (err) {
      Alert.alert('Swap Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [publicKey, amount, signAndSendTransaction, fetchBalances]);

  React.useEffect(() => {
    if (isAuthorized) {
      fetchBalances();
    }
  }, [isAuthorized, fetchBalances]);

  if (!isAuthorized) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.title}>SKR Staking</Text>
          <Text style={styles.subtitle}>Connect wallet to manage SKR</Text>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <Text style={styles.connectBtnText}>Connect Wallet</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>SKR Token</Text>

      {/* Balances */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>SOL Balance</Text>
          <Text style={styles.balanceValue}>
            {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : '...'}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>SKR Balance</Text>
          <Text style={styles.balanceValue}>
            {scrBalance !== null ? `${scrBalance.toFixed(2)} SKR` : '...'}
          </Text>
        </View>
      </View>

      {/* Buy SKR */}
      <View style={styles.actionCard}>
        <Text style={styles.cardTitle}>Buy SKR with SOL</Text>
        <TextInput
          style={styles.input}
          placeholder="Amount in SOL"
          placeholderTextColor="#555"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
        <TouchableOpacity
          style={[styles.buyBtn, loading && styles.buyBtnDisabled]}
          onPress={handleBuySKR}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={styles.buyBtnText}>Buy SKR</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Refresh */}
      <TouchableOpacity style={styles.refreshBtn} onPress={fetchBalances}>
        <Text style={styles.refreshBtnText}>Refresh Balances</Text>
      </TouchableOpacity>

      {/* Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>About SKR Staking</Text>
        <Text style={styles.infoText}>
          SKR is the Seeker token. Staking SKR helps secure the network and earn
          rewards. Use this screen to buy SKR tokens with SOL via Jupiter.
        </Text>
        <Text style={styles.infoText}>
          For full staking functionality, visit the official Seeker staking portal.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
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
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 8,
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
  balanceCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  balanceLabel: {
    color: '#888',
    fontSize: 16,
  },
  balanceValue: {
    color: '#14F195',
    fontSize: 18,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#2a2a4a',
    marginVertical: 4,
  },
  actionCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  buyBtn: {
    backgroundColor: '#9945FF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buyBtnDisabled: {
    opacity: 0.6,
  },
  buyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  refreshBtn: {
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  refreshBtnText: {
    color: '#14F195',
    fontSize: 14,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoText: {
    color: '#888',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
});
