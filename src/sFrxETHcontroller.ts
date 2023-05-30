import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  sFrxETHController,
  UserState,
  Borrow,
  Repay,
  RemoveCollateral,
  Liquidate,
  SetMonetaryPolicy,
  SetBorrowingDiscounts,
  CollectFees,
} from "../generated/sFrxETHController/sFrxETHController";
import {
  load_Band,
  load_BandDelta,
  load_Borrow,
  load_Liquidate,
  load_RemoveCollateral,
  load_Repay,
  load_Share,
  load_UserStatus,
  load_sFrxETHAMM,
} from "./utils/loadOrCreateEntity";
import { INT_DECIMAL, SFRXETH_AMM_ID } from "./constance";
import { sFrxETHAMMAddress, sFrxETHControllerAddress } from "./deployment";
import {
  getAMMEventType,
  insertUniqueElementFromArray,
  removeElementFromArray,
} from "./utils/utils";
import { sFrxETHAMM } from "../generated/sFrxETHAMM/sFrxETHAMM";
import { getSfrxETHMarketPrice } from "./utils/getSfrxETHMarketPrice";

const sFrxETHAMMContract = sFrxETHAMM.bind(
  Address.fromString(sFrxETHAMMAddress)
);

const sFrxETHControllerContract = sFrxETHController.bind(
  Address.fromString(sFrxETHControllerAddress)
);

export function handleUserState(event: UserState): void {
  let amm = load_sFrxETHAMM();
  let user = event.params.user;
  let collateral = event.params.collateral;
  let debt = event.params.debt;
  let n1 = event.params.n1;
  let n2 = event.params.n2;
  let liquidation_discount = event.params.liquidation_discount;
  let user_status = load_UserStatus(SFRXETH_AMM_ID, user);
  let N = n2
    .plus(BigInt.fromI32(1))
    .minus(n1)
    .toI32();

  // update n1,n2 liquidation_discount
  user_status.n1 = n1;
  user_status.n2 = n2;
  user_status.liquidation_discount = liquidation_discount;

  amm.min_band = n1.lt(amm.min_band) ? n1 : amm.min_band;
  amm.max_band = n2.gt(amm.max_band) ? n2 : amm.max_band;

  let ammEventType = getAMMEventType(event);

  let ticks: string[] = [];

  let xs: BigInt[] = [];
  let ys: BigInt[] = [];
  {
    let callResult = sFrxETHAMMContract.try_get_xy(user);
    if (!callResult.reverted) {
      xs = callResult.value[0];
      ys = callResult.value[1];
    }
  }

  // update status from band n1 to band n2
  for (let i = 0; i < N; i++) {
    const cur_band = n1.plus(BigInt.fromI32(i));
    const band = load_Band(SFRXETH_AMM_ID, cur_band);
    const user_shares = load_Share(SFRXETH_AMM_ID, user, cur_band);
    const total_shares = load_Share(
      SFRXETH_AMM_ID,
      Bytes.fromHexString(sFrxETHAMMAddress),
      cur_band
    );
    let old_total_share = total_shares.share;
    const old_x = band.x;
    const old_y = band.y;

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

    let ds = BigInt.fromI32(0);

    // check if user repay remove all collateral and debt
    if (collateral.isZero() && debt.isZero()) {
      // decrease amm.total_shares
      ds = user_shares.share;
      total_shares.share = old_total_share.minus(ds);
      // remove UserStatus
      user_status.n1 = BigInt.fromI32(0);
      user_status.n2 = BigInt.fromI32(0);
      user_status.sum_x = BigInt.fromI32(0);
      user_status.sum_y = BigInt.fromI32(0);
      user_status.collateral_amount = BigInt.fromI32(0);
      user_status.debt_amount = BigInt.fromI32(0);
      user_status.liquidation_discount = BigInt.fromI32(0);
      // remove AMM.user_shares
      user_shares.share = BigInt.fromI32(0);
      amm.user_shares = removeElementFromArray(user_status.id, amm.user_shares);
      // remove band.providers
      band.providers = removeElementFromArray(user_status.id, band.providers);
    } else {
      // calc ds
      let new_share = BigInt.fromI32(0);
      if (old_total_share.isZero()) {
        if (ys[i].isZero()) {
          new_share = xs[i];
        } else {
          new_share = ys[i];
        }
      } else {
        if (ys[i].isZero()) {
          new_share = xs[i].times(INT_DECIMAL).div(band.x);
        } else {
          new_share = ys[i].times(INT_DECIMAL).div(band.y);
        }
      }

      ds = new_share.minus(user_shares.share);
      user_shares.share = new_share;
      total_shares.share = total_shares.share.plus(ds);
      ticks.push(user_shares.id);
      // update AMM.user_shares
      amm.user_shares = insertUniqueElementFromArray(
        user_status.id,
        amm.user_shares
      );
      // update band.providers
      band.providers = insertUniqueElementFromArray(
        user_status.id,
        band.providers
      );
    }

    // Only Withdraw event update bandelta,
    // Deposits and TokenExchange have already updated.
    if (ammEventType === 'Withdraw') {
      // delta band x,y
      let bandDelta = load_BandDelta(
        SFRXETH_AMM_ID,
        cur_band,
        event.block.timestamp
      );
      bandDelta.dx = band.x.minus(old_x);
      bandDelta.dy = band.y.minus(old_y);
      bandDelta.market_price = getSfrxETHMarketPrice()[0];
      bandDelta.oracle_price = amm.p_o;
      bandDelta.amm_event_type = ammEventType;
      bandDelta.save();
    }

    band.save();
    user_shares.save();
    total_shares.save();
  }
  user_status.ticks = ticks;

  // update `user_status.debt_amount` `user_status.collateral_amount`
  user_status.collateral_amount = collateral;
  user_status.debt_amount = debt;

  // update user_status.x , y
  {
    let callResult = sFrxETHAMMContract.try_get_sum_xy(user);
    if (!callResult.reverted) {
      user_status.sum_x = callResult.value[0];
      user_status.sum_y = callResult.value[1];
    }
  }

  // amm.user_count
  {
    let callResult = sFrxETHControllerContract.try_n_loans();
    if (!callResult.reverted) {
      amm.user_count = callResult.value;
    }
  }

  user_status.save();
  amm.save();
}

