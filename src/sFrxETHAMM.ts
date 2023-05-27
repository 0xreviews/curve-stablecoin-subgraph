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

      // @todo update providers sum_x, sum_y


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
