import { EthersSigner } from "@adapters/evm/EthersSigner";
import { ISigner } from "@core/interfaces/ISigner";
import { WriteTxOptions } from "@core/types";
import config from "@core/utils/config";
import { Interface, LogDescription } from "@ethersproject/abi";
import { FallbackProvider, Filter, JsonRpcProvider, TransactionResponse } from "ethers";

export class BaseContract {
  readonly iface: Interface;
  readonly address: string;
  readonly provider: FallbackProvider;
  readonly signer?: ISigner;
  readonly chaiId: number;

  constructor(address: string, chainId: number, abi: any, signer?: ISigner) {
    this.iface = new Interface(abi);
    this.address = address;
    this.chaiId = chainId;
    const rpcs = config.RPCS[chainId];
    if (!rpcs || rpcs.length === 0) {
      throw new Error(`RPC not found for chainId: ${chainId}`);
    }

    this.provider = new FallbackProvider(rpcs.map((url) => new JsonRpcProvider(url)));

    if (signer instanceof EthersSigner) {
      signer.connect(this.provider);
    }
    this.signer = signer;
  }

  // -------- 编码 --------
  encodeFunctionData(method: string, args: any[] = []): string {
    return this.iface.encodeFunctionData(method, args);
  }

  // -------- Gas 估算 --------
  async estimateGas(method: string, args: any[] = [], value?: bigint): Promise<bigint> {
    if (!this.signer) throw new Error("Signer required for estimateGas");

    const data = this.encodeFunctionData(method, args);
    const from = await this.signer.getAddress();

    const gas = await this.provider.estimateGas({
      from,
      to: this.address,
      data,
      ...(value ? { value } : {}),
    });
    return BigInt(gas.toString());
  }

  // -------- 读方法 --------
  async read<T = any>(method: string, args: any[] = []): Promise<T> {
    const data = this.encodeFunctionData(method, args);
    const raw = await this.provider.call({ to: this.address, data });
    const decoded = this.iface.decodeFunctionResult(method, raw);
    return (Array.isArray(decoded) && decoded.length === 1 ? decoded[0] : decoded) as T;
  }

  // -------- 写方法 --------
  async write(method: string, args: any[] = [], options: WriteTxOptions = {}): Promise<any> {
    if (!this.signer) throw new Error("Signer required for write()");

    const data = this.encodeFunctionData(method, args);
    const from = await this.signer.getAddress();

    // 组装 tx 参数
    const txRequest: {
      to: string;
      from: string;
      data: string;
      gasLimit?: bigint;
      value?: bigint;
    } = { to: this.address, from, data };

    // 自动估算 gas（除非用户禁用）
    if (options.estimateGas !== false && !options.gasLimit) {
      txRequest.gasLimit = await this.estimateGas(method, args, options.value);
    } else if (options.gasLimit) {
      txRequest.gasLimit = options.gasLimit;
    }

    // 如果传入 value，则附带
    if (options.value != null) {
      txRequest.value = options.value;
    }

    // 发起交易
    return await this.signer.sendTx(txRequest);
  }

  /**
   * 创建事件过滤器（支持按事件名+参数过滤）
   * @param eventName 事件名称（如 "Transfer"）
   * @param topics 事件索引参数过滤（对应事件定义的 indexed 参数）
   * @returns ethers 兼容的 Filter 对象
   */
  createEventFilter(eventName: string, topics?: any[]): Filter {
    // 从 ABI 中获取事件签名，生成 topics[0]
    const event = this.iface.getEvent(eventName);
    if (!event) throw new Error(`Event "${eventName}" not found in ABI`);

    // 构建过滤器：指定合约地址 + 事件 topics
    const filter: Filter = {
      address: this.address,
      topics: [this.iface.getEventTopic(eventName), ...(topics || [])],
    };

    return filter;
  }

  /**
   * 解析原始日志为结构化事件数据
   * @param log 原始日志（从 provider.getLogs() 获取）
   * @returns 解析后的事件数据（包含事件名、参数、区块信息等）
   */
  parseEventLog(log: any): {
    eventName: string;
    args: Record<string, any>; // 键值对形式的事件参数（支持命名参数）
    blockNumber: number;
    blockHash: string;
    transactionHash: string;
    logIndex: number;
    raw: any; // 原始日志数据
  } {
    try {
      // 解码日志（利用合约 ABI 解析事件名和参数）
      const parsedLog: LogDescription = this.iface.parseLog(log);

      // 将数组形式的参数转换为键值对（同时保留数组索引访问）
      const args = parsedLog.args.reduce((acc, value, index) => {
        const paramName = parsedLog.eventFragment.inputs[index].name;
        acc[paramName] = value;
        acc[index] = value; // 支持通过索引访问（兼容老逻辑）
        return acc;
      }, {} as Record<string, any>);

      return {
        eventName: parsedLog.name,
        args,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        raw: log,
      };
    } catch (err) {
      throw new Error(`Failed to parse event log: ${(err as Error).message}`);
    }
  }

  /**
   * 扫描历史事件（指定区块范围）
   * @param eventName 事件名称
   * @param options 扫描配置（区块范围、过滤参数等）
   * @returns 解析后的事件列表
   */
  async scanEvents(
    eventName: string,
    options: {
      fromBlock?: number | "earliest" | "latest"; // 起始区块（默认 earliest）
      toBlock?: number | "latest" | "pending"; // 结束区块（默认 latest）
      topics?: any[]; // 事件索引参数过滤
      skipParse?: boolean; // 是否跳过解析（返回原始日志）
    } = {}
  ): Promise<any[]> {
    const { fromBlock = "earliest", toBlock = "latest", topics = [], skipParse = false } = options;

    // 1. 创建事件过滤器
    const filter = this.createEventFilter(eventName, topics);
    filter.fromBlock = fromBlock;
    filter.toBlock = toBlock;

    // 2. 从 RPC 节点获取日志
    try {
      const rawLogs = await this.provider.getLogs(filter);

      // 3. 解析日志（或直接返回原始日志）
      return skipParse ? rawLogs : rawLogs.map((log) => this.parseEventLog(log));
    } catch (err) {
      console.error(`[scanPastEvents] Failed to fetch events for ${eventName}:`, err);
      throw err;
    }
  }

  async getBlockNumberByTxnHash(transactionHash: string): Promise<bigint> {
    // 1. 校验交易哈希格式（简单校验 0x 前缀 + 64 位十六进制）
    if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
      throw new Error(`Invalid transactionHash: ${transactionHash}`);
    }
    try {
      const tx: TransactionResponse | null = await this.provider.getTransaction(transactionHash);
      if (!tx) {
        throw new Error(`Transaction not found: ${transactionHash}`);
      }
      if (tx.blockNumber === null) {
        throw new Error(`Transaction not confirmed yet: ${transactionHash}`);
      }
      return BigInt(tx.blockNumber);
    } catch (err: any) {
      throw new Error(`Failed to get blockNumber for tx ${transactionHash}: ${err?.message}`);
    }
  }
}
