import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKENS, PLATFORM_FEE_ACCOUNT, RPC_ENDPOINT } from '../constants/tokens';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
const FEE_WALLET = new PublicKey(PLATFORM_FEE_ACCOUNT);

function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.alloc(0),
  });
}

export interface AtaStatus {
  token: string;
  mint: string;
  ataAddress: string;
  exists: boolean;
}

export async function checkFeeWalletATAs(): Promise<AtaStatus[]> {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const results: AtaStatus[] = [];

  // All output tokens need ATAs, including wrapped SOL for SOL-output swaps
  const tokensToCheck = ['SOL', 'USDC', 'USDT', 'SKR'];

  for (const symbol of tokensToCheck) {
    const tokenInfo = TOKENS[symbol];
    if (!tokenInfo) continue;

    const ataAddress = getAssociatedTokenAddress(FEE_WALLET, tokenInfo.mint);

    let exists = false;
    try {
      const accountInfo = await connection.getAccountInfo(ataAddress);
      exists = accountInfo !== null;
    } catch {
      exists = false;
    }

    results.push({
      token: symbol,
      mint: tokenInfo.mint.toBase58(),
      ataAddress: ataAddress.toBase58(),
      exists,
    });
  }

  return results;
}

export async function createMissingATAs(
  payerPublicKey: PublicKey,
  signAndSend: (tx: never) => Promise<string>,
): Promise<{ created: string[]; alreadyExist: string[]; errors: string[] }> {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const statuses = await checkFeeWalletATAs();

  const missing = statuses.filter((s) => !s.exists);
  const alreadyExist = statuses.filter((s) => s.exists).map((s) => s.token);

  if (missing.length === 0) {
    return { created: [], alreadyExist, errors: [] };
  }

  const created: string[] = [];
  const errors: string[] = [];

  // Create one transaction with all missing ATAs
  const tx = new Transaction();

  for (const ata of missing) {
    const mint = new PublicKey(ata.mint);
    const ataAddress = new PublicKey(ata.ataAddress);
    tx.add(
      createAssociatedTokenAccountInstruction(payerPublicKey, ataAddress, FEE_WALLET, mint),
    );
  }

  try {
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = payerPublicKey;

    const signature = await signAndSend(tx as never);

    // Wait for confirmation
    const start = Date.now();
    while (Date.now() - start < 60000) {
      const status = await connection.getSignatureStatus(signature);
      if (status.value?.confirmationStatus === 'confirmed' ||
          status.value?.confirmationStatus === 'finalized') {
        if (!status.value.err) {
          for (const ata of missing) {
            created.push(ata.token);
          }
        } else {
          errors.push(`Transaction error: ${JSON.stringify(status.value.err)}`);
        }
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (created.length === 0 && errors.length === 0) {
      errors.push('Transaction confirmation timeout');
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { created, alreadyExist, errors };
}
