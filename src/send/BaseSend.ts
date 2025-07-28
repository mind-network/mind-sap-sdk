import { JsonRpcSigner } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { ResultType, SendPayload } from "../types";
import { SEND_SCENES } from "../utils/constants";
import { isValidSA } from "../utils/utilSap";
import SAERC20Client from "../contracts/SAERC20Clients";
import ERC20 from "../contracts/ERC20";
import { MaxUint256 } from "@ethersproject/constants";
import { BigNumber } from "@ethersproject/bignumber";
import { parseChainConfig } from "../utils";
import { Contract } from "@ethersproject/contracts";
import { parseUnits } from "@ethersproject/units";
import { Exception } from "../utils/exception";
import StorageFactory from "../storage/StorageFactory";
import { ITransactionHistory } from "../storage/ITransactionHistory";

export default class BaseSend {
  readonly signer: JsonRpcSigner | Wallet;
  readonly payload: SendPayload;

  saERC20Client!: Contract;

  readonly transactionHistory: ITransactionHistory = StorageFactory.createTransactionHistory();

  constructor(signer: JsonRpcSigner | Wallet, payload: SendPayload) {
    this.signer = signer;
    this.payload = payload;
  }

  async scenes(): Promise<SEND_SCENES> {
    const {
      from,
      cipherText,
      token: { address },
      receive: { createSA, receipt },
    } = this.payload;
    const chainId = await this.signer.getChainId();
    if (!from) {
      if (await isValidSA(receipt, address, chainId)) return SEND_SCENES.EOATOSA;
      if (createSA) return SEND_SCENES.EOATOEOASA;
      throw new Error("This scense not supported");
    }
    if (!(await isValidSA(from, address, chainId))) throw new Error("From must be SA address");
    if (!cipherText) throw new Error("CipherText is not empty when from is SA address");
    if (await isValidSA(receipt, address, chainId)) return SEND_SCENES.SATOSA;
    if (createSA) return SEND_SCENES.SATOEOASA;
    return SEND_SCENES.SATOEOA;
  }

  get fee() {
    const {
      fee,
      token: { decimal },
    } = this.payload;
    return parseUnits(String(fee as number), decimal);
  }

  get relayerGas() {
    const {
      relayerGas,
      token: { decimal },
    } = this.payload;
    return relayerGas ? parseUnits(relayerGas, decimal)._hex : BigNumber.from(0)._hex;
  }

  async getERC20Client(): Promise<Contract> {
    if (!this.saERC20Client) {
      const chainId = await this.signer.getChainId();
      const chain = parseChainConfig(chainId);
      this.saERC20Client = SAERC20Client.connect(chain.ERC20ClientAddress, this.signer as JsonRpcSigner);
    }
    return this.saERC20Client;
  }

  async getNonce() {
    const clientContract = await this.getERC20Client();
    const [nonce] = await clientContract.getSA(this.payload.from, this.payload.token.address);
    return nonce;
  }

  async relayerResHandler(res: ResultType) {
    if (res.code === 0) return res.result;
    throw new Exception(res.code, res.message);
  }

  async approveERC20Token(approveAddress?: string) {
    const tokenContract = ERC20.connect(this.payload.token.address, this.signer);
    const amount = this.payload.amount as BigNumber;
    const address = await this.signer.getAddress();
    if (!approveAddress) {
      const chainId = await this.signer.getChainId();
      const chain = parseChainConfig(chainId);
      approveAddress = chain.ERC20ClientAddress;
    }
    const allowance = (await tokenContract.allowance(address, approveAddress)) as BigNumber;
    const totalAmount = amount.add(this.fee);
    if (totalAmount.gt(allowance)) {
      const approveTx = await tokenContract.approve(approveAddress, MaxUint256);
      await approveTx.wait();
    }
  }

  async getSignerInfo() {
    const chainId = await this.signer.getChainId();
    const chainConfig = parseChainConfig(chainId);
    const address = await this.signer.getAddress();
    return {
      chainId,
      chainConfig,
      address,
    };
  }
}
