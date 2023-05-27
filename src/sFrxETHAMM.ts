import { Address, BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  Deposit,
  SetAdminFee,
  SetFee,
  SetRate,
  TokenExchange,
  Withdraw,
  sFrxETHAMM,
} from "../generated/sFrxETHAMM/sFrxETHAMM";
import { sFrxETH } from "../generated/sFrxETH/sFrxETH";
import { sFrxETHChainlink } from "../generated/sFrxETHChainlink/sFrxETHChainlink";
import { sFrxETHSwapPool } from "../generated/sFrxETHSwapPool/sFrxETHSwapPool";
import {
  CHAINLINK_PRICE_PRECISION,
  DEAD_SHARES,
  INT_DECIMAL,
  MAX_SKIP_TICKS,
  SFRXETH_AMM_ID,
} from "./constance";
import {
  load_Band,
  load_Deposit,
  load_DetailedTrade,
  load_Share,
  load_UserStatus,
  load_Withdraw,
  load_sFrxETHAMM,
} from "./utils/loadOrCreateEntity";
import {
  sFrxETHAMMAddress,
  sFrxETHPriceOracleAddress,
  sFrxETHChainlinkAddress,
  sFrxETHSwapPoolAddress,
  sFrxETHAddress,
} from "./deployment";
import {
  get_x0,
  get_y0,
  insertUniqueElementFromArray,
  p_oracle_up,
  removeElementFromArray,
} from "./utils/utils";
import { Share } from "../generated/schema";

const sFrxETHAMMContract = sFrxETHAMM.bind(
  Address.fromString(sFrxETHAMMAddress)
);

const sFrxETHContract = sFrxETH.bind(Address.fromString(sFrxETHAddress));

const sFrxETHChainlinkContract = sFrxETHChainlink.bind(
  Address.fromString(sFrxETHChainlinkAddress)
);

const sFrxETHSwapPoolContract = sFrxETHSwapPool.bind(
  Address.fromString(sFrxETHSwapPoolAddress)
);

