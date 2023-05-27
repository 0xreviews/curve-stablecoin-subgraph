# Curve-Stablecoin-subgraph

## Quick Start

```sh
npm install
```

```sh
npm run auto-deploy
```

## Example Query

```graphql
{
  amms(first: 1) {
    id
    active_band
    min_band
    max_band
    p_o
    trade_count
    user_shares(first: 10) {
      user
      n1
      n2
      ticks(orderBy: index) {
        index
        share
      }
    }
  }
  detailedTrades(first: 5, orderBy: timestamp, orderDirection: desc) {
    id
    buyer
    sold_id
    tokens_sold
    tokens_bought
    avg_price
    oracle_price
    market_price
    profit_rate
    n1
    n2
    ticks_in
    ticks_out
  }
  bands(first: 50, orderBy: index) {
    index
    x
    y
    providers {
      user
    }
  }
}
```
