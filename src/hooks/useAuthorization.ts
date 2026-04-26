import { useState, useCallback, useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { toUint8Array } from 'js-base64';

export const APP_IDENTITY = {
  name: 'Seeker Auto-Swap',
  uri: 'https://seeker-auto-swap.app',
  icon: 'favicon.ico',
};

export interface AuthorizationResult {
  publicKey: PublicKey;
  authToken: string;
  label?: string;
}

export interface Authorization {
  publicKey: PublicKey | null;
  authToken: string | null;
  isAuthorized: boolean;
  authorizeSession: (wallet: {
    authorize: (params: {
      identity: typeof APP_IDENTITY;
      chain: string;
    }) => Promise<{
      accounts: Array<{ address: string; label?: string }>;
      auth_token: string;
    }>;
    deauthorize: (params: { auth_token: string }) => Promise<void>;
  }) => Promise<AuthorizationResult>;
  deauthorizeSession: (wallet: {
    deauthorize: (params: { auth_token: string }) => Promise<void>;
  }) => Promise<void>;
  onChangeAccount: (nextPubKey: PublicKey | null) => void;
}

export function useAuthorization(): Authorization {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentPublicKey, setCurrentPublicKey] = useState<PublicKey | null>(null);

  const isAuthorized = useMemo(() => currentPublicKey !== null, [currentPublicKey]);

  const authorizeSession = useCallback(
    async (wallet: {
      authorize: (params: {
        identity: typeof APP_IDENTITY;
        chain: string;
      }) => Promise<{
        accounts: Array<{ address: string; label?: string }>;
        auth_token: string;
      }>;
    }): Promise<AuthorizationResult> => {
      const authResult = await wallet.authorize({
        identity: APP_IDENTITY,
        chain: 'solana:mainnet',
      });

      const firstAccount = authResult.accounts[0];
      const pubkeyBytes = toUint8Array(firstAccount.address);
      const pubkey = new PublicKey(pubkeyBytes);

      setAuthToken(authResult.auth_token);
      setCurrentPublicKey(pubkey);

      return {
        publicKey: pubkey,
        authToken: authResult.auth_token,
        label: firstAccount.label,
      };
    },
    [],
  );

  const deauthorizeSession = useCallback(
    async (wallet: {
      deauthorize: (params: { auth_token: string }) => Promise<void>;
    }): Promise<void> => {
      if (authToken) {
        await wallet.deauthorize({ auth_token: authToken });
        setAuthToken(null);
        setCurrentPublicKey(null);
      }
    },
    [authToken],
  );

  const onChangeAccount = useCallback((nextPubKey: PublicKey | null) => {
    setCurrentPublicKey(nextPubKey);
  }, []);

  return {
    publicKey: currentPublicKey,
    authToken,
    isAuthorized,
    authorizeSession,
    deauthorizeSession,
    onChangeAccount,
  };
}
