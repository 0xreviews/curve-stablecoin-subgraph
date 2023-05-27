import { ethers, BigNumber } from "ethers";
import { MultiCall } from "@indexed-finance/multicall";
import { Client, cacheExchange, fetchExchange } from "@urql/core";

export const RPC_URL = "https://rpc.ankr.com/eth";
export const GQL_APIURL =
  "https://api.thegraph.com/subgraphs/name/0x-stan/curve-stablecoin";

const provider = new ethers.providers.JsonRpcBatchProvider(RPC_URL);
const multi = new MultiCall(provider);
const urql_client = new Client({
  url: GQL_APIURL,
  exchanges: [cacheExchange, fetchExchange],
});

export async function multicall(
  inputs: { target: string; function: string; args: any[] }[],
  abi
) {
  const [blockNumber, res] = await multi.multiCall(abi, inputs);
  return res;
}

export async function querygql(querystr: string, params: any) {
  return urql_client.query(querystr, params).toPromise();
}

export type MulticallInputs = {
  target: string;
  function: string;
  args: any[];
}[];


export const AMM_BASIC_QUERY = `
{
  amms(first: 1) {
    id
    active_band
    min_band
    max_band
    p_o
    user_count
    trade_count
  }
}
`;