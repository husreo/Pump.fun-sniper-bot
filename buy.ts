import { PublicKey, TransactionInstruction, VersionedTransaction, ComputeBudgetProgram, TransactionMessage, LAMPORTS_PER_SOL, Connection, Version, Keypair, Transaction } from '@solana/web3.js';
import { NATIVE_MINT, createAssociatedTokenAccountInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import { connection, deployerPubkey, payerKeypair, mint, totalPercent, initialSolAmount, initialTokenAmount, privateKeys, distributionPerWallet, tokenDecimal } from './config';
import { generateDistribution, getCoinData, saveDataToFile, sleep } from "./utils"
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
import base58 from 'bs58';
import { sendBulkToken } from './sendBulk';


async function buy(
  keypairs: string[],
  mintStr: string,
  solIns: number[],
  slippageDecimal: number = 0.5
): Promise<void> {
  try {
    const transactions: VersionedTransaction[] = []

    console.log("Payer wallet public key is", payerKeypair.publicKey.toBase58())
    // Get coin data
    const coinData = await getCoinData(mintStr);

    if (!coinData) {
      console.log("Failed to retrieve coin data...");
      return;
    }

    for (let i = 0; i < solIns.length; i++) {
      const buyer = Keypair.fromSecretKey(base58.decode(keypairs[i]))
      const owner = buyer.publicKey;
      const tokenMint = new PublicKey(mintStr);
      let tokenAccount: PublicKey;
      let ixs: TransactionInstruction[] = [
        // ComputeBudgetProgram.setComputeUnitPrice({ microLamports: UNIT_PRICE }),
        // ComputeBudgetProgram.setComputeUnitLimit({ units: UNIT_BUDGET })
      ];

      // Attempt to retrieve token account, otherwise create associated token account
      try {
        tokenAccount = await getAssociatedTokenAddress(tokenMint, buyer.publicKey)
        const info = await connection.getAccountInfo(tokenAccount)
        if (!info) {
          ixs.push(
            createAssociatedTokenAccountInstruction(
              buyer.publicKey,
              tokenAccount,
              buyer.publicKey,
              tokenMint
            )
          )
        }
      } catch (e) {
        console.log("It should not happen")
        return
      }

      // Calculate tokens out
      const virtualSolReserves = coinData.virtual_sol_reserves;
      const virtualTokenReserves = coinData.virtual_token_reserves;
      const solIn = solIns[i]

      const solInLamports = solIn * LAMPORTS_PER_SOL;
      const tokenOut = Math.round(solInLamports * virtualTokenReserves / virtualSolReserves);

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

      function calc_slippage_up(sol_amount: number, slippage: number): number {
        const lamports = sol_amount * LAMPORTS_PER_SOL;
        return Math.round(lamports * (1 + slippage) + lamports * (1 + slippage) / 1000);
      }

      const instruction_buf = Buffer.from('66063d1201daebea', 'hex');
      const token_amount_buf = Buffer.alloc(8);
      token_amount_buf.writeBigUInt64LE(BigInt(tokenOut), 0);
      const slippage_buf = Buffer.alloc(8);
      slippage_buf.writeBigUInt64LE(BigInt(calc_slippage_up(solInLamports, slippageDecimal)), 0);
      const data = Buffer.concat([instruction_buf, token_amount_buf, slippage_buf]);

      const swapInstruction = new TransactionInstruction({
        keys: keys,
        programId: PUMP_FUN_PROGRAM,
        data: data
      })

      ixs.push(swapInstruction)
      const blockhash = (await connection.getLatestBlockhash()).blockhash

      const tx = new Transaction().add(...ixs)
      tx.recentBlockhash = blockhash
      tx.feePayer = buyer.publicKey
      console.log(await connection.simulateTransaction(tx))
      // Compile message
      const messageV0 = new TransactionMessage({
        payerKey: buyer.publicKey,
        recentBlockhash: blockhash,
        instructions: ixs,
      }).compileToV0Message()

      const transaction = new VersionedTransaction(messageV0)
      transaction.sign([buyer])
      transactions.push(transaction)
    }
    await bundle(transactions, payerKeypair)



    console.log("bundling is done")
    let index = 0
    const tokenMint = new PublicKey(mint)
    const kp = Keypair.fromSecretKey(base58.decode(keypairs[0]))
    const ata = await getAssociatedTokenAddress(tokenMint, kp.publicKey)
    console.log("Checking the result")
    while (true) {
      if (index > 30) {
        console.log("token sniping failed")
        return
      }
      try {
        const tokenBalance = (await connection.getTokenAccountBalance(ata)).value.uiAmount
        if(tokenBalance && tokenBalance > 0)
          break
      } catch (error) {
        index++
        await sleep(2000)
      }
    }
    
    for(let i = 0; i < keypairs.length; i++){
      const kpsToSend: Keypair[] = []
      for (let j = 0; j < distributionPerWallet; j++)
        kpsToSend.push(Keypair.generate())
      saveDataToFile(kpsToSend.map(kp => base58.encode(kp.secretKey)), `data${i}.json`)
      const mainKp = Keypair.fromSecretKey(base58.decode(keypairs[i])) 
      const ata = await getAssociatedTokenAddress(tokenMint, kp.publicKey)
      const tokenBalance = (await connection.getTokenAccountBalance(ata)).value.uiAmount
      const amounts = generateDistribution(tokenBalance!, 0, tokenBalance!, distributionPerWallet, "random")
      sendBulkToken(kpsToSend, amounts, mainKp, tokenMint, tokenDecimal)

    }


    console.log("Bundling result confirmed, successfully bought")

  } catch (e) {
    console.error(e);
  }
}




async function trackWallet(connection: Connection, mint: string): Promise<void> {
  try {
    const deployer = new PublicKey(deployerPubkey)
    const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, deployer)
    connection.onLogs(
      wsolAta,
      async ({ logs, err, signature }) => {
        if (err)
          console.log("Transaction failed")
        else {
          console.log(`\nSuccessfully created token: https://solscan.io/tx/${signature}\n`)
          const buyAmounts = calcSolAmount(totalPercent, initialSolAmount)
          await buy(privateKeys, mint, buyAmounts, 0.5);
        }
      },
      "confirmed"
    );

  } catch (error) {
    console.log("Error in tracking wallet \n", error)
  }
}

function calcSolAmount(totalPercent: number, initialSolAmount: number, walletNum: number = 3) {
  const percent = totalPercent / walletNum
  const buyAmounts: number[] = []
  for (let i = 0; i < walletNum; i++) {
    let total = 0
    buyAmounts.map(sol => { total += sol })
    const solToBuy: number = (percent * i / (100 - percent * i)) * initialSolAmount - total
    buyAmounts.push(solToBuy)
  }
  return buyAmounts
}

// run this to only buy without tracking, it uses bundling
// buy(privateKeys, mint, [0.001, 0.001, 0.001], 0.9)

// run this to track wallet's creation tx
trackWallet(connection, mint).catch(e => console.log(e))
