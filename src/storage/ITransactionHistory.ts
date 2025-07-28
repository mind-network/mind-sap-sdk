import { QueryTransactionHistoryPayload, TransactionHistory } from "../types";

export interface ITransactionHistory {
  save(user: string, data: TransactionHistory): Promise<void>;
  query(
    user: string,
    payload: QueryTransactionHistoryPayload
  ): Promise<TransactionHistory[]>;
}
