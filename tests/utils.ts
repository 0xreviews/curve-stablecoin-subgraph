import { ethers, BigNumber } from "ethers";
import { MultiCall } from "@indexed-finance/multicall";
import { Client, cacheExchange, fetchExchange } from '@urql/core';


import { sFrxETHAMMAddress } from "../src/deployment";

export const RPC_URL = "https://rpc.ankr.com/eth";
export const GQL_APIURL =
  "https://api.thegraph.com/subgraphs/name/0x-stan/curve-stablecoin";

const provider = new ethers.providers.JsonRpcBatchProvider(RPC_URL);

export async function multicall(
  inputs: { target: string; function: string; args: any[] }[],
  abi
) {
  const multi = new MultiCall(provider);

  const [blockNumber, res] = await multi.multiCall(abi, inputs);
  return res;
}

const client = new Client({
  url: GQL_APIURL,
  exchanges: [cacheExchange, fetchExchange],
});


export async function querygql(qeury, params) {
  return client.query(qeury, params).toPromise();
  //   .then((data) => console.log('Subgraph data: ', data))
  //   .catch((err) => {
  //     console.log('Error fetching data: ', err)
  //   })
}
