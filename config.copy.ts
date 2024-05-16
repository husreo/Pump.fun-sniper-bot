import { Connection, Keypair } from '@solana/web3.js';
import base58 from 'bs58';

export const PRIV_KEY = ""; // BASE58 STRING FORMAT

export const payerKeypair = Keypair.fromSecretKey(base58.decode(PRIV_KEY));
export const blockengingUrl = "ny.mainnet.block-engine.jito.wtf"
export const jitoFee = 10000000     // 0.01SOL
export const jitoKeyStr = ""
export const rpc = ""
export const wss = ""
export const connection = new Connection(rpc);
