import IKeypair from "./IKeypair";
import { sha256 } from "@ethersproject/sha2";
import { CompressedPublicKey, KeypairECCPayload } from "../types";
import { isHexString, hexZeroPad } from "@ethersproject/bytes";
import { assertValidPoint, assertValidPrivateKey } from "../utils/utilSap";
import { getSharedSecret as nobleGetSharedSecret, utils as nobleUtils, Point, getPublicKey } from "@noble/secp256k1";
import { BigNumberish, BigNumber } from "@ethersproject/bignumber";
import { utils } from "@noble/secp256k1";
import { computeAddress } from "@ethersproject/transactions";
import { encrypt as eccEncrypt, decrypt as eccDecrypt } from "eciesjs";

function getSharedSecret(privateKey: string, publicKey: string) {
  if (privateKey.length !== 66 || !isHexString(privateKey)) throw new Error("Invalid private key");
  if (publicKey.length !== 132 || !isHexString(publicKey)) throw new Error("Invalid public key");
  assertValidPoint(publicKey);
  assertValidPrivateKey(privateKey);

  // We use sharedSecret.slice(2) to ensure the shared secret is not dependent on the prefix, which enables
  // us to uncompress ephemeralPublicKey from Umbra.sol logs as explained in comments of getUncompressedFromX.
  // Note that a shared secret is really just a point on the curve, so it's an uncompressed public key
  const sharedSecret = nobleGetSharedSecret(privateKey.slice(2), publicKey.slice(2), true);
  const sharedSecretHex = nobleUtils.bytesToHex(sharedSecret); // Has 04 prefix but not 0x.
  return sha256(`0x${sharedSecretHex.slice(2)}`); // TODO Update to use noble-hashes?
}

const blockedKeys = [
  "0x0000000000000000000000000000000000000000000000000000000000000000", // private key of all zeros
  "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // public key of all zeroes
];

export default class KeypairECC implements IKeypair {
  readonly publicKeyHex: string | null = null; // Public key as hex string with 0x04 prefix
  readonly privateKeyHex: string | null = null;

  constructor(payload?: KeypairECCPayload) {
    const { privateKey, publickey } = payload || {};
    if (!privateKey && !publickey) return;
    if (privateKey) {
      // Private key provided
      assertValidPrivateKey(privateKey);
      this.privateKeyHex = privateKey;
      const publicKey: Uint8Array = getPublicKey(this.privateKeyHexSlim as string, true);
      this.publicKeyHex = `0x${nobleUtils.bytesToHex(publicKey)}`; // Has 0x02 prefix, other forms computed as getters.
    } else if (publickey) {
      // Public key provided
      assertValidPoint(publickey); // throw if point is not on curve
      this.publicKeyHex = publickey; // Save off public key, other forms computed as getters
    } else {
      throw new Error("Key must be a 66 character hex private key or a 132 character hex public key");
    }
  }

  get privateKeyHexSlim() {
    return this.privateKeyHex ? this.privateKeyHex.slice(2) : null;
  }

  /**
   * @notice Returns the uncompressed public key as a hex string without the 0x prefix
   */
  get publicKeyHexSlim() {
    return this.publicKeyHex?.slice(2);
  }

  get address() {
    return computeAddress(this.publicKeyHex as string);
  }

  encrypt(data: Buffer): Buffer {
    if (!this.publicKeyHex) throw new Error("publicKey is required");
    return eccEncrypt(this.publicKeyHex, data);
  }

  decrypt(data: Buffer): Buffer {
    if (!this.privateKeyHex) throw new Error("privateKey is required");
    return eccDecrypt(this.privateKeyHex, data);
  }

  mulPublicKey(value: RandomNumber | string) {
    if (!(value instanceof RandomNumber) && typeof value !== "string") {
      throw new Error("Input must be instance of RandomNumber or string");
    }
    if (typeof value === "string" && !value.startsWith("0x")) {
      throw new Error("Strings must be in hex form with 0x prefix");
    }

    // Parse number based on input type
    const number = isHexString(value)
      ? BigInt(value as string) // provided a valid hex string
      : BigInt((value as RandomNumber).asHex); // provided RandomNumber

    // Perform the multiplication and return new KeyPair instance
    const publicKey = Point.fromHex(this.publicKeyHexSlim as string).multiply(number);
    return new KeypairECC({ publickey: `0x${publicKey.toHex()}` });
  }

