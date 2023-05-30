import {
  BigInt,
  Bytes,
  Address,
  ethereum,
  BigDecimal,
} from "@graphprotocol/graph-ts";
import {
  Band,
  Share,
  UserStatus,
  Token,
  AMM,
  DetailedTrade,
  Deposit,
  Withdraw,
  Borrow,
  Repay,
  RemoveCollateral,
  Liquidate,
  BandDelta,
} from "../../generated/schema";
import { initAddressZero } from "./utils";
import {
  crvUSDAddress,
  sFrxETHControllerAddress,
  sFrxETHAMMAddress,
  sFrxETHAddress,
} from "../deployment";
import { sFrxETHController } from "../../generated/sFrxETHController/sFrxETHController";
import { sFrxETHAMM } from "../../generated/sFrxETHAMM/sFrxETHAMM";
import { MAX_SKIP_TICKS, SFRXETH_AMM_ID } from "../constance";

const sFrxETHAMMContract = sFrxETHAMM.bind(
  Address.fromString(sFrxETHAMMAddress)
);

const sFrxETHControllerContract = sFrxETHController.bind(
  Address.fromString(sFrxETHControllerAddress)
);

export function load_Band(AMMID: string, index: BigInt): Band {
  let id = AMMID.toString() + "_" + index.toString();
  let entity = Band.load(id);
  if (entity == null) {
    entity = new Band(id);
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.index = index;
    entity.x = BigInt.fromI32(0);
    entity.y = BigInt.fromI32(0);
    entity.providers = [];
  }
  return entity;
}

export function load_Share(AMMID: string, user: Bytes, index: BigInt): Share {
  // if total_share user address will be AMM address
  let id = AMMID + "_" + user.toHexString() + "_" + index.toString();
  let entity = Share.load(id);
  if (entity == null) {
    entity = new Share(id);
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.user = user;
    entity.index = index;
    entity.share = BigInt.fromI32(0);
  }
  return entity;
}

export function load_UserStatus(AMMID: string, user: Bytes): UserStatus {
  let id = AMMID + "_" + user.toHexString();
  let entity = UserStatus.load(id);
  if (entity == null) {
    entity = new UserStatus(id);
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.user = user;
    entity.n1 = BigInt.fromI32(0);
    entity.n2 = BigInt.fromI32(0);
    entity.sum_x = BigInt.fromI32(0);
    entity.sum_y = BigInt.fromI32(0);
    entity.collateral_amount = BigInt.fromI32(0);
    entity.debt_amount = BigInt.fromI32(0);
    entity.liquidation_discount = BigInt.fromI32(0);
    entity.ticks = [];
    entity.borrows = [];
    entity.repays = [];
    entity.removeCollaterals = [];
    entity.liquidates = [];
  }
  return entity;
}

export function load_DetailedTrade(AMMID: string, count: BigInt): DetailedTrade {
  let id = AMMID + "_" + count.toString();
  let entity = DetailedTrade.load(id);
  if (entity == null) {
    entity = new DetailedTrade(id);
    entity.buyer = initAddressZero();
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.sold_id = BigInt.fromI32(0);
    entity.tokens_sold = BigInt.fromI32(0);
    entity.bought_id = BigInt.fromI32(1);
    entity.tokens_bought = BigInt.fromI32(0);
    entity.n1 = BigInt.fromI32(0);
    entity.n2 = BigInt.fromI32(0);
    entity.ticks_in = [];
    entity.ticks_out = [];
    entity.timestamp = BigInt.fromI32(0);
  }
  return entity;
}

