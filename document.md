# SDK Documentation

### Type Definitions

#### 1. Method Return Value

All directly invoked methods return the following type:

```ts
export type ResultType = {
  code: number;
  message?: string;
  result?: any;
}
```

Explanation:

* `code`: `0` indicates success; any other value indicates failure.
* `message`: Empty if successful; contains error info if failed.
* `result`: Contains a value if successful; empty if failed.

---

#### 2. Encryption Method

Encryption method, enum type:

```ts
export enum KEYPAIR_TYPE {
  ECC = 1,
}
```

---

#### 3. Cross-Chain Bridge Protocol

Cross-chain bridge protocol, enum type:

```ts
export enum BRIDGE_PTOTOCOL {
  CCIP = 1,
}
```

---

#### 4. SendPayload <a name="sendPayload"></a>

Parameters required for the `send()` method:

```ts
export type SendPayload = {
  from?: string;
  cipherText?: string;
  amount: number;
  token: {
    address: string;
    decimal?: number;
  };
  receive: {
    receipt: string;
    createSA?: boolean; // default: true;
  };
  bridge?: {
    chain: number;
    protocol: BRIDGE_PTOTOCOL;
    token?: string;
  };
};
```

Field Descriptions:

| Field Name       | Type    | Required | Description                                                                                                                                                          |
| ---------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| from             | string  | No       | Defaults to empty. If empty, the transaction is initiated from an EOA wallet. If filled, the transaction is initiated from the SA address of the EOA wallet.         |
| cipherText       | string  | No       | Defaults to empty. Required if `from` is not empty.                                                                                                                  |
| amount           | number  | Yes      | Amount to send.                                                                                                                                                      |
| token.address    | string  | Yes      | Token address. If it is a native token, use `"0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEETH"`. For other tokens, provide the token address.                             |
| token.decimal    | number  | No       | Token decimals. Required if it's a non-native token.                                                                                                                 |
| receive.receipt  | string  | Yes      | Receiver's address. Can be a standard wallet address, ENS, CNS, or SA address.                                                                                       |
| receive.createSA | boolean | No       | Whether to create an SA. If `receive.receipt` is a standard wallet/ENS/CNS, and `createSA` is `true`, it targets EOA(SA); if `false`, it targets EOA. Ignored if SA. |
| bridge.chain     | number  | Yes      | Receiver’s `chainId` (decimal). If equal to the signer’s `chainId`, it’s not cross-chain; otherwise, it is a cross-chain transfer.                                   |
| bridge.protocol  | number  | Yes      | Bridge protocol, e.g., CCIP, etc.                                                                                                                                    |
| bridge.token     | string  | No       | Token address specified by the receiver.                                                                                                                             |

---

### Initialization

```ts
import { MindSAP } from "mind-sap-sdk";

const mindSAP = new MindSAP();
```

---

### `send` Method

#### 1. Invocation

```ts
const response: ResultType = await mindSAP.send(signer, payload);
```

#### 2. Parameter Description

* `signer`: The signer obtained after connecting the wallet.

Example:

```ts
import { Web3Provider } from "@ethersproject/providers";

const [connectedWallet] = await onboard.connectWallet();
const provider = new Web3Provider(connectedWallet.provider);
const signer = provider.getSigner();
```

* `payload`: The parameter passed to `send`, determines different scenarios based on fields.
  Field details: [SendPayload](#sendPayload)

---

### `registry` Method

#### 1. Invocation

```ts
const response: ResultType = await mindSAP.registry(signer);
```

#### 2. Parameter Description

* `signer`: The signer obtained after connecting the wallet.

---

### `isRegistry` Method

Checks whether an address is already registered.

#### 1. Invocation

Parameter can be a `signer`, wallet address, ENS, or CNS.

```ts
const response: ResultType = await mindSAP.isRegistry(signer | walletAddress);
```

#### 2. Parameter Description

* `signer`: The signer obtained after connecting the wallet.

---

### `scan` Method (Coming Soon)

#### 1. Invocation

```ts
const response: ResultType = await mindSAP.scan(signer);
```

#### 2. Parameter Description

* `signer`: The signer obtained after connecting the wallet.

---

### `getBalance` Method

#### 1. Invocation

```ts
const response: ResultType = await mindSAP.getBalance(signer, tokenAddress?, SA?);
```

#### 2. Parameter Description

* `signer`: The signer obtained after connecting the wallet.
* `tokenAddress`: Address of the token to check balance for. If empty, returns native token balance.
* `SA`: If provided, returns the balance of the SA address; otherwise, returns the signer’s balance.

---

### `swap` Method (Coming Soon)

### `stake` Method (Coming Soon)
