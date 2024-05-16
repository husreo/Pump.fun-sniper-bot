import { PublicKey, TransactionInstruction, VersionedTransaction, ComputeBudgetProgram, TransactionMessage, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction,getAssociatedTokenAddress } from '@solana/spl-token';
import { connection, payerKeypair } from './config';
import { getCoinData } from "./utils"
import {
  GLOBAL,
  FEE_RECIPIENT,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  RENT,
  PUMP_FUN_ACCOUNT,
  PUMP_FUN_PROGRAM,
  UNIT_PRICE,
  UNIT_BUDGET
} from './constants';
import { bundle } from './executor/jito';



async function buy(
  mintStr: string, solIn: number = 0.01, slippageDecimal: number = 0.25
): Promise<void> {
  try {
    // Get coin data
    const coinData = await getCoinData(mintStr);
    console.log("🚀 ~ coinData:", coinData)

    if (!coinData) {
      console.log("Failed to retrieve coin data...");
      return;
    }

    const owner = payerKeypair.publicKey;
    const mint = new PublicKey(mintStr);
    let tokenAccount: PublicKey;
    let ixs: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: UNIT_PRICE }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: UNIT_BUDGET }),
    ];

    // Attempt to retrieve token account, otherwise create associated token account
    try {
      tokenAccount = await getAssociatedTokenAddress(mint, payerKeypair.publicKey)
      const info = await connection.getAccountInfo(tokenAccount)
      if (!info) {
        ixs.push(
          createAssociatedTokenAccountInstruction(
            payerKeypair.publicKey,
            tokenAccount,
            payerKeypair.publicKey,
            mint
          )
        )
      }
    } catch (e) {
      console.log("It should not happen")
      console.log("🚀 ~ e:", e)
      return
    }


    // Calculate tokens out
    const virtualSolReserves = coinData.virtual_sol_reserves;
    const virtualTokenReserves = coinData.virtual_token_reserves;
    const solInLamports = solIn * LAMPORTS_PER_SOL;
    const tokenOut = Math.round(solInLamports * virtualTokenReserves / virtualSolReserves);

    // Calculate max_sol_cost and amount
    const solInWithSlippage = solIn * (1 + slippageDecimal);
    const maxSolCost = Math.round(solInWithSlippage * LAMPORTS_PER_SOL);

    // Define account keys required for the swap
    const MINT = new PublicKey(coinData.mint);
    const BONDING_CURVE = new PublicKey(coinData.bonding_curve);
    const ASSOCIATED_BONDING_CURVE = new PublicKey(coinData.associated_bonding_curve);
    const ASSOCIATED_USER = tokenAccount;
    const USER = owner;

    // Build account key list
    const keys = [
      { pubkey: GLOBAL, isSigner: false, isWritable: false },
      { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: BONDING_CURVE, isSigner: false, isWritable: true },
      { pubkey: ASSOCIATED_BONDING_CURVE, isSigner: false, isWritable: true },
      { pubkey: ASSOCIATED_USER, isSigner: false, isWritable: true },
      { pubkey: USER, isSigner: true, isWritable: true },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: RENT, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_ACCOUNT, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false }
    ];

    // Define integer values
    const buy = BigInt('16927863322537952870');
    const integers = [buy, BigInt(tokenOut), BigInt(maxSolCost)];

    // Pack integers into binary segments
    const binarySegments = integers.map(integer => {
      // struct.pack('<Q', integer)
      const buf = Buffer.alloc(8);
      buf.writeBigInt64LE(integer, 0)
      return buf
    });
    const data: Buffer = Buffer.concat(binarySegments);

    const swapInstruction = new TransactionInstruction({
      keys: keys,
      programId: PUMP_FUN_PROGRAM,
      data: data
    })

    ixs.push(swapInstruction)
    const blockhash = (await connection.getLatestBlockhash()).blockhash

    // Compile message
    const messageV0 = new TransactionMessage({
      payerKey: payerKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message()

    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([payerKeypair])
    console.log("distribute")
    await bundle([transaction], payerKeypair)
  } catch (e) {
    console.error(e);
  }
}


buy("5B2mGsd7C14jJZMHNWR7nrno6bdPGBSNxJvfjFr75Ptb", 0.001, 0.5);

