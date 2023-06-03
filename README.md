# Curve Stablecoin subgraph

## Get Started

install

```sh
npm install
```

deploy to TheGraph hosted-service

```sh
npm run auto-deploy
```

test graph data with on-chain data.

```sh
npm run test
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
    user_count
    user_shares(first: 5, orderBy: sum_y, orderDirection: desc) {
      user
      sum_x
      sum_y
      n1
      n2
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
  bands(first: 5, orderBy: index) {
    index
    x
    y
  }
  bandSnapshots(first: 5, orderBy: timestamp) {
    index
    x
    y
    market_price
    timestamp
  }
  rateSnapshots(first: 5, orderBy: timestamp) {
    rate
    timestamp
  }
}
```
