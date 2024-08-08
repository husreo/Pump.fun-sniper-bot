import { PublicKey, TransactionInstruction, VersionedTransaction, TransactionMessage, LAMPORTS_PER_SOL, Connection, Keypair, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import { connection, deployerPubkey, payerKeypair, privateKeys, distributionPerWallet, tokenDecimal, buySolAmounts } from './config';
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
  UNIT_BUDGET,
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
    
    if (keypairs.length !== solIns.length) {
      console.log("Number of wallets doesn not match")
      return
    }
    // await sleep(3000)                                                                   //  here's delay, it's really unnecessay
    for (let i = 0; i < keypairs.length; i++) {
      const buyer = Keypair.fromSecretKey(base58.decode(keypairs[i]))
      const owner = buyer.publicKey;
      const tokenMint = new PublicKey(mintStr);
      let tokenAccount: PublicKey = await getAssociatedTokenAddress(tokenMint, owner)
      let ixs: TransactionInstruction[] = [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: UNIT_PRICE }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: UNIT_BUDGET })
      ];

      // Attempt to retrieve token account, otherwise create associated token account
      try {
        const info = await connection.getAccountInfo(tokenAccount)
        if (!info) {
          ixs.push(
            createAssociatedTokenAccountInstruction(
              owner,
              tokenAccount,
              owner,
              tokenMint,
            )
          )
        }
      } catch (e) {
        console.log("It should not happen")
        return
      }

      const solIn = solIns[i]
      const solInLamports = solIn * LAMPORTS_PER_SOL;
      const tokenOut = Math.round(solInLamports / 30 * 10 ** 6)
      const TRADE_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
      const BONDING_ADDR = new Uint8Array([98, 111, 110, 100, 105, 110, 103, 45, 99, 117, 114, 118, 101]);

      const [bonding] = PublicKey.findProgramAddressSync([BONDING_ADDR, tokenMint.toBuffer()], TRADE_PROGRAM_ID);
      const [assoc_bonding] = PublicKey.findProgramAddressSync([bonding.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), tokenMint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID);

      const ASSOCIATED_USER = tokenAccount;
      const USER = owner;

      // Build account key list
      const keys = [
        { pubkey: GLOBAL, isSigner: false, isWritable: false },
        { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: bonding, isSigner: false, isWritable: true },
        { pubkey: assoc_bonding, isSigner: false, isWritable: true },
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
        return Math.round(lamports  / 1000 * (1 + slippage) + lamports  / 1000 * (1 + slippage));
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
      const blockhash = (await connection.getLatestBlockhash("confirmed")).blockhash

      const tx = new Transaction().add(...ixs)
      tx.recentBlockhash = blockhash
      tx.feePayer = owner
      // console.log(await connection.simulateTransaction(tx))
      // Compile message
      const messageV0 = new TransactionMessage({
        payerKey: owner,
        recentBlockhash: blockhash,
        instructions: ixs,
      }).compileToV0Message()

      const transaction = new VersionedTransaction(messageV0)
      transaction.sign([buyer])
      transactions.push(transaction)
    }

    setTimeout(() => {
      bundle(transactions, payerKeypair)
    }, 500)
    await bundle(transactions, payerKeypair)

    console.log("bundling is done")
    let index = 0
    const tokenMint = new PublicKey(mintStr)
    const kp = Keypair.fromSecretKey(base58.decode(keypairs[0]))
    const ata = await getAssociatedTokenAddress(tokenMint, kp.publicKey)
    console.log("Checking the result")
    while (true) {
      if (index > 60) {
        console.log("token sniping failed")
        return
      }
      try {
        const tokenBalance = (await connection.getTokenAccountBalance(ata)).value.uiAmount
        if (tokenBalance && tokenBalance > 0)
          break
      } catch (error) {
        index++
        await sleep(2000)
      }
    }
    console.log("Bundling result confirmed, successfully bought")
  } catch (e) {
    console.error(e);
  }
}


async function trackWallet(connection: Connection): Promise<void> {
  try {
    const deployer = new PublicKey(deployerPubkey)
    const id = connection.onLogs(
      deployer,
      async ({ logs, err, signature }) => {
        if (err)
          console.log("Transaction failed")
        else {
          console.log(`\nSuccessfully created token: https://solscan.io/tx/${signature}\n`)
          let txData: any
          try {
            txData = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
            const mint = txData?.transaction.message.accountKeys[1].pubkey.toBase58()
            console.log("new token mint:", mint)

            if (!mint) {
              console.log("Mint does not exist")
              return
            } else {
              await buy(privateKeys, mint, buySolAmounts, 10);
            }
          } catch (error) {
            console.log("Error in parsing transaction")
          }
        }
      },
      "confirmed"
    );
  } catch (error) {
    console.log("Error in tracking wallet")
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

const distribute = async (mint: string) => {
  for (let i = 0; i < privateKeys.length; i++) {
    const kpsToSend: Keypair[] = []
    for (let j = 0; j < distributionPerWallet; j++)
      kpsToSend.push(Keypair.generate())
    saveDataToFile(kpsToSend.map(kp => base58.encode(kp.secretKey)), `data${i}.json`)
    const mainKp = Keypair.fromSecretKey(base58.decode(privateKeys[i]))
    const tokenMint = new PublicKey(mint)
    const ata = await getAssociatedTokenAddress(tokenMint, mainKp.publicKey)
    const tokenBalance = (await connection.getTokenAccountBalance(ata)).value.uiAmount
    if (!tokenBalance) {
      console.log("Wallet does not have token in it")
      return
    }
    const amounts = generateDistribution(tokenBalance! / 3, (tokenBalance! / distributionPerWallet / 6), (tokenBalance! / distributionPerWallet * 2 / 3), distributionPerWallet, "random")   ////////////// need to delete /3 after 
    console.log(" distribute ~ amounts:", amounts)

    await sendBulkToken(kpsToSend, amounts, mainKp, tokenMint, tokenDecimal)
    await sleep(5000)
  }

  console.log("Bundling result confirmed, successfully bought")
}

buy(privateKeys, "nChwcE1b3c4pkvqXwmVVtb4HAQL7XCNVnFacR62pump", buySolAmounts, 10);
// distribute()

// trackWallet(connection).catch(e => console.log(e))

// getMint(connection, new PublicKey("2xUXX5S5WxDs7S5KXWVb74PkDtPtcUwiT7TfMTy8wCrn")).then(info => console.log(info))



