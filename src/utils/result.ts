import { ResultType } from "../types";

export default class Result {
  static success<T>(data: T): ResultType {
    return { code: 0, result: data };
  }

  static fail(error: any, result?: any): ResultType {
    if (error?.code) {
      if (error?.data) {
        return { code: error.data?.code, message: handleMessage(error.data?.message), result };
      }
      return { code: error.code, message: handleMessage(error.message), result };
    }
    return { code: 50000, message: handleMessage(error.toString()), result };
  }
}

function handleMessage(message: string) {
  if (message?.indexOf("Not enough token") > -1) {
    return "Not enough token in wallet for transfer amount and fees";
  }
  return message;
}
