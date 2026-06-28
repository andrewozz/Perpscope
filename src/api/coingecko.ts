import { cachedFetchJson } from '../utils/httpCache';

const CACHE_TTL_MS = 60 * 60 * 1000; // market-cap ranking shifts slowly; refresh hourly

const STABLECOIN_SYMBOLS = new Set([
  'USDT', 'USDC', 'USDS', 'USD1', 'USDE', 'DAI', 'FDUSD', 'TUSD', 'PYUSD', 'USDD', 'GUSD', 'USDP', 'EURC', 'FRAX',
]);

// Wrapped / liquid-staking tokens that just track another asset's price and aren't perp-traded.
const WRAPPED_SYMBOLS = new Set([
  'WBTC', 'WETH', 'WSTETH', 'STETH', 'WEETH', 'WBETH', 'RETH', 'CBETH', 'METH', 'WHYPE', 'WBNB', 'SUSDE', 'LBTC',
]);

interface CoinGeckoMarket {
  symbol: string;
  name: string;
  market_cap_rank: number;
}

export interface TopAsset {
  symbol: string;
  name: string;
  rank: number;
}

/** Top N assets by market cap, excluding stablecoins. */
export async function fetchTopAssets(limit = 20): Promise<TopAsset[]> {
  const data = await cachedFetchJson<CoinGeckoMarket[]>(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=60&page=1&sparkline=false',
    CACHE_TTL_MS,
  );
  if (!data) return [];

  return data
    .filter((c) => {
      const sym = c.symbol.toUpperCase();
      return !STABLECOIN_SYMBOLS.has(sym) && !WRAPPED_SYMBOLS.has(sym);
    })
    .sort((a, b) => a.market_cap_rank - b.market_cap_rank)
    .slice(0, limit)
    .map((c) => ({ symbol: c.symbol.toUpperCase(), name: c.name, rank: c.market_cap_rank }));
}
