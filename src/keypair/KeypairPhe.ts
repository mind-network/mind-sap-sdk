import IKeyPair from "./IKeypair";
import { isHexString } from "@ethersproject/bytes";
import forge from "node-forge";
import crypto from "crypto";
import { PublicKey, PrivateKey } from "paillier-bigint";
import { modInv } from "bigint-crypto-utils";
import { KeypairPhePayload } from "../types";

export default class KeypairFhe implements IKeyPair {
  publicKey: PublicKey | null = null;
  privateKey: PrivateKey | null = null;
  rsaKeypair: forge.pki.KeyPair | null = null;

  constructor(payload: KeypairPhePayload) {
    const { publickey: pk, privateKey: sk } = payload;
    if (!pk && !sk) return;
    if (sk) {
      //privatekey
      const { publicKey, privateKey, rsaKeypair } = generateKeyPair(Buffer.from(sk.slice(2), "hex"));
      this.publicKey = publicKey;
      this.privateKey = privateKey;
      this.rsaKeypair = rsaKeypair;
    } else if (pk) {
      //publicKey
      const n = BigInt(pk);
      const g = n + BigInt(1);
      this.publicKey = new PublicKey(n, g);
    } else {
      throw new Error("Invalid phe key");
    }
  }

  get nHex() {
    if (!this.publicKey) return;
    return "0x" + this.publicKey.n.toString(16);
  }

  encrypt(hex: string, digest?: number): bigint | string {
    if (!this.publicKey) throw new Error("publicKey is null");
    if (!isHexString(hex)) throw new Error("encrypt param must be hex string");
    const data = BigInt(hex);
    const encryptData = this.publicKey.encrypt(data);
    if (digest === 16) {
      return "0x" + encryptData.toString(16);
    }
    return encryptData;
  }
}

function generateKeyPair(seed: Buffer) {
  const seedArray = new Array(32);
  seedArray[0] = seed;
  for (var i = 0; i < 31; ++i) {
    seedArray[i + 1] = crypto.createHash("sha256").update(seedArray[i]).digest();
  }
  const seedBuffer = Buffer.concat(seedArray);
  const rnd = forge.random.createInstance();
  rnd.seedFileSync = () => seedBuffer.toString("latin1");

  const key = forge.pki.rsa.generateKeyPair({
    bits: 2048,
    prng: rnd,
    workers: 1,
  });

  const pHex = key.privateKey.p.toString(16);
  const qHex = key.privateKey.q.toString(16);

  const p = BigInt("0x" + pHex);
  const q = BigInt("0x" + qHex);

  const n = p * q;
  const g = n + BigInt(1);
  const lambda = (p - BigInt(1)) * (q - BigInt(1));
  const mu = modInv(lambda, n);

  const publicKey = new PublicKey(n, g);
  const privateKey = new PrivateKey(lambda, mu, publicKey, p, q);
  return { privateKey, publicKey, rsaKeypair: key };
}
