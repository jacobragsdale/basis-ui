/* The columns of the API's Arrow datasets, as the engine reads them. The document types an Arrow response only as
 * bytes, so the rows' types are written here from the API's description of each table; they type the pages'
 * layouts, so a misspelt column is a type error where it is written. */

interface Trade {
  readonly trade_id: number;
  readonly trade_date: string;
  readonly trade_time_utc: string;
  readonly settle_date: string;
  readonly fund: string;
  readonly strategy: string;
  readonly portfolio_manager: string;
  readonly book: string;
  readonly trader: string;
  readonly ticker: string;
  readonly asset_class: string;
  readonly side: string;
  readonly quantity: number;
  readonly price_local: number;
  readonly currency: string;
  readonly gross_amount_local: number;
  readonly commission_local: number;
  readonly net_amount_local: number;
  readonly broker: string | null;
  readonly venue: string | null;
  readonly order_type: string;
  readonly status: string;
}

interface Position {
  readonly position_id: number;
  readonly as_of_date: string;
  readonly fund: string;
  readonly strategy: string;
  readonly portfolio_manager: string;
  readonly book: string;
  readonly asset_class: string;
  readonly ticker: string;
  readonly security_name: string;
  readonly sector: string | null;
  readonly country: string;
  readonly region: string;
  readonly currency: string;
  readonly long_short: string;
  readonly quantity: number;
  readonly market_value_usd: number;
  readonly unrealized_pnl_usd: number;
  readonly daily_pnl_usd: number;
  readonly notional_usd: number;
  readonly duration: number | null;
  readonly dv01_usd: number | null;
  readonly credit_rating: string | null;
  readonly var_95_1d_usd: number | null;
}

interface BondRow {
  readonly cusip: string;
  readonly issuer: string;
  readonly ticker: string;
  readonly sector: string;
  readonly rating: string;
  readonly coupon_rate: number;
  readonly maturity_date: string;
  readonly years_to_maturity: number;
  readonly tenor_bucket: string;
  readonly price: number;
  readonly yield_to_maturity: number;
  readonly spread: number;
  readonly fitted_spread: number;
  readonly rich_cheap: number;
  readonly duration: number;
  readonly dv01_usd: number;
  readonly par: number;
  readonly market_value_usd: number;
}

interface AttributionRow {
  readonly date: string;
  readonly portfolio: string;
  readonly factor_group: string;
  readonly factor: string;
  readonly pnl_usd: number;
}

interface CurveRow {
  readonly curve_date: string;
  readonly tenor: string;
  readonly years: number;
  readonly yield: number;
  readonly change: number | null;
}

export type { AttributionRow, BondRow, CurveRow, Position, Trade };