export function handleTokenExchange(event: TokenExchange): void {
  let buyer = event.params.buyer;
  let sold_id = event.params.sold_id;
  let tokens_sold = event.params.tokens_sold;
  let bought_id = event.params.bought_id;
  let tokens_bought = event.params.tokens_bought;

  let amm = load_sFrxETHAMM();

  // skip band
  if (amm.trade_count.isZero()) {
    if (amm.active_band.gt(amm.min_band)) amm.active_band = amm.min_band;
  }

  // price out
  {
    let callResult = sFrxETHAMMContract.try_price_oracle();
    if (!callResult.reverted) {
      amm.p_o = callResult.value;
    }
  }

  // chainlink_price (ETH/USD)
  let chainlink_price = BigInt.fromI32(0);
  {
    let callResult = sFrxETHChainlinkContract.try_latestRoundData();
    if (!callResult.reverted) {
      chainlink_price = callResult.value.value1
        .times(INT_DECIMAL)
        .div(CHAINLINK_PRICE_PRECISION);
    }
  }

  // frxETH/ETH swap pool get price
  let frxETHPrice = BigInt.fromI32(0);
  {
    let callResult = sFrxETHSwapPoolContract.try_get_p();
    if (!callResult.reverted) {
      frxETHPrice = callResult.value;
    }
  }

  // price_per_share
  let price_per_share = BigInt.fromI32(0);
  {
    let callResult = sFrxETHContract.try_pricePerShare();
    if (!callResult.reverted) {
      price_per_share = callResult.value;
    }
  }

  // market price = chainlink_price(ETH/USD) * frxETH price * price_per_share
  let market_price: BigInt = amm.p_o;
  if (
    !chainlink_price.isZero() &&
    !frxETHPrice.isZero() &&
    !price_per_share.isZero()
  ) {
    market_price = chainlink_price
      .times(frxETHPrice)
      .div(INT_DECIMAL)
      .times(price_per_share)
      .div(INT_DECIMAL);
  }

  let pump_in = sold_id.isZero();
  let n1 = amm.active_band.toI32();

  let avg_price = pump_in
    ? tokens_sold.times(INT_DECIMAL).div(tokens_bought)
    : tokens_bought.times(INT_DECIMAL).div(tokens_sold);
  let profit_rate = pump_in
    ? INT_DECIMAL.minus(avg_price.times(INT_DECIMAL).div(market_price))
    : avg_price
        .times(INT_DECIMAL)
        .div(market_price)
        .minus(INT_DECIMAL);

  amm.trade_count = amm.trade_count.plus(BigInt.fromI32(1));
  let trade = load_DetailedTrade(SFRXETH_AMM_ID, amm.trade_count);
  trade.buyer = buyer;
  trade.sold_id = sold_id;
  trade.tokens_sold = tokens_sold;
  trade.bought_id = bought_id;
  trade.tokens_bought = tokens_bought;
  trade.avg_price = avg_price;
  trade.oracle_price = amm.p_o;
  trade.market_price = market_price;
  trade.profit_rate = profit_rate;

  // target active band
  let target_band = pump_in ? n1 + MAX_SKIP_TICKS : n1 - MAX_SKIP_TICKS;
  {
    let callResult = sFrxETHAMMContract.try_active_band();
    if (!callResult.reverted) {
      amm.active_band = callResult.value;
      target_band = callResult.value.toI32();
    }
  }

  let n2 = n1;
  let amount_in_left = tokens_sold;
  let amount_out_left = tokens_bought;
  let ticks_in: BigInt[] = [];
  let ticks_out: BigInt[] = [];

  while (true) {
    let cur_band = BigInt.fromI32(n2);
    let band = load_Band(SFRXETH_AMM_ID, cur_band);
    // x in y out
    if (pump_in) {
      let old_y = band.y;

      // amount out bands_y
      let amount_out = amount_out_left.gt(old_y) ? old_y : amount_out_left;
      {
        let callResult = sFrxETHAMMContract.try_bands_y(cur_band);
        if (!callResult.reverted) {
          amount_out = old_y.minus(callResult.value);
          band.y = callResult.value;
        } else {
          band.y = old_y.minus(amount_out);
        }
      }
      ticks_out.push(amount_out);
      amount_out_left = amount_out_left.minus(amount_out);

      // bands_x
      let callResult = sFrxETHAMMContract.try_bands_x(cur_band);
      if (!callResult.reverted) {
        let amount_in = callResult.value.minus(band.x);
        band.x = callResult.value;
        ticks_in.push(amount_in);
        amount_in_left = amount_in_left.minus(amount_in);
      }
      band.save();

      if (n2 >= amm.max_band.toI32() || n2 >= target_band) break;
      n2 += 1;
    } else {
      // y in x out
      let old_x = band.x;

      // amount out bands_x
      let amount_out = amount_out_left.gt(band.x) ? band.x : amount_out_left;
      {
        let callResult = sFrxETHAMMContract.try_bands_x(cur_band);
        if (!callResult.reverted) {
          amount_out = old_x.minus(callResult.value);
          band.x = callResult.value;
        } else {
          band.x = old_x.minus(amount_out);
        }
      }
      amount_out_left = amount_out_left.minus(amount_out);
      ticks_out.push(amount_out);

      // bands_y
      let callResult = sFrxETHAMMContract.try_bands_y(cur_band);
      if (!callResult.reverted) {
        let amount_in = callResult.value.minus(band.y);
        band.y = callResult.value;
        ticks_in.push(amount_in);
        amount_in_left = amount_in_left.minus(amount_in);
      }

      band.save();
      if (n2 <= amm.min_band.toI32() || n2 <= target_band) break;
      n2 -= 1;
    }

    if (amount_out_left.isZero()) break;
  }

  // trade from n1 to n2
  trade.n1 = BigInt.fromI32(n1);
  trade.n2 = BigInt.fromI32(n2);
  trade.timestamp = event.block.timestamp;
  trade.ticks_in = ticks_in;
  trade.ticks_out = ticks_out;

  // x in y out
  if (pump_in) {
    amm.sum_x = amm.sum_x.plus(tokens_sold);
    amm.sum_y = amm.sum_y.minus(tokens_bought);
  } else {
    // y in x out
    amm.sum_x = amm.sum_x.minus(tokens_bought);
    amm.sum_y = amm.sum_y.plus(tokens_sold);
  }
  // @todo fees_x, fees_y

  trade.save();
  amm.save();
}

export function handleDeposit(event: Deposit): void {
  let provider = event.params.provider;
  let amount = event.params.amount;
  let n1 = event.params.n1;
  let n2 = event.params.n2;

  let entity = load_Deposit(SFRXETH_AMM_ID, provider, event.block.timestamp);
  entity.amount = amount;
  entity.n1 = n1;
  entity.n2 = n2;
  entity.tx = event.transaction.hash;

  let amm = load_sFrxETHAMM();
  amm.deposits = insertUniqueElementFromArray(entity.id, amm.deposits);
  amm.save();

  entity.save();
}