export function load_sFrxETHAMM(): AMM {
  let entity = AMM.load(SFRXETH_AMM_ID);
  if (entity == null) {
    entity = new AMM(SFRXETH_AMM_ID);
    entity.address = Bytes.fromHexString(sFrxETHAMMAddress);
    // borrowed token
    {
      let token = new Token(crvUSDAddress);
      token.name = "Curve.Fi USD Stablecoin";
      token.symbol = "crvUSD";
      token.decimals = BigInt.fromI32(18);
      token.address = Bytes.fromHexString(crvUSDAddress);
      token.save();
      entity.BORROWED_TOKEN = token.id;
      entity.BORROWED_PRECISION = BigInt.fromI32(1);
    }
    // collateral token
    {
      let token = new Token(sFrxETHAddress);
      token.name = "Staked Frax Ether";
      token.symbol = "sfrxETH";
      token.decimals = BigInt.fromI32(18);
      token.address = Bytes.fromHexString(sFrxETHAddress);
      token.save();
      entity.COLLATERAL_TOKEN = token.id;
      entity.COLLATERAL_PRECISION = BigInt.fromI32(1);
    }

    entity = _initAMMEntity(sFrxETHAMMContract, entity);
  }
  return entity;
}

function _initAMMEntity(AMMContract: sFrxETHAMM, entity: AMM): AMM {
  entity.fees_x = BigInt.fromI32(0);
  entity.fees_y = BigInt.fromI32(0);
  entity.admin_fees_x = BigInt.fromI32(0);
  entity.admin_fees_y = BigInt.fromI32(0);
  entity.sum_x = BigInt.fromI32(0);
  entity.sum_y = BigInt.fromI32(0);
  entity.bands = [];
  entity.total_shares = [];
  entity.user_shares = [];
  entity.trades = [];
  entity.user_count = BigInt.fromI32(0);
  entity.trade_count = BigInt.fromI32(0);
  entity.deposits = [];
  entity.withdraws = [];

  // base price
  {
    let callResult = AMMContract.try_get_base_price();
    if (!callResult.reverted) {
      entity.BASE_PRICE = callResult.value;
    } else {
      entity.BASE_PRICE = BigInt.fromString("1873947590020587821667");
    }
  }

  // A
  {
    let callResult = AMMContract.try_A();
    if (!callResult.reverted) {
      entity.A = callResult.value;
    } else {
      entity.A = BigInt.fromI32(100);
    }
  }

  // fee
  {
    let callResult = AMMContract.try_fee();
    if (!callResult.reverted) {
      entity.fee = callResult.value;
    } else {
      entity.fee = BigInt.fromString("6000000000000000");
    }
  }

  // admin_fee
  {
    let callResult = AMMContract.try_admin_fee();
    if (!callResult.reverted) {
      entity.admin_fee = callResult.value;
    } else {
      entity.admin_fee = BigInt.fromI32(0);
    }
  }

  // rate
  {
    let callResult = AMMContract.try_rate();
    if (!callResult.reverted) {
      entity.rate = callResult.value;
    } else {
      entity.rate = BigInt.fromString("1040334742");
    }
  }

  // active_band
  {
    let callResult = AMMContract.try_active_band();
    if (!callResult.reverted) {
      entity.active_band = callResult.value;
    } else {
      entity.active_band = BigInt.fromI32(0);
    }
  }

  // min_band
  {
    let callResult = AMMContract.try_min_band();
    if (!callResult.reverted) {
      entity.min_band = callResult.value;
    } else {
      entity.min_band = BigInt.fromI32(0);
    }
  }

  // max_band
  {
    let callResult = AMMContract.try_max_band();
    if (!callResult.reverted) {
      entity.max_band = callResult.value;
    } else {
      entity.max_band = BigInt.fromI32(0);
    }
  }

  // price_oracle_contract
  {
    let callResult = AMMContract.try_price_oracle_contract();
    if (!callResult.reverted) {
      entity.price_oracle_contract = callResult.value;
    } else {
      entity.price_oracle_contract = initAddressZero();
    }
  }

  // price out
  {
    let callResult = AMMContract.try_price_oracle();
    if (!callResult.reverted) {
      entity.p_o = callResult.value;
    } else {
      entity.p_o = entity.BASE_PRICE;
    }
  }

  // user_count
  {
    let callResult = sFrxETHControllerContract.try_n_loans();
    if (!callResult.reverted) {
      entity.user_count = callResult.value;
    }
  }

  // // init bands
  // for (let i = entity.min_band.toI32(); i <= entity.max_band.toI32(); i++) {
  //   let band = load_Band(SFRXETH_AMM_ID, BigInt.fromI32(i));
  //   band.save();
  // }

  return entity;
}


