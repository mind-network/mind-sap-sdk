# Mind Sealth Address Protocol SDK

An Typescript implementation for A zero-trust stealth address protocol.

## Description

The Stealth Address (SA) prevents the public association of a blockchain transaction with the recipient’s wallet address. SA effectively conceals the actual destination address of the transaction. It is critical to protect privacy of recipients and cut off social engineering attack on transaction flow.

-[Ref docs](https://ethresear.ch/t/fhe-dksap-fully-homomorphic-encryption-based-dual-key-stealth-address-protocol/16213)

## Getting Started

### Dependencies

- node [16, 18)

### Installing

```
# Install dependencies
yarn install

# Build the project
yarn build

# Register the package globally for linking
yarn link

# In the target project (where you want to use the linked package)
yarn link mind-sap-sdk
```

### Usage

#### Method Return Type

All directly called methods return the following type:

```ts
export type ResultType = {
  code: number;
  message?: string;
  result?: any;
};
```

##### Explanation

- `code`: `0` indicates success; any other value indicates failure.
- `message`: Optional. Empty on success; contains error message on failure.
- `result`: Optional. Present on success; `undefined` on failure.

#### Encryption Type

Encryption method enum:

```ts
export enum KEYPAIR_TYPE {
  ECC = 1,
}
```

#### Cross-Chain Bridge Protocol

Bridge protocol enum:

```ts
export enum BRIDGE_PTOTOCOL {
  CCIP = 1,
}
```

#### SendPayload <a name="sendPayload"></a>

Parameters required by the `send()` method:

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

##### Field Descriptions

| Field Name       | Type    | Required | Description                                                                                                                                                  |
| ---------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| from             | string  | No       | Defaults to empty. If empty, the transaction is initiated by an EOA wallet; otherwise, by the SA address of the EOA.                                         |
| cipherText       | string  | No       | Required if `from` is set.                                                                                                                                   |
| amount           | number  | Yes      | Amount to send.                                                                                                                                              |
| token.address    | string  | Yes      | Token contract address. For native tokens, use `"0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEETH"`; otherwise, use the actual token address.                      |
| token.decimal    | number  | No       | Token decimal places. Required for non-native tokens.                                                                                                        |
| receive.receipt  | string  | Yes      | Recipient address: can be EOA, ENS, CNS, or SA.                                                                                                              |
| receive.createSA | boolean | No       | Whether to create an SA. When `receipt` is EOA/ENS/CNS and `createSA = true`, sends to EOA(SA); `false` sends to EOA only. Ignored if receipt is SA address. |
| bridge.chain     | number  | Yes      | Recipient chainId (decimal). If equal to signer's chainId, it's not cross-chain. Other values indicate cross-chain.                                          |
| bridge.protocol  | number  | Yes      | Bridge protocol (e.g., CCIP).                                                                                                                                |
| bridge.token     | string  | No       | Optional. Token address specified by the recipient.                                                                                                          |

#### Initialization

```ts
import { MindSAP } from "mind-sap-sdk";

const mindSAP = new MindSAP();
```

#### `send` Method

```ts
const response: ResultType = await mindSAP.send(signer, payload);
```

##### Parameters

- `signer`: Obtained after connecting the wallet.
- `payload`: Parameters as described in [SendPayload](#sendPayload).

#### `registry` Method

```ts
const response: ResultType = await mindSAP.registry(signer);
```

##### Parameters

- `signer`: Obtained after connecting the wallet.

#### `isRegistry` Method

Check whether the address is already registered.

```ts
const response: ResultType = await mindSAP.isRegistry(signer | walletAddress);
```

##### Parameters

#### `scan` Method (Coming Soon)

```ts
const response: ResultType = await mindSAP.scan(signer);
```

##### Parameters

- `signer`: Obtained after connecting the wallet.

#### `getBalance` Method

```ts
const response: ResultType = await mindSAP.getBalance(signer, tokenAddress?, SA?);
```

##### Parameters

- `signer`: Obtained after connecting the wallet.
- `tokenAddress`: Token contract address to query. If omitted, returns native token balance.
- `SA`: Optional. If specified, retrieves balance of the SA address; otherwise uses the signer address.

- `signer`: Wallet signer.
- Or a string of wallet address / ENS / CNS.

## Authors

- Joshua [@JoshuaW55818202](https://twitter.com/JoshuaW55818202)

## Version History

- v1.0.0
  - Initial Release

## License

This project is licensed under the [MIT] License - see the LICENSE.md file for details