export function handleWithdraw(event: Withdraw): void {
  let provider = event.params.provider;
  let amount_borrowed = event.params.amount_borrowed;
  let amount_collateral = event.params.amount_collateral;

  let entity = load_Withdraw(SFRXETH_AMM_ID, provider, event.block.timestamp);
  entity.amount_borrowed = amount_borrowed;
  entity.amount_collateral = amount_collateral;
  entity.tx = event.transaction.hash;

  let amm = load_sFrxETHAMM();
  amm.withdraws = insertUniqueElementFromArray(entity.id, amm.withdraws);
  amm.save();

  entity.save();
}

// export function handleDeposit(event: Deposit): void {
//   let amm = load_sFrxETHAMM();
//   let provider = event.params.provider;
//   let amount = event.params.amount;
//   let n1 = event.params.n1;
//   let n2 = event.params.n2;

//   let user_ticks = load_UserStatus(SFRXETH_AMM_ID, provider);
//   user_ticks.n1 = n1;
//   user_ticks.n2 = n2;
//   user_ticks.y = user_ticks.y.plus(amount);

//   amm.min_band = n1.lt(amm.min_band) ? n1 : amm.min_band;
//   amm.max_band = n2.gt(amm.max_band) ? n2 : amm.max_band;

//   let N = n2.plus(BigInt.fromI32(1)).minus(n1);
//   let per_y = amount.div(N);

//   let ys: BigInt[];
//   {
//     let callResult = sFrxETHAMMContract.try_get_xy(provider);
//     if (!callResult.reverted) {
//       ys = callResult.value[1];
//     }
//   }

//   for (let i = 0; i < N.toI32(); i++) {
//     let cur_band = n1.plus(BigInt.fromI32(i));
//     let band = load_Band(SFRXETH_AMM_ID, cur_band);
//     let user_shares = load_Share(SFRXETH_AMM_ID, provider, cur_band);
//     let total_shares = load_Share(
//       SFRXETH_AMM_ID,
//       Bytes.fromHexString(sFrxETHAMMAddress),
//       cur_band
//     );

//     let cur_y = i < ys.length ? ys[i] : per_y;
//     let s = total_shares.share;

//     let ds = total_shares.share.isZero()
//       ? cur_y
//       : s
//           .plus(BigInt.fromI32(DEAD_SHARES))
//           .times(cur_y)
//           .div(band.y.plus(BigInt.fromI32(1)));
//     user_shares.share = user_shares.share.plus(ds);
//     total_shares.share = total_shares.share.plus(ds);

//     band.providers = insertUniqueElementFromArray(
//       user_ticks.id,
//       band.providers
//     );
//     user_ticks.ticks = insertUniqueElementFromArray(
//       user_shares.id,
//       user_ticks.ticks
//     );
//     amm.bands = insertUniqueElementFromArray(band.id, amm.bands);
//     amm.total_shares = insertUniqueElementFromArray(
//       total_shares.id,
//       amm.total_shares
//     );

//     band.y = band.y.plus(per_y);
//     {
//       let callResult = sFrxETHAMMContract.try_bands_y(cur_band);
//       if (!callResult.reverted) {
//         band.y = callResult.value;
//       }
//     }

//     band.save();
//     user_shares.save();
//     total_shares.save();
//   }

//   amm.user_shares = insertUniqueElementFromArray(
//     user_ticks.id,
//     amm.user_shares
//   );
//   amm.sum_y = amm.sum_y.plus(amount);

//   user_ticks.save();
//   amm.save();
// }

// export function handleWithdraw(event: Withdraw): void {
//   let amm = load_sFrxETHAMM();

//   let provider = event.params.provider;
//   let amount_borrowed = event.params.amount_borrowed;
//   let amount_collateral = event.params.amount_collateral;

//   let user_ticks = load_UserStatus(SFRXETH_AMM_ID, provider);
//   let n1 = user_ticks.n1;
//   let n2 = user_ticks.n2;
//   let ticks: string[] = [];

//   let N = n2.plus(BigInt.fromI32(1)).minus(n1);
//   let frac = INT_DECIMAL;

//   {
//     let callResult = sFrxETHAMMContract.try_min_band();
//     if (!callResult.reverted) {
//       amm.min_band = callResult.value;
//     }
//   }
//   {
//     let callResult = sFrxETHAMMContract.try_max_band();
//     if (!callResult.reverted) {
//       amm.max_band = callResult.value;
//     }
//   }

