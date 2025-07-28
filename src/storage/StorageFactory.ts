import TransactionHistoryLocal from "./TransactionHistoryLocal";

export default class StorageFactory {
  static createTransactionHistory() {
    return new TransactionHistoryLocal();
  }
}
