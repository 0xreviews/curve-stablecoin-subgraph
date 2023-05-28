import { expect } from "chai";
import { describe, it } from "mocha";
import { ethers, BigNumber } from "ethers";
import { sFrxETHAMMAddress } from "../src/deployment";
import {
  AMM_BASIC_QUERY,
  BADNDS_QUERY,
  MulticallInputs,
  USER_SHARES_QUERY,
  gql_base_amm,
  multicall,
  querygql,
} from "./utils";
const LLAMMA_ABI = require("../abis/LLAMMA.json");

describe("Bands", function() {
  describe("Bands x y", function() {
    this.timeout(150000);
    it("should every bands x,y amount correct", async function() {
      const {
        active_band,
        min_band,
        max_band,
        user_count,
      } = await gql_base_amm();
      console.log({ active_band, min_band, max_band, user_count });

      let batch_size = 50;
      let len = max_band - min_band + 1;
      let batch_num = Math.ceil(len / batch_size);

      for (let loopIndex = 0; loopIndex < batch_num; loopIndex++) {
        let begin_band = min_band + loopIndex * batch_size;
        let end_band = Math.min(
          min_band + (loopIndex + 1) * batch_size,
          max_band
        );
        let { data } = await querygql(BADNDS_QUERY, {
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

  describe("Bands providers", function() {
    this.timeout(150000);
    it("should every band providers correct", async function() {
      const {
        active_band,
        min_band,
        max_band,
        user_count,
      } = await gql_base_amm();

      let batch_size = 50;
      let len = max_band - min_band + 1;
      let batch_num = Math.ceil(len / batch_size);
      let gql_bands = {};

      for (let loopIndex = 0; loopIndex < batch_num; loopIndex++) {
        let begin_band = min_band + loopIndex * batch_size;
        let end_band = Math.min(
          min_band + (loopIndex + 1) * batch_size,
          max_band
        );
        let { data } = await querygql(BADNDS_QUERY, {
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
        for (let i = 0; i < data.bands.length; i++) {
          const band = data.bands[i];
          gql_bands[Number(band.index)] = {
            ...band,
          };
        }
        console.log(
          `From band ${begin_band} to band ${end_band}, gql num ${data.bands.length}`
        );
      }

      let gql_providers = {};
      for (let cur_band in gql_bands) {
        let _providers = gql_bands[cur_band]["providers"];
        for (let i = 0; i < _providers.length; i++) {
          const user_address = _providers[i]["user"];
          if (!(user_address in gql_providers)) {
            gql_providers[user_address] = {
              user_address,
              n1: _providers[i]["n1"],
              n2: _providers[i]["n2"],
            };
          }
        }
      }

      const providers = Object.keys(gql_providers);
      const providers_count = providers.length;

      batch_num = Math.ceil(providers_count / batch_size);
      let user_tick_numbers: any[] = [];

      for (let loopIndex = 0; loopIndex < batch_num; loopIndex++) {
        let begin_num = loopIndex * batch_size;
        let end_num = Math.min(providers_count, (loopIndex + 1) * batch_size);
        let inputs_user_tick_numbers: MulticallInputs = [];
        for (let j = begin_num; j < end_num; j++) {
          inputs_user_tick_numbers.push({
            target: sFrxETHAMMAddress,
            function: "read_user_tick_numbers",
            args: [providers[j]],
          });
        }
        const multiRes = await multicall(inputs_user_tick_numbers, LLAMMA_ABI);
        user_tick_numbers = user_tick_numbers.concat(multiRes as any[]);
        console.log(
          `From provider ${begin_num} to ${end_num}, multicall num ${multiRes.length}`
        );
      }

      for (let i = 0; i < user_tick_numbers.length; i++) {
        const user_address = gql_providers[i]
        const multicall_n1 = user_tick_numbers[i]["n1"]
        const multicall_n2 = user_tick_numbers[i]["n2"]
        for (let j = multicall_n1; j <= multicall_n2; j++) {
          const band_providers = gql_bands[j]["providers"].map(p => p['user'])
          expect(band_providers.find(user_address), `user ${user_address} should provide band ${j}`)
        }
      }
    });
  });
});
