import { expect } from "chai";
import { describe, it } from "mocha";
import { ethers, BigNumber } from "ethers";
import { sFrxETHAMMAddress } from "../src/deployment";
import { AMM_BASIC_QUERY, MulticallInputs, multicall, querygql } from "./utils";
const LLAMMA_ABI = require("../abis/LLAMMA.json");

describe("Bands", function() {
  describe("Bands x y", function() {
    this.timeout(150000);
    it("should every bands x,y amount correct", async function() {
      let base_res = await querygql(AMM_BASIC_QUERY, {});
      let active_band = Number(base_res.data.amms[0]["active_band"]);
      let min_band = Number(base_res.data.amms[0]["min_band"]);
      let max_band = Number(base_res.data.amms[0]["max_band"]);

      console.log({ active_band, min_band, max_band });

      let batch_size = 50;
      let len = max_band - min_band + 1;
      let batch_num = Math.ceil(len / batch_size);

      for (let loopIndex = 0; loopIndex < batch_num; loopIndex++) {
        let begin_band = min_band + loopIndex * batch_size;
        let end_band = Math.min(
          min_band + (loopIndex + 1) * batch_size,
          max_band
        );
        let { data } = await querygql(bands_query, {
          size: batch_size,
          begin_band: begin_band,
          end_band: end_band,
        });

        if (data.bands.length === 0) {
          console.log(
            `From band ${begin_band} to band ${end_band}, gql num is zero, skip test`
          );
          continue;
        }

        // sort gql bands result
        let gql_bands = {};
        for (let i = 0; i < data.bands.length; i++) {
          const band = data.bands[i];
          gql_bands[Number(band.index)] = {
            ...band,
          };
        }

        let inputs_x: MulticallInputs = [];
        let inputs_y: MulticallInputs = [];
        for (let i = begin_band; i < end_band; i++) {
          inputs_x.push({
            target: sFrxETHAMMAddress,
            function: "bands_x",
            args: [i],
          });
          inputs_y.push({
            target: sFrxETHAMMAddress,
            function: "bands_y",
            args: [i],
          });
        }
        const bands_x = await multicall(inputs_x, LLAMMA_ABI);
        const bands_y = await multicall(inputs_y, LLAMMA_ABI);

        for (let i = 0; i < bands_x.length; i++) {
          let cur_band = begin_band + i;
          if (i in gql_bands) {
            const gql_band = gql_bands[cur_band]["x"];
            const multicall_band = bands_x[i];
            expect(
              BigNumber.from(gql_band).eq(multicall_band),
              `should band_x(${begin_band + i}) correct.`
            );
          }
        }
        for (let i = 0; i < bands_y.length; i++) {
          let cur_band = begin_band + i;
          if (i in gql_bands) {
            const gql_band = gql_bands[cur_band]["y"];
            const multicall_band = bands_y[i];
            expect(
              BigNumber.from(gql_band).eq(multicall_band),
              `should band_y(${begin_band + i}) correct.`
            );
          }
        }
        console.log(
          `From band ${begin_band} to band ${end_band}, gql num ${data.bands.length}, multicall num ${bands_x.length}`
        );
      }

      console.log(
        `All bands x,y testing passed, from band ${min_band} to band ${max_band}.`
      );
    });
  });

  // @todo test band providers
});


const bands_query = `
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
  }
}
`;
