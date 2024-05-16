import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import base58 from 'bs58';

export const privateKeys = [
  "", 
  "", 
  ""
]
export const payerPrivateKey = ""
export const payerKeypair = Keypair.fromSecretKey(base58.decode(payerPrivateKey));
export const blockengingUrl = "ny.mainnet.block-engine.jito.wtf"
export const jitoFee = 1000000     // 0.001SOL
export const jitoKeyStr = ""
export const rpc = "https://mainnet.helius-rpc.com/?"
export const wss = "wss://mainnet.helius-rpc.com/?"
export const connection = new Connection(rpc, { wsEndpoint: wss });
export const deployerPubkey = ""
export const mint = ""
export const totalPercent = 20
export const initialSolAmount = 10
export const initialTokenAmount = 100000000  // token amount with decimal
export const tokenDecimal = 6