export function handleBorrow(event: Borrow): void {
  let user = event.params.user;
  let collateral_increase = event.params.collateral_increase;
  let loan_increase = event.params.loan_increase;

  let entity = load_Borrow(SFRXETH_AMM_ID, user, event.block.timestamp);
  entity.collateral_increase = collateral_increase;
  entity.loan_increase = loan_increase;
  entity.tx = event.transaction.hash;

  let user_status = load_UserStatus(SFRXETH_AMM_ID, user);
  user_status.borrows = insertUniqueElementFromArray(
    entity.id,
    user_status.borrows
  );
  user_status.save();

  entity.save();
}

export function handleRepay(event: Repay): void {
  let user = event.params.user;
  let collateral_decrease = event.params.collateral_decrease;
  let loan_decrease = event.params.loan_decrease;

  let entity = load_Repay(SFRXETH_AMM_ID, user, event.block.timestamp);
  entity.collateral_decrease = collateral_decrease;
  entity.loan_decrease = loan_decrease;
  entity.tx = event.transaction.hash;

  let user_status = load_UserStatus(SFRXETH_AMM_ID, user);
  user_status.repays = insertUniqueElementFromArray(
    entity.id,
    user_status.repays
  );
  user_status.save();

  entity.save();
}

export function handleRemoveCollateral(event: RemoveCollateral): void {
  let user = event.params.user;
  let collateral_decrease = event.params.collateral_decrease;

  let entity = load_RemoveCollateral(
    SFRXETH_AMM_ID,
    user,
    event.block.timestamp
  );
  entity.collateral_decrease = collateral_decrease;
  entity.tx = event.transaction.hash;

  let user_status = load_UserStatus(SFRXETH_AMM_ID, user);
  user_status.removeCollaterals.push(entity.id);
  user_status.save();

  entity.save();
}

export function handleLiquidate(event: Liquidate): void {
  let user = event.params.user;
  let liquidator = event.params.liquidator;
  let collateral_received = event.params.collateral_received;
  let stablecoin_received = event.params.stablecoin_received;
  let debt = event.params.collateral_received;

  let entity = load_Liquidate(SFRXETH_AMM_ID, user, event.block.timestamp);
  entity.liquidator = liquidator;
  entity.collateral_received = collateral_received;
  entity.stablecoin_received = stablecoin_received;
  entity.debt = debt;
  entity.tx = event.transaction.hash;

  let user_status = load_UserStatus(SFRXETH_AMM_ID, user);
  user_status.liquidates = insertUniqueElementFromArray(
    entity.id,
    user_status.liquidates
  );
  user_status.save();

  entity.save();
}

export function handleSetMonetaryPolicy(event: SetMonetaryPolicy): void {}

export function handleSetBorrowingDiscounts(
  event: SetBorrowingDiscounts
): void {}

export function handleCollectFees(event: CollectFees): void {}
