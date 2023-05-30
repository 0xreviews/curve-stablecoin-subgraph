import { Address, BigInt } from "@graphprotocol/graph-ts";
import { sFrxETHAMM } from "../../generated/sFrxETHAMM/sFrxETHAMM";
import { sFrxETH } from "../../generated/sFrxETH/sFrxETH";
import { sFrxETHChainlink } from "../../generated/sFrxETHChainlink/sFrxETHChainlink";
import { sFrxETHSwapPool } from "../../generated/sFrxETHSwapPool/sFrxETHSwapPool";
import {
  sFrxETHAMMAddress,
  sFrxETHAddress,
  sFrxETHChainlinkAddress,
  sFrxETHSwapPoolAddress,
} from "../deployment";
import { INT_DECIMAL } from "../constance";
import { CHAINLINK_PRICE_PRECISION } from "../constance";

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

export function getSfrxETHMarketPrice(): BigInt[] {
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
  let market_price: BigInt = BigInt.fromI32(0);
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

  return [ market_price, chainlink_price, frxETHPrice, price_per_share ];
}
