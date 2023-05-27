import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  UserState,
  Borrow,
  Repay,
  RemoveCollateral,
  Liquidate,
  SetMonetaryPolicy,
  SetBorrowingDiscounts,
  CollectFees
} from "../generated/sFrxETHController/sFrxETHController"

export function createUserStateEvent(
  user: Address,
  collateral: BigInt,
  debt: BigInt,
  n1: BigInt,
  n2: BigInt,
  liquidation_discount: BigInt
): UserState {
  let userStateEvent = changetype<UserState>(newMockEvent())

  userStateEvent.parameters = new Array()

  userStateEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  userStateEvent.parameters.push(
    new ethereum.EventParam(
      "collateral",
      ethereum.Value.fromUnsignedBigInt(collateral)
    )
  )
  userStateEvent.parameters.push(
    new ethereum.EventParam("debt", ethereum.Value.fromUnsignedBigInt(debt))
  )
  userStateEvent.parameters.push(
    new ethereum.EventParam("n1", ethereum.Value.fromSignedBigInt(n1))
  )
  userStateEvent.parameters.push(
    new ethereum.EventParam("n2", ethereum.Value.fromSignedBigInt(n2))
  )
  userStateEvent.parameters.push(
    new ethereum.EventParam(
      "liquidation_discount",
      ethereum.Value.fromUnsignedBigInt(liquidation_discount)
    )
  )

  return userStateEvent
}

export function createBorrowEvent(
  user: Address,
  collateral_increase: BigInt,
  loan_increase: BigInt
): Borrow {
  let borrowEvent = changetype<Borrow>(newMockEvent())

  borrowEvent.parameters = new Array()

  borrowEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  borrowEvent.parameters.push(
    new ethereum.EventParam(
      "collateral_increase",
      ethereum.Value.fromUnsignedBigInt(collateral_increase)
    )
  )
  borrowEvent.parameters.push(
    new ethereum.EventParam(
      "loan_increase",
      ethereum.Value.fromUnsignedBigInt(loan_increase)
    )
  )

  return borrowEvent
}

export function createRepayEvent(
  user: Address,
  collateral_decrease: BigInt,
  loan_decrease: BigInt
): Repay {
  let repayEvent = changetype<Repay>(newMockEvent())

  repayEvent.parameters = new Array()

  repayEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  repayEvent.parameters.push(
    new ethereum.EventParam(
      "collateral_decrease",
      ethereum.Value.fromUnsignedBigInt(collateral_decrease)
    )
  )
  repayEvent.parameters.push(
    new ethereum.EventParam(
      "loan_decrease",
      ethereum.Value.fromUnsignedBigInt(loan_decrease)
    )
  )

  return repayEvent
}

export function createRemoveCollateralEvent(
  user: Address,
  collateral_decrease: BigInt
): RemoveCollateral {
  let removeCollateralEvent = changetype<RemoveCollateral>(newMockEvent())

  removeCollateralEvent.parameters = new Array()

  removeCollateralEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  removeCollateralEvent.parameters.push(
    new ethereum.EventParam(
      "collateral_decrease",
      ethereum.Value.fromUnsignedBigInt(collateral_decrease)
    )
  )

  return removeCollateralEvent
}

export function createLiquidateEvent(
  liquidator: Address,
  user: Address,
  collateral_received: BigInt,
  stablecoin_received: BigInt,
  debt: BigInt
): Liquidate {
  let liquidateEvent = changetype<Liquidate>(newMockEvent())

  liquidateEvent.parameters = new Array()

  liquidateEvent.parameters.push(
    new ethereum.EventParam(
      "liquidator",
      ethereum.Value.fromAddress(liquidator)
    )
  )
  liquidateEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  liquidateEvent.parameters.push(
    new ethereum.EventParam(
      "collateral_received",
      ethereum.Value.fromUnsignedBigInt(collateral_received)
    )
  )
  liquidateEvent.parameters.push(
    new ethereum.EventParam(
      "stablecoin_received",
      ethereum.Value.fromUnsignedBigInt(stablecoin_received)
    )
  )
  liquidateEvent.parameters.push(
    new ethereum.EventParam("debt", ethereum.Value.fromUnsignedBigInt(debt))
  )

  return liquidateEvent
}

export function createSetMonetaryPolicyEvent(
  monetary_policy: Address
): SetMonetaryPolicy {
  let setMonetaryPolicyEvent = changetype<SetMonetaryPolicy>(newMockEvent())

  setMonetaryPolicyEvent.parameters = new Array()

  setMonetaryPolicyEvent.parameters.push(
    new ethereum.EventParam(
      "monetary_policy",
      ethereum.Value.fromAddress(monetary_policy)
    )
  )

  return setMonetaryPolicyEvent
}

export function createSetBorrowingDiscountsEvent(
  loan_discount: BigInt,
  liquidation_discount: BigInt
): SetBorrowingDiscounts {
  let setBorrowingDiscountsEvent = changetype<SetBorrowingDiscounts>(
    newMockEvent()
  )

  setBorrowingDiscountsEvent.parameters = new Array()

  setBorrowingDiscountsEvent.parameters.push(
    new ethereum.EventParam(
      "loan_discount",
      ethereum.Value.fromUnsignedBigInt(loan_discount)
    )
  )
  setBorrowingDiscountsEvent.parameters.push(
    new ethereum.EventParam(
      "liquidation_discount",
      ethereum.Value.fromUnsignedBigInt(liquidation_discount)
    )
  )

  return setBorrowingDiscountsEvent
}

export function createCollectFeesEvent(
  amount: BigInt,
  new_supply: BigInt
): CollectFees {
  let collectFeesEvent = changetype<CollectFees>(newMockEvent())

  collectFeesEvent.parameters = new Array()

  collectFeesEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )
  collectFeesEvent.parameters.push(
    new ethereum.EventParam(
      "new_supply",
      ethereum.Value.fromUnsignedBigInt(new_supply)
    )
  )

  return collectFeesEvent
}
