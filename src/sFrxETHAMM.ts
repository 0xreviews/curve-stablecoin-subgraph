import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  Deposit,
  SetAdminFee,
  SetFee,
  SetRate,
  TokenExchange,
  Withdraw,
  sFrxETHAMM,
} from "../generated/sFrxETHAMM/sFrxETHAMM";
import { INT_DECIMAL, MAX_SKIP_TICKS, SFRXETH_AMM_ID } from "./constance";
import {
  load_Band,
  load_BandDelta,
  load_Deposit,
  load_DetailedTrade,
  load_UserStatus,
  load_Withdraw,
  load_sFrxETHAMM,
} from "./utils/loadOrCreateEntity";
import { sFrxETHAMMAddress } from "./deployment";
import { insertUniqueElementFromArray } from "./utils/utils";
import { getSfrxETHMarketPrice } from "./utils/getSfrxETHMarketPrice";

const sFrxETHAMMContract = sFrxETHAMM.bind(
  Address.fromString(sFrxETHAMMAddress)
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

  {
    let callResult = sFrxETHAMMContract.try_min_band();
    if (!callResult.reverted) {
      amm.min_band = callResult.value;
    }
  }

  {
    let callResult = sFrxETHAMMContract.try_max_band();
    if (!callResult.reverted) {
      amm.max_band = callResult.value;
    }
  }

  let market_price = getSfrxETHMarketPrice()[0];
  if (market_price.isZero()) market_price = amm.p_o;

  let pump_in = sold_id.isZero();

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
  let n2 = amm.active_band.toI32();
  let n1 = n2;
  // let target_band = pump_in ? n1 + MAX_SKIP_TICKS : n1 - MAX_SKIP_TICKS;
  {
    let callResult = sFrxETHAMMContract.try_active_band();
    if (!callResult.reverted) {
      amm.active_band = callResult.value;
      // target_band = callResult.value.toI32();
      n2 = callResult.value.toI32();
    }
  }

  let amount_in_left = tokens_sold;
  let amount_out_left = tokens_bought;
  let ticks_in: BigInt[] = [];
  let ticks_out: BigInt[] = [];

  while (true) {
    let cur_band = BigInt.fromI32(n1);
    let band = load_Band(SFRXETH_AMM_ID, cur_band);
    let bandDelta = load_BandDelta(
      SFRXETH_AMM_ID,
      cur_band,
      event.block.timestamp
    );
    let old_x = band.x;
    let old_y = band.y;

    // update band.x band.y
    let retry_bandy_times = 0;
    while (retry_bandy_times < 10){
      let callResult = sFrxETHAMMContract.try_bands_y(cur_band);
      if (!callResult.reverted) {
        band.y = callResult.value;
        break;
      }
      retry_bandy_times++;
    }
    let retry_bandx_times = 0;
    while (retry_bandx_times < 10){
      let callResult = sFrxETHAMMContract.try_bands_x(cur_band);
      if (!callResult.reverted) {
        band.x = callResult.value;
      }
      retry_bandx_times++;
    }

    let dx = band.x.minus(old_x);
    let dy = band.y.minus(old_y);

    if (pump_in) {
      // x in y out
      amount_in_left = amount_in_left.minus(dx.abs());
      amount_out_left = amount_out_left.minus(dy.abs());
      
      ticks_in.push(dx.abs());
      ticks_out.push(dy.abs());

      if (
        n1 <= amm.min_band.toI32() ||
        amount_out_left.isZero() ||
        amount_out_left.lt(BigInt.fromI32(0))
      )
        break;
      n1 -= 1;
    } else {
      // y in x out
      amount_in_left = amount_in_left.minus(dy.abs());
      amount_out_left = amount_out_left.minus(dx.abs());
      
      ticks_in.push(dy.abs());
      ticks_out.push(dx.abs());

      if (
        n1 >= amm.min_band.toI32() ||
        amount_out_left.isZero() ||
        amount_out_left.lt(BigInt.fromI32(0))
      )
        break;
      n1 += 1;
    }

    // @todo update providers sum_x, sum_y

    bandDelta.dx = dx;
    bandDelta.dy = dy;
    bandDelta.market_price = market_price;
    bandDelta.oracle_price = amm.p_o;
    bandDelta.amm_event_type = "TokenExchange";

    bandDelta.save();
    band.save();

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
  let N = n2.minus(n1).plus(BigInt.fromI32(1));

  let entity = load_Deposit(SFRXETH_AMM_ID, provider, event.block.timestamp);
  entity.amount = amount;
  entity.n1 = n1;
  entity.n2 = n2;
  entity.tx = event.transaction.hash;

  let amm = load_sFrxETHAMM();
  amm.deposits = insertUniqueElementFromArray(entity.id, amm.deposits);

  // price out
  {
    let callResult = sFrxETHAMMContract.try_price_oracle();
    if (!callResult.reverted) {
      amm.p_o = callResult.value;
    }
  }

  let market_price = getSfrxETHMarketPrice()[0];
  if (market_price.isZero()) market_price = amm.p_o;

  let per_y = amount.div(N);
  for (let i = n1; i <= n2; i = i.plus(BigInt.fromI32(1))) {
    let bandDelta = load_BandDelta(SFRXETH_AMM_ID, i, event.block.timestamp);
    bandDelta.dy = per_y;
    bandDelta.market_price = market_price;
    bandDelta.oracle_price = amm.p_o;
    bandDelta.amm_event_type = "Deposit";
    bandDelta.save();
  }

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

  let user_status = load_UserStatus(SFRXETH_AMM_ID, provider);
  entity.n1 = user_status.n1;
  entity.n2 = user_status.n2;

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
