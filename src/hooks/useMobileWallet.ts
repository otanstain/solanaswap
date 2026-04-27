import { useCallback, useMemo } from 'react';
import {
  transact,
  Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { RPC_ENDPOINT } from '../constants/tokens';
import { useAuthorization, APP_IDENTITY } from './useAuthorization';
import { toUint8Array } from 'js-base64';
import { PublicKey } from '@solana/web3.js';

export function useMobileWallet() {
  const {
    publicKey,
    authToken,
    isAuthorized,
    authorizeSession,
    deauthorizeSession,
  } = useAuthorization();

  const connection = useMemo(() => new Connection(RPC_ENDPOINT, 'confirmed'), []);

  const connect = useCallback(async () => {
    return await transact(async (wallet: Web3MobileWallet) => {
      const result = await authorizeSession(wallet as never);
      return result;
    });
  }, [authorizeSession]);

  const disconnect = useCallback(async () => {
    return await transact(async (wallet: Web3MobileWallet) => {
      await deauthorizeSession(wallet as never);
    });
  }, [deauthorizeSession]);

  const signAndSendTransaction = useCallback(
    async (transaction: Transaction | VersionedTransaction) => {
      return await transact(async (wallet: Web3MobileWallet) => {
        // Re-authorize to get fresh session
        const authResult = await wallet.authorize({
          identity: APP_IDENTITY,
          chain: 'solana:mainnet',
        });

        const firstAccount = authResult.accounts[0];
        const pubkeyBytes = toUint8Array(firstAccount.address);
        const _pubkey = new PublicKey(pubkeyBytes);

        if (transaction instanceof Transaction) {
          const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = _pubkey;

          const signedTxs = await wallet.signAndSendTransactions({
            transactions: [transaction],
          });

          return signedTxs[0];
        } else {
          const signedTxs = await wallet.signAndSendTransactions({
            transactions: [transaction],
          });

          return signedTxs[0];
        }
      });
    },
    [connection],
  );

  const signTransaction = useCallback(
    async (transaction: Transaction) => {
      return await transact(async (wallet: Web3MobileWallet) => {
        await wallet.authorize({
          identity: APP_IDENTITY,
          chain: 'solana:mainnet',
        });

        const signedTxs = await wallet.signTransactions({
          transactions: [transaction],
        });

        return signedTxs[0];
      });
    },
    [],
  );

  return {
    publicKey,
    authToken,
    isAuthorized,
    connection,
    connect,
    disconnect,
    signAndSendTransaction,
    signTransaction,
  };
}
