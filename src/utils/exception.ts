export const Exception_CODE = {
  NO_REGISTER: {
    code: 40001,
    message:
      "The target address is not registered, please register the target wallet address on Mind for stealth transfer !",
  },
};

export class Exception extends Error {
  code: number = 50000;
  constructor(code: number, message?: string) {
    super(message);
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NO_REGISTER extends Exception {
  constructor(message?: string) {
    super(
      Exception_CODE.NO_REGISTER.code,
      message || Exception_CODE.NO_REGISTER.message
    );
  }
}
