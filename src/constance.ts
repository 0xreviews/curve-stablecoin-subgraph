import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";

export const INT_DECIMAL = BigInt.fromString("1000000000000000000");
export const BIGDECIMAL_DECIMAL = BigDecimal.fromString("1000000000000000000");

export const SFRXETH_AMM_ID = "sFrxETHAMM";
export const SFRXETH_CONTROLLER_ID = "sFrxETHController";
export const MAX_SKIP_TICKS = 1024;
export const DEAD_SHARES = 1000;

// chainlink_aggregator.decimals() 8
export const CHAINLINK_PRICE_PRECISION = BigInt.fromString("100000000");