//   let remain_x = BigInt.fromI32(0);
//   let remain_y = BigInt.fromI32(0);
//   {
//     let callResult = sFrxETHAMMContract.try_get_sum_xy(provider);
//     if (!callResult.reverted) {
//       remain_x = callResult.value[0];
//       remain_y = callResult.value[1];
//     }
//   }

//   if (remain_x.isZero() && remain_y.isZero()) {
//     frac = INT_DECIMAL;
//   } else {
//     if (!amount_collateral.isZero()) {
//       frac = amount_collateral.times(INT_DECIMAL).div(amount_collateral.plus(remain_y));
//     } else {
//       frac = amount_borrowed.times(INT_DECIMAL).div(amount_borrowed.plus(remain_x));
//     }
//   }

//   for (let i = 0; i < N.toI32(); i++) {
//     let cur_band = n1.plus(BigInt.fromI32(i));
//     let band = load_Band(SFRXETH_AMM_ID, cur_band);
//     let user_shares = load_Share(SFRXETH_AMM_ID, provider, cur_band);
//     let total_shares = load_Share(
//       SFRXETH_AMM_ID,
//       Bytes.fromHexString(sFrxETHAMMAddress),
//       cur_band
//     );

//     let ds = BigInt.fromI32(0);
//     let dx = BigInt.fromI32(0);
//     let dy = BigInt.fromI32(0);

//     {
//       let callResult = sFrxETHAMMContract.try_bands_x(cur_band);
//       if (!callResult.reverted) {
//         dx = band.x.minus(callResult.value);
//         if (!dx.isZero()) {
//           ds = dx.times(INT_DECIMAL).div(band.x)
//         }
//         band.x = callResult.value;
//       }
//     }
//     {
//       let callResult = sFrxETHAMMContract.try_bands_y(cur_band);
//       if (!callResult.reverted) {
//         dy = band.y.minus(callResult.value);
//         if (!dy.isZero()) {
//           ds = dy.times(INT_DECIMAL).div(band.y)
//         }
//         band.y = callResult.value;
//       }
//     }

//     let user_ticks_share: Share = load_Share(SFRXETH_AMM_ID, provider, cur_band);
//     if (!user_ticks_share.share.isZero()) frac = ds.times(INT_DECIMAL).div(user_ticks_share.share);
//     if (!frac.isZero()) ticks.push(user_ticks_share.id);

//     if (frac.equals(INT_DECIMAL)) {
//       user_shares.share = BigInt.fromI32(0);
//       user_ticks.ticks = removeElementFromArray(user_shares.id, user_ticks.ticks);
//       band.providers = removeElementFromArray(user_ticks.id, band.providers);
//       amm.user_shares = removeElementFromArray(user_ticks.id, amm.user_shares);
//     } else {
//       user_shares.share = user_shares.share.minus(ds);
//     }
//     let s = total_shares.share;
//     total_shares.share = s.minus(ds).lt(BigInt.fromI32(DEAD_SHARES))
//       ? BigInt.fromI32(0)
//       : s.minus(ds);

//     band.save();
//     user_shares.save();
//     total_shares.save();
//   }

//   if (frac.equals(INT_DECIMAL)) {
//     user_ticks.n1 = BigInt.fromI32(0);
//     user_ticks.n2 = BigInt.fromI32(0);
//     user_ticks.x = BigInt.fromI32(0);
//     user_ticks.y = BigInt.fromI32(0);
//   } else {
//     user_ticks.x = user_ticks.x.minus(user_ticks.x.times(frac).div(INT_DECIMAL));
//     user_ticks.y = user_ticks.y.minus(user_ticks.y.times(frac).div(INT_DECIMAL));
//   }
//   user_ticks.ticks = ticks;

//   amm.sum_x = amm.sum_x.minus(amount_borrowed);
//   amm.sum_y = amm.sum_y.minus(amount_collateral);

//   user_ticks.save();
//   amm.save();
// }

export function handleSetRate(event: SetRate): void {
  let amm = load_sFrxETHAMM();

  amm.save();
}

export function handleSetFee(event: SetFee): void {
  let amm = load_sFrxETHAMM();

  amm.save();
}

export function handleSetAdminFee(event: SetAdminFee): void {
  let amm = load_sFrxETHAMM();

  amm.save();
}
