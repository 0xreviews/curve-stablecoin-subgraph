import { expect } from "chai";
import { describe, it } from "mocha";
import { ethers, BigNumber } from 'ethers';
import {sFrxETHAMMAddress} from '../src/deployment';
import { RPC_URL, multicall, querygql } from "./utils";
const LLAMMA_ABI = require("../abis/LLAMMA.json");

const amm_qeury = `
{
  amms(first: 1) {
    id
    active_band
    min_band
    max_band
    p_o
    trade_count
  }
}
`

const bands_qeury = `
qeury Bands($size: BigInt!, $begin_band: BigInt!, $end_band: BigInt!) {
  bands(first: $size, orderBy: index, where: {
    index: { gte: $begin_band, lte: $end_band }
  }) {
    index
    x
    y
  }
}
`

describe("Bands", function() {
  describe("Bands x y", function() {
    this.timeout(150000);
    it("should every bands x,y amount correct", async function() {
      let base_res = await querygql(amm_qeury, {})
      let active_band = Number(base_res.data.amms[0]["active_band"]);
      let min_band = Number(base_res.data.amms[0]["min_band"]);
      let max_band = Number(base_res.data.amms[0]["max_band"]);
      
      console.log({ active_band, min_band, max_band})

      let batch_size = 50;
      let len = max_band - min_band + 1;
      let batch_times = Math.ceil(len/batch_size);
      // let multicall_bands_x: BigNumber[] = [];
      // let multicall_bands_y: BigNumber[] = [];
      // batch fetch bands x
      for (let loopIndex = 0; loopIndex < batch_times; loopIndex++) {
        let begin_band = min_band + loopIndex * batch_size;
        let end_band = Math.min(min_band + (loopIndex + 1) * batch_size, max_band);
        let { data } = await querygql(bands_qeury, {size: batch_size, begin_band, end_band })


        let inputs_x: { target: string, function: string, args: any[]}[] = [];
        let inputs_y: { target: string, function: string, args: any[]}[] = [];
        for (let i = begin_band; i <= end_band; i++) {
          inputs_x.push({ target: sFrxETHAMMAddress, function: 'bands_x', args: [i] });
          inputs_y.push({ target: sFrxETHAMMAddress, function: 'bands_y', args: [i] });
        }
        const bands_x = await multicall(inputs_x, LLAMMA_ABI);
        const bands_y = await multicall(inputs_y, LLAMMA_ABI);
        
        // multicall_bands_x = multicall_bands_x.concat(bands_x);
        // multicall_bands_y = multicall_bands_y.concat(bands_y);

        for (let i= 0; i < bands_x.length; i++) {
          const gql_band = data.bands[i]["x"];
          const multicall_band = bands_x[i];
          expect(BigNumber.from(gql_band).eq(multicall_band), `should band_x(${begin_band+i}) correct.`)
        }
        for (let i= 0; i < bands_y.length; i++) {
          const gql_band = data.bands[i]["y"];
          const multicall_band = bands_y[i];
          expect(BigNumber.from(gql_band).eq(multicall_band), `should band_y(${begin_band+i}) correct.`)
        }
      }
      

      console.log(`all bands x,y correct, test from band ${min_band} to band ${max_band}.`)
    });
  });
});
