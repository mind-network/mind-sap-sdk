import { ETH_ADDRESS, MindSAP } from "../src";
import { SendPayload } from "../src/types";
import { assertResponse } from "./base";
import { ALICE_WALLET_PRIVATEKEY, BOB_WALLET_ADDRESS, getSigner, SEPOLIA_INFUA } from "./config_test";

const mindSAP = new MindSAP();

test("EOA_TO_EOASA_NATIVETOKEN_SEPOLIA", async () => {
  const payload: SendPayload = {
    amount: 0.001,
    token: {
      address: ETH_ADDRESS,
      decimal: 18,
    },
    receive: {
      receipt: BOB_WALLET_ADDRESS,
    },
  };
  const signer = getSigner(ALICE_WALLET_PRIVATEKEY, SEPOLIA_INFUA);
  //get calcuFee
  let response = await mindSAP.getCalcFee(signer, payload);
  assertResponse(response, "GET_CALC_FEE");

  payload.fee = response.result;
  payload.amount = 0.001;
  response = await mindSAP.send(signer, payload);
  assertResponse(response, "EOA_TO_EOASA_NATIVETOKEN_SEPOLIA");
});
