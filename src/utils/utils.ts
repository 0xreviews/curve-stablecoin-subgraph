import { Address, BigInt, Bytes, ethereum, log } from "@graphprotocol/graph-ts";
import { INT_DECIMAL } from "../constance";
import { sFrxETHAMM } from "../../generated/sFrxETHAMM/sFrxETHAMM";
import { sFrxETHAMMAddress } from "../deployment";

export function removeElementFromArray(
  element: string,
  arr: string[]
): string[] {
  let i = arr.indexOf(element);
  arr.splice(i, 1);

  return arr;
}

export function insertUniqueElementFromArray(
  element: string,
  arr: string[]
): string[] {
  let i = arr.indexOf(element);
  if (i < 0) arr.push(element);
  return arr;
}

export function initAddressZero(): Bytes {
  return Address.fromHexString("0x0000000000000000000000000000000000000000");
}

const A = BigInt.fromI32(100);
const Aminus1 = BigInt.fromI32(100 - 1);

export function get_y0(
  x: BigInt,
  y: BigInt,
  p_o: BigInt,
  p_o_up: BigInt
): BigInt {
  // solve:
  // p_o * A * y0**2 - y0 * (p_oracle_up/p_o * (A-1) * x + p_o**2/p_oracle_up * A * y) - xy = 0
  let b: BigInt = BigInt.fromI32(0);
  // p_o_up * unsafe_sub(A, 1) * x / p_o + A * p_o**2 / p_o_up * y / 10**18
  if (!x.isZero()) {
    b = p_o_up
      .times(Aminus1)
      .times(x)
      .div(p_o);
  }
  if (!y.isZero()) {
    b = b.plus(
      A.times(p_o.pow(2))
        .div(p_o_up)
        .times(y)
        .div(INT_DECIMAL)
    );
  }
  if (x.gt(BigInt.fromI32(0)) && y.gt(BigInt.fromI32(0))) {
    let D: BigInt = b.pow(2).plus(
      A.times(BigInt.fromI32(4))
        .times(p_o)
        .times(y)
        .div(INT_DECIMAL)
        .times(x)
    );
    return b
      .plus(D.sqrt())
      .times(INT_DECIMAL)
      .div(A.times(BigInt.fromI32(2)).times(p_o));
  } else {
    return b.times(INT_DECIMAL).div(A.times(p_o));
  }
}

export function get_x0(
  x: BigInt,
  y: BigInt,
  p_o: BigInt,
  p_o_up: BigInt
): BigInt {
  let y0 = get_y0(x, y, p_o, p_o_up);
  if (y0.isZero()) return BigInt.fromI32(0);

  let f = A.times(y0)
    .times(p_o)
    .div(p_o_up)
    .times(p_o)
    .div(INT_DECIMAL);
  let g = Aminus1.times(y0)
    .times(p_o_up)
    .div(p_o);
  let Inv = f.plus(x).times(g.plus(y));

  // x0 = Inv / g - f
  let x0 = Inv.div(g).minus(f);
  return x0;
}

export function p_oracle_up(n: BigInt, base_price: BigInt): BigInt {
  let c = Aminus1.times(INT_DECIMAL).div(A);
  let res = base_price;

  if (n.gt(BigInt.fromI32(0))) {
    for (let i = 0; i <= n.toI32(); i++) {
      res = res.times(c).div(INT_DECIMAL);
    }
  } else {
    for (let i = 0; i >= n.toI32(); i--) {
      res = res.times(INT_DECIMAL).div(c);
    }
  }

  return res;
}

export function getAMMEventType(event: ethereum.Event): string {
  let ammEventType = "";
  const tx_logs: ethereum.Log[] = (event.receipt as ethereum.TransactionReceipt).logs;
  if (tx_logs.length > 0) {
    log.warning("tx_logs", [tx_logs[0].logType.toString(), tx_logs[0].logType.toLowerCase()])
  }

  for (let i = 0; i < tx_logs.length; i++) {
    if (tx_logs[i].logType.toLowerCase() == "deposit") {
      ammEventType = "Deposit";
      break;
    } else if (tx_logs[i].logType.toLowerCase() == "withdraw") {
      ammEventType = "Withdraw";
      break;
    } else if (tx_logs[i].logType.toLowerCase() == "tokenexchange") {
      ammEventType = "TokenExchange";
      break;
    }
  }
  return ammEventType;
}
