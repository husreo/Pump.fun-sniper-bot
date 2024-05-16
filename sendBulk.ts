import { Keypair, PublicKey, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { bundle } from "./executor/jito";
import { createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { connection } from "./config";

interface Drop {
  walletAddress: PublicKey,
  tokenAmount: number
}

export async function sendBulkToken(
  walletKeypairs: Keypair[], tokensToSendArr: number[], walletKeypair: Keypair, mintAddress: PublicKey, tokenDecimal: number
) {
  let index = 0

  let dropList: Drop[] = walletKeypairs.map((kp: Keypair, i: number) => {
    return {
      walletAddress: kp.publicKey,
      tokenAmount: tokensToSendArr[index++]
    }
  }).filter(drop => drop.tokenAmount != 0)

  const NUM_DROPS_PER_TX = 10;


  const transactionList1 = await generateATA(NUM_DROPS_PER_TX, dropList, walletKeypair, mintAddress);
  const result1 = await bundle(transactionList1, walletKeypair)

  const transactionList2 = await generateTransactions(NUM_DROPS_PER_TX, dropList, walletKeypair, mintAddress, tokenDecimal);
  const result2 = await bundle(transactionList2, walletKeypair)

  return result1 && result2
}



async function generateATA(batchSize: number, dropList: Drop[], keypair: Keypair, mintAddress: PublicKey) {
  let fromWallet = keypair.publicKey
  let txInstructions: TransactionInstruction[] = []
  let result: VersionedTransaction[] = [];
  for (let i = 0; i < dropList.length; i++) {
    let drop = dropList[i]
    const associatedAddress = await getAssociatedTokenAddress(
      mintAddress,
      drop.walletAddress
    )
    const info = await connection.getAccountInfo(associatedAddress);
    if (!info) {
      const ataIx = createAssociatedTokenAccountInstruction(
        keypair.publicKey,
        associatedAddress,
        drop.walletAddress,
        mintAddress
      )
      {
        const testTx = new Transaction().add(ataIx)
        testTx.feePayer = keypair.publicKey
        testTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        txInstructions.push(ataIx)
      }
    }
  }
  const numTransactions = Math.ceil(txInstructions.length / batchSize);
  for (let i = 0; i < numTransactions; i++) {
    let blockhash = await connection
      .getLatestBlockhash()
      .then((res: any) => res.blockhash);
    let bulkTransaction: TransactionInstruction[] = [];
    let lowerIndex = i * batchSize;
    let upperIndex = (i + 1) * batchSize;
    for (let j = lowerIndex; j < upperIndex; j++) {
      if (txInstructions[j]) bulkTransaction.push(txInstructions[j]);
    }
    const messageV0 = new TransactionMessage({
      payerKey: fromWallet,
      recentBlockhash: blockhash,
      instructions: bulkTransaction,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([keypair]);
    result.push(transaction);
  }
  return result;
}

async function generateTransactions(batchSize: number, dropList: Drop[], keypair: Keypair, mintAddress: PublicKey, tokenDecimal: number) {
  let fromWallet = keypair.publicKey
  let result: VersionedTransaction[] = [];
  let txInstructions: TransactionInstruction[] = []

  for (let i = 0; i < dropList.length; i++) {
    let drop = dropList[i]
    let amountInt = parseFloat(drop.tokenAmount.toFixed(4))
    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(connection, keypair, mintAddress, keypair.publicKey)
    const toTokenAccount = await getOrCreateAssociatedTokenAccount(connection, keypair, mintAddress, drop.walletAddress)
    console.log("to", dropList[i].walletAddress.toBase58(), "amount ", parseInt((amountInt * 10 ** tokenDecimal).toFixed(0)))
    const transferInstrunction = createTransferInstruction(
      fromTokenAccount.address,
      toTokenAccount.address,
      keypair.publicKey,
      parseInt((parseFloat(drop.tokenAmount.toFixed(4)) * 10 ** tokenDecimal).toFixed(0))
    )
    txInstructions.push(transferInstrunction)
  }
  const numTransactions = Math.ceil(txInstructions.length / batchSize);
  for (let i = 0; i < numTransactions; i++) {
    let blockhash = await connection
      .getLatestBlockhash()
      .then((res: any) => res.blockhash);
    let bulkTransaction: TransactionInstruction[] = [];
    let lowerIndex = i * batchSize;
    let upperIndex = (i + 1) * batchSize;
    for (let j = lowerIndex; j < upperIndex; j++) {
      if (txInstructions[j]) bulkTransaction.push(txInstructions[j]);
    }
    const messageV0 = new TransactionMessage({
      payerKey: fromWallet,
      recentBlockhash: blockhash,
      instructions: bulkTransaction,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([keypair]);
    result.push(transaction);
  }
  return result;
}
