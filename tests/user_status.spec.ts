import { expect } from "chai";
import { describe, it } from "mocha";
import { ethers, BigNumber } from "ethers";
import { sFrxETHAMMAddress, sFrxETHControllerAddress } from "../src/deployment";
import { AMM_BASIC_QUERY, MulticallInputs, multicall, querygql } from "./utils";
const LLAMMA_ABI = require("../abis/LLAMMA.json");
const Controller_ABI = require("../abis/Controller.json");

describe("User Status", function() {
  describe("User Status", function() {
    this.timeout(150000);
    it("should every user's n1, n2, ticks correct", async function() {
      let base_res = await querygql(AMM_BASIC_QUERY, {});
      let user_count = Number(base_res.data.amms[0]["user_count"]);

      console.log({ user_count });

      let batch_size = 30;
      let batch_num = Math.ceil(user_count / batch_size);

      for (let loopIndex = 0; loopIndex < batch_num; loopIndex++) {
        let begin_num = loopIndex * batch_size;
        let end_num = Math.min((loopIndex + 1) * batch_size, user_count);
        let { data } = await querygql(USER_SHARES_QUERY, {
          size: batch_size,
          skip: begin_num,
        });
        const gql_res = data.amms[0].user_shares;
        console.log(gql_res);

        if (gql_res.length === 0) {
          console.log(
            `From user ${begin_num} to user ${end_num}, gql num is zero, skip test`
          );
          continue;
        }

        // sort gql bands result
        let gql_user_shares = {};
        for (let i = 0; i < gql_res.length; i++) {
          const s = gql_res[i];
          gql_user_shares[s.user] = {
            ...s,
          };
        }

        let inputs_user_tick_numbers: MulticallInputs = [];
        let inputs_user_state: MulticallInputs = [];
        for (let user_address in gql_user_shares) {
          inputs_user_tick_numbers.push({
            target: sFrxETHAMMAddress,
            function: "read_user_tick_numbers",
            args: [user_address],
          });
          inputs_user_state.push({
            target: sFrxETHControllerAddress,
            function: "user_state",
            args: [user_address],
          });
        }
        const user_tick_numbers = await multicall(
          inputs_user_tick_numbers,
          LLAMMA_ABI
        );
        const user_states = await multicall(
          inputs_user_state,
          Controller_ABI
        );

        for (let i = 0; i < user_tick_numbers.length; i++) {
          let cur_key = inputs_user_tick_numbers[i].args[0];
          if (cur_key in gql_user_shares) {
            const gql_n1 = gql_user_shares[cur_key]["n1"];
            const gql_n2 = gql_user_shares[cur_key]["n2"];
            const gql_ticks = gql_user_shares[cur_key]["ticks"];
            const gql_sum_x = gql_user_shares[cur_key]["sum_x"];
            const gql_sum_y = gql_user_shares[cur_key]["sum_y"];
            const gql_debt_amount = gql_user_shares[cur_key]["debt_amount"];
            const multicall_n1 = user_tick_numbers[i][0];
            const multicall_n2 = user_tick_numbers[i][1];
            const multicall_sum_x = user_states[i][1];
            const multicall_sum_y = user_states[i][0];
            const multicall_debt = user_states[i][2];
            const N = user_states[i][3];
            expect(
              BigNumber.from(gql_n1).eq(multicall_n1),
              `should user ${cur_key} n1 correct.`
            );
            expect(
              BigNumber.from(gql_n2).eq(multicall_n2),
              `should user ${cur_key} n2 correct.`
            );
            expect(
              BigNumber.from(gql_sum_x).eq(multicall_sum_x),
              `should user ${cur_key} sum_x correct.`
            );
            expect(
              BigNumber.from(gql_sum_y).eq(multicall_sum_y),
              `should user ${cur_key} sum_y correct.`
            );
            expect(
              BigNumber.from(gql_debt_amount).eq(multicall_debt),
              `should user ${cur_key} debt amount correct.`
            );

            for (let band_index = 0; band_index <= N.toNumber(); band_index++) {
              expect(gql_ticks[i] === gql_n1 + i, `should ticks[${i}].index equals band index`);
            }
          }
        }

        console.log(
          `From user ${begin_num} to user ${end_num}, gql num ${gql_res.length}, multicall num ${user_tick_numbers.length}`
        );
      }

      console.log(
        `All read_user_tick_numbers testing passed, total user count ${user_count}.`
      );
    });
  });
});

const USER_SHARES_QUERY = `
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
