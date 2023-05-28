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


export async function gql_base_amm() {
  let base_res = await querygql(AMM_BASIC_QUERY, {});
  let user_count = Number(base_res.data.amms[0]["user_count"]);
  let active_band = Number(base_res.data.amms[0]["active_band"]);
  let min_band = Number(base_res.data.amms[0]["min_band"]);
  let max_band = Number(base_res.data.amms[0]["max_band"]);

  return { active_band, min_band, max_band, user_count }
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

export const USER_SHARES_QUERY = `
query user_shares($size: Int!, $skip: Int!) {
  amms(first: 1) {
    user_shares (first: $size, skip: $skip, where: {
      or: [
    		{n1: 0, n2_not: 0},
    		{n1_not: 0, n2: 0},
    		{n1_not: 0, n2_not: 0},
      ],
    }) {
      user
      n1
      n2
      sum_x
      sum_y
      debt_amount
      ticks {
        index
        share
      }
    }
  }
}
`;

export const BADNDS_QUERY = `
query Bands($size: Int!, $begin_band: Int!, $end_band: Int!) {
  bands(
    first: $size,
    orderBy: index,
    where: {
      index_gte: $begin_band,
      index_lt: $end_band,
    }
  ) {
    index
    x
    y
    providers {
      user
      n1
      n2
    }
  }
}
`;