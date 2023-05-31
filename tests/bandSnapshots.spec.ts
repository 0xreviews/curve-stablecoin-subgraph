import { expect } from "chai";
import { describe, it } from "mocha";
import { ethers, BigNumber } from "ethers";
import { sFrxETHAMMAddress } from "../src/deployment";
import {
  AMM_BASIC_QUERY,
  BADNDSNAPSHOTS_QUERY,
  MulticallInputs,
  USER_SHARES_QUERY,
  gql_base_amm,
  multicall,
  querygql,
} from "./utils";
const LLAMMA_ABI = require("../abis/LLAMMA.json");

type Band = {
  index: number,
  x: BigNumber,
  y: BigNumber,
}

type BandSnapshot = {
  ts: number;
  index: number;
  x: BigNumber;
  y: BigNumber;
  price: BigNumber;
  amm_event_type: string;
};

describe("BandSnapshots", function() {
  describe("BandSnapshots x y", function() {
    this.timeout(150000);
    it("should every bandSnapshots x,y amount correct", async function() {
      const {
        active_band,
        min_band,
        max_band,
        user_count,
      } = await gql_base_amm();
      console.log({ active_band, min_band, max_band, user_count });

      let gql_batch_size = 1000;
      let gql_query_index = 0;
      let gql_bandSnapshots: BandSnapshot[] = [];

      while (true) {

        let { data } = await querygql(BADNDSNAPSHOTS_QUERY, {
          skip: gql_query_index * gql_batch_size,
          size: gql_batch_size,
        });

        // sort gql bandSnapshots result
        for (let i = 0; i < data.bandSnapshots.length; i++) {
          const item = data.bandSnapshots[i];
          gql_bandSnapshots.push({
            ts: Number(item["timestamp"]),
            index: Number(item["index"]),
            x: BigNumber.from(item["x"]),
            y: BigNumber.from(item["y"]),
            price: BigNumber.from(item["market_price"]),
            amm_event_type: item["amm_event_type"],
          })
        }
        console.log(`BADNDSNAPSHOTS_QUERY data.length: ${data.bandSnapshots.length}`);
        if (data.bandSnapshots.length === 0) {
          break;
        }
        gql_query_index++;
      }

      let gql_bands: {[key: number]: Band}  = {};
      for (let i = 0; i < gql_bandSnapshots.length; i++) {
        const snap = gql_bandSnapshots[i];
        if (gql_bands[snap.index] == null) {
          gql_bands[snap.index] = {
            index: snap.index,
            x: BigNumber.from("0"),
            y: BigNumber.from("0"),
          }
        }
        gql_bands[snap.index].x = snap.x;
        gql_bands[snap.index].y = snap.y;
      }

      let batch_size = 50;
      let len = max_band - min_band + 1;
      let batch_num = Math.ceil(len / batch_size);

      for (let loopIndex = 0; loopIndex < batch_num; loopIndex++) {
        let begin_band = min_band + loopIndex * batch_size;
        let end_band = Math.min(
          min_band + (loopIndex + 1) * batch_size,
          max_band
        );

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
          if (gql_bands[cur_band] != null) {
            const gql_band = gql_bands[cur_band].x;
            const multicall_band = bands_x[i];
            expect(
              BigNumber.from(gql_band).eq(multicall_band),
              `should band_x(${begin_band + i}) correct.`
            );
          }
        }
        for (let i = 0; i < bands_y.length; i++) {
          let cur_band = begin_band + i;
          if (gql_bands[cur_band] != null) {
            const gql_band = gql_bands[cur_band].y;
            const multicall_band = bands_y[i];
            expect(
              BigNumber.from(gql_band).eq(multicall_band),
              `should band_y(${begin_band + i}) correct.`
            );
          }
        }

        console.log(
          `From band ${begin_band} to band ${end_band}, multicall num x ${bands_x.length} y ${bands_y.length}`
        );
      }

      console.log(
        `All latest bandSnapshots x,y testing passed, from band ${min_band} to band ${max_band}.`
      );
    });
  });

});
