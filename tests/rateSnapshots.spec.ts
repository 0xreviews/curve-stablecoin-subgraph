import { expect } from "chai";
import { describe, it } from "mocha";
import { ethers, BigNumber } from "ethers";
import { sFrxETHAMMAddress } from "../src/deployment";
import {
  MulticallInputs,
  RATESNAPSHOTS_QUERY,
  multicall,
  querygql,
} from "./utils";

type RateSnapshot = {
  ts: number;
  rate: BigNumber;
};

describe("RateSnapshots", function() {
  this.timeout(150000);
  it("should every rateSnapshots rate correct", async function() {
    let gql_batch_size = 1000;
    let gql_query_index = 0;
    let gql_rateSnapshots: RateSnapshot[] = [];

    while (true) {
      let { data } = await querygql(RATESNAPSHOTS_QUERY, {
        skip: gql_query_index * gql_batch_size,
        size: gql_batch_size,
      });

      // sort gql rateSnapshots result
      for (let i = 0; i < data.rateSnapshots.length; i++) {
        const item = data.rateSnapshots[i];
        gql_rateSnapshots.push({
          ts: Number(item["timestamp"]),
          rate: BigNumber.from(item["rate"]),
        });
      }
      console.log(
        `BADNDSNAPSHOTS_QUERY data.length: ${data.rateSnapshots.length}`
      );
      if (data.rateSnapshots.length === 0) {
        break;
      }
      gql_query_index++;
    }

    let tmp_ts = 0;
    for (let i = 0; i < gql_rateSnapshots.length; i++) {
      const { ts, rate} = gql_rateSnapshots[i];
      expect(ts > tmp_ts, "should every RateSnapshot.timestamp correct");
      expect(rate.gt(0), "should every RateSnapshot.rate > 0");
    }

  });
});
