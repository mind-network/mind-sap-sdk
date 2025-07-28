import { ITransactionHistory } from "./ITransactionHistory";
import localForage from "./index";
import { QueryTransactionHistoryPayload, TransactionHistory } from "../types";
import clone from "lodash/clone";

const keyPrefix = "TransactionHistory_";

export default class TransactionHistoryLocal implements ITransactionHistory {
  async save(user: string, data: TransactionHistory): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }
    const pre = ((await localForage.getItem(`${keyPrefix}${user}`)) as TransactionHistory[]) || [];

    localForage.setItem(`${keyPrefix}${user}`, [data, ...pre]);
  }
  async query(user: string, payload: QueryTransactionHistoryPayload): Promise<any> {
    const pre = ((await localForage.getItem(`${keyPrefix}${user}`)) as TransactionHistory[]) || [];

    let list = clone(pre);

    const time = payload.orderBy?.time;

    if (time === "asc") {
      list = list.sort((a, b) => a.time - b.time);
    } else {
      list = list.sort((a, b) => b.time - a.time);
    }

    if (payload.type && payload.type !== "All") {
      list = list.filter((a) => a.type === payload.type);
    }

    const { current, pageSize } = payload;

    const startIndex = (current - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const pageData = list.slice(startIndex, endIndex);

    return {
      current,
      pageSize,
      total: list.length,
      list: pageData,
    };
  }
}