export function load_Deposit(AMMID: string, user: Bytes, ts: BigInt): Deposit {
  let id = AMMID.toString() + "_" + user.toHexString() + "_" + ts.toString();
  let entity = Deposit.load(id);
  if (entity == null) {
    entity = new Deposit(id);
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.provider = user;
    entity.amount = BigInt.fromI32(0);
    entity.n1 = BigInt.fromI32(0);
    entity.n2 = BigInt.fromI32(0);
    entity.timestamp = ts;
    entity.tx = Bytes.empty();
  }
  return entity;
}

export function load_Withdraw(AMMID: string, user: Bytes, ts: BigInt): Withdraw {
  let id = AMMID.toString() + "_" + user.toHexString() + "_" + ts.toString();
  let entity = Withdraw.load(id);
  if (entity == null) {
    entity = new Withdraw(id);
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.provider = user;
    entity.amount_borrowed = BigInt.fromI32(0);
    entity.amount_collateral = BigInt.fromI32(0);
    entity.n1 = BigInt.fromI32(0);
    entity.n2 = BigInt.fromI32(0);
    entity.timestamp = ts;
    entity.tx = Bytes.empty();
  }
  return entity;
}

export function load_Borrow(AMMID: string, user: Bytes, ts: BigInt): Borrow {
  let id = AMMID.toString() + "_" + user.toHexString() + "_" + ts.toString();
  let entity = Borrow.load(id);
  if (entity == null) {
    entity = new Borrow(id);
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.user = user;
    entity.collateral_increase = BigInt.fromI32(0);
    entity.loan_increase = BigInt.fromI32(0);
    entity.timestamp = ts;
    entity.tx = Bytes.empty();
  }
  return entity;
}

export function load_Repay(AMMID: string, user: Bytes, ts: BigInt): Repay {
  let id = AMMID.toString() + "_" + user.toHexString() + "_" + ts.toString();
  let entity = Repay.load(id);
  if (entity == null) {
    entity = new Repay(id);
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.user = user;
    entity.collateral_decrease = BigInt.fromI32(0);
    entity.loan_decrease = BigInt.fromI32(0);
    entity.timestamp = ts;
    entity.tx = Bytes.empty();
  }
  return entity;
}

export function load_RemoveCollateral(AMMID: string, user: Bytes, ts: BigInt): RemoveCollateral {
  let id = AMMID.toString() + "_" + user.toHexString() + "_" + ts.toString();
  let entity = RemoveCollateral.load(id);
  if (entity == null) {
    entity = new RemoveCollateral(id);
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.user = user;
    entity.collateral_decrease = BigInt.fromI32(0);
    entity.timestamp = ts;
    entity.tx = Bytes.empty();
  }
  return entity;
}

export function load_Liquidate(AMMID: string, user: Bytes, ts: BigInt): Liquidate {
  let id = AMMID.toString() + "_" + user.toHexString() + "_" + ts.toString();
  let entity = Liquidate.load(id);
  if (entity == null) {
    entity = new Liquidate(id);
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.user = user;
    entity.liquidator = Bytes.empty();
    entity.collateral_received = BigInt.fromI32(0);
    entity.stablecoin_received = BigInt.fromI32(0);
    entity.debt = BigInt.fromI32(0);
    entity.timestamp = ts;
    entity.tx = Bytes.empty();
  }
  return entity;
}

export function load_BandDelta(AMMID: string, index: BigInt, ts: BigInt): BandDelta {
  let id = AMMID.toString() + "_" + index.toHexString() + "_" + ts.toString();
  let entity = BandDelta.load(id);
  if (entity == null) {
    entity = new BandDelta(id);
    if (AMMID == SFRXETH_AMM_ID) {
      entity.AMM = load_sFrxETHAMM().id;
    } else {
      entity.AMM = load_sFrxETHAMM().id;
    }
    entity.index = index;
    entity.dx = BigInt.fromI32(0);
    entity.dy = BigInt.fromI32(0);
    entity.market_price = BigInt.fromI32(0);
    entity.oracle_price = BigInt.fromI32(0);
    entity.amm_event_type = "";
    // entity.trigger_id = "";
    entity.timestamp = ts;
  }
  return entity;
}