  addPublicKey(publicKey: string) {
    const point = Point.fromHex(publicKey.slice(2));
    const addPublicKey = Point.fromHex(this.publicKeyHexSlim as string).add(point);
    return new KeypairECC({ publickey: `0x${addPublicKey.toHex(true)}` });
  }

  addPrivateKey(privateKey: string) {
    const bg1 = BigNumber.from(privateKey);
    const bg2 = BigNumber.from(this.privateKeyHex);
    const bg = bg1.add(bg2);
    return new KeypairECC({ privateKey: bg._hex });
  }

  //=========STATIC FUNCTIONS========//
  static getSeedBySignature(signature: string): [string, string] {
    const startIndex = 2; // first two characters are 0x, so skip these
    const length = 64; // each 32 byte chunk is in hex, so 64 characters
    const portion1 = signature.slice(startIndex, startIndex + length);
    const portion2 = signature.slice(startIndex + length, startIndex + length + length);
    const lastByte = signature.slice(signature.length - 2);

    if (`0x${portion1}${portion2}${lastByte}` !== signature) {
      throw new Error("Signature incorrectly generated or parsed");
    }

    // Hash the signature pieces to get the two private keys
    const spendingPrivateKeySeed = sha256(`0x${portion1}`);
    const viewingPrivateKeySeed = sha256(`0x${portion2}`);

    return [spendingPrivateKeySeed, viewingPrivateKeySeed];
  }

  static compressPublicKey(publicKey: string): CompressedPublicKey {
    assertValidPoint(publicKey);
    const compressedPublicKey = Point.fromHex(publicKey.slice(2)).toHex(true);
    return {
      prefix: Number(compressedPublicKey[1]), // prefix bit is the 2th character in the string (no 0x prefix)
      pubKeyXCoordinate: `0x${compressedPublicKey.slice(2)}`,
    };
  }

  static getUncompressedFromX(pkx: BigNumberish, prefix: number | string | undefined = undefined) {
    // Converting `pkx` to a BigNumber will throw if the value cannot be safely converted to a BigNumber, i.e. if the
    // value is of type Number and larger than Number.MAX_SAFE_INTEGER.
    pkx = BigNumber.from(pkx);

    // pkx was validated, now we decompress it.
    const hexWithoutPrefix = hexZeroPad(BigNumber.from(pkx).toHexString(), 32).slice(2); // pkx as hex string without 0x prefix
    if (!prefix) {
      // Only safe to use this branch when uncompressed key is using for scanning your funds
      return `0x${Point.fromHex(`02${hexWithoutPrefix}`).toHex()}`;
    }
    const hexWithPrefix = `0${Number(prefix)}${hexWithoutPrefix}`;
    return `0x${Point.fromHex(hexWithPrefix).toHex()}`;
  }
}

export class RandomNumber {
  readonly sizeInBytes = 32; // generated random number will always be 32 bytes
  readonly value: BigNumber; // random number value

  /**
   * @notice Generate a new 32 byte random number
   */
  constructor() {
    // Randomly generate 32 bytes and save them as a BigNumber
    const randomNumberAsBytes = utils.randomPrivateKey();
    this.value = BigNumber.from(randomNumberAsBytes);
  }

  /**
   * @notice Get random number as hex string
   */
  get asHex() {
    return hexZeroPad(this.value.toHexString(), this.sizeInBytes);
  }

  /**
   * @notice Get random number as hex string without 0x prefix
   */
  get asHexSlim() {
    return hexZeroPad(this.asHex, this.sizeInBytes).slice(2);
  }

  get asBuffer() {
    return Buffer.from(this.asHexSlim, "hex");
  }
}
