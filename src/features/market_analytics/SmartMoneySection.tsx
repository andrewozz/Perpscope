import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import InsightCard from './InsightCard';
import { MOCK_INFLOW } from './mockData';
import {
  pctFrac,
  signedPctFrac,
  truncAddr,
  type PositioningRow,
  type TraderPositionRow,
  type TraderRow,
} from './types';
import { formatCompactUsd } from '../../utils/format';

// null-safe metric formatters for the leaderboard
const fmtNum = (v: number | null, dp: number) => (v == null ? '—' : v.toFixed(dp));
const fmtPctSigned = (v: number | null, dp: number) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(dp)}%`;

interface TopHolding {
  coin: string;
  direction: string;
  valueUsd: number;
}

// for each trader, find their single largest position by notional value
function buildTopHoldings(positions: TraderPositionRow[]): Map<string, TopHolding> {
  const best = new Map<string, TopHolding>();
  for (const p of positions) {
    const cur = best.get(p.trader_address);
    if (!cur || p.position_value_usd > cur.valueUsd) {
      best.set(p.trader_address, { coin: p.coin, direction: p.direction, valueUsd: p.position_value_usd });
    }
  }
  return best;
}

export default function SmartMoneySection({
  activeTraders,
  traderPositions,
  positioning,
}: {
  activeTraders: TraderRow[];
  traderPositions: TraderPositionRow[];
  positioning: PositioningRow[];
}) {
  // The export already filters to in_cohort = active traders (real 30d volume
  // or an open position) ranked by 30d PnL -- see int_active_cohort.sql. Cohort
  // size is dynamic (however many candidates turned out active, capped at 100),
  // not a fixed 100, so we read the real count instead of hardcoding it.
  const topHoldings = buildTopHoldings(traderPositions);
  const cohortSize = positioning[0]?.cohort_size ?? activeTraders.length;

  const posData = [...positioning]
    .sort((a, b) => b.pct_long - a.pct_long)
    .slice(0, 10)
    .map((p) => ({
      coin: p.coin,
      Long: p.pct_long,
      Short: p.pct_short,
      Flat: p.pct_flat,
    }));

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-100">3 · Smart Money Analytics</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          The {cohortSize} smartest wallets — ranked by risk-adjusted skill, not just raw PnL — and what they hold.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Smart-money leaderboard — real, ranked by smart_score */}
        <InsightCard
          title="Smart-Money Leaderboard"
          subtitle={`Live · ${activeTraders.length} wallets ranked by Smart Score · scroll → for all metrics`}
          metric="A 2-stage ranking of Hyperliquid wallets. Stage 1 shortlists the top 500 by 30d PnL (active, real capital). Stage 2 scores each on its 30-day equity curve — Sharpe (risk-adjusted return), profit factor, max drawdown, ROI — blended 70% skill / 30% size into a percentile Smart Score (0–100), shrunk toward 0 when the track record is short."
          insight="Rank by skill, not size: a whale with huge PnL but a −60% drawdown scores below a smaller wallet with a clean Sharpe. When several top-Score wallets crowd the same 'Top holding', that's your highest-conviction signal — these are the accounts with a proven, risk-controlled edge, not one lucky month."
          className="lg:row-span-2"
        >
          {/* Fixed height matched to the stacked Net Positioning + Inflow cards
              beside it (a CSS Grid row-span-2 cell grows to fit its tallest
              content, so h-full alone causes runaway growth from the 86-row
              table -- pin it to the sibling column's real combined height
              instead so it visually fills the space and scrolls internally). */}
          <div className="h-[800px] overflow-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-900 text-xs text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="py-2 pl-1 pr-2 text-left font-medium">#</th>
                  <th className="py-2 pr-3 text-left font-medium">Trader</th>
                  <th className="py-2 pr-3 text-left font-medium">Score</th>
                  <th className="py-2 pr-3 text-right font-medium" title="Annualised risk-adjusted return (mean/σ of daily returns)">Sharpe</th>
                  <th className="py-2 pr-3 text-right font-medium" title="Gross up-day P&L ÷ gross down-day P&L (capped at 5)">PF</th>
                  <th className="py-2 pr-3 text-right font-medium" title="Worst peak-to-trough drop of the 30d equity curve">Max DD</th>
                  <th className="py-2 pr-3 text-right font-medium">ROI</th>
                  <th className="py-2 pr-3 text-right font-medium">30d PnL</th>
                  <th className="py-2 pr-3 text-left font-medium">Top holding</th>
                  <th className="py-2 pl-2 pr-1 text-right font-medium">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {activeTraders.map((t, i) => {
                  const hold = topHoldings.get(t.trader_address);
                  const score = (t.smart_score ?? 0) * 100;
                  return (
                    <tr key={t.trader_address} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-2 pl-1 pr-2 text-slate-600">{i + 1}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-300">
                        {t.display_name ?? truncAddr(t.trader_address)}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(score, 100)}%` }} />
                          </div>
                          <span className="tabular-nums font-semibold text-slate-200">{score.toFixed(0)}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{fmtNum(t.sharpe_30d, 1)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{fmtNum(t.profit_factor_30d, 2)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-rose-400">{fmtPctSigned(t.max_drawdown_30d, 0)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${(t.roi_30d ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {fmtPctSigned(t.roi_30d, 0)}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums text-emerald-400">
                        {formatCompactUsd(t.pnl_30d_usd)}
                      </td>
                      <td className="py-2 pr-3">
                        {hold ? (
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="font-semibold text-slate-200">{hold.coin}</span>
                            <span
                              className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                                hold.direction === 'long'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-rose-500/10 text-rose-400'
                              }`}
                            >
                              {hold.direction === 'long' ? 'L' : 'S'}
                            </span>
                            <span className="text-xs text-slate-500">{formatCompactUsd(hold.valueUsd)}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">— cash</span>
                        )}
                      </td>
                      <td className="py-2 pl-2 pr-1 text-right tabular-nums text-slate-400">{t.n_open_positions}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </InsightCard>

        {/* Net positioning — real */}
        <InsightCard
          title="Net Positioning by Asset"
          subtitle="Live · % of smart-money wallets long / short / flat"
          metric={`For each asset, the share of the ${cohortSize} smart-money wallets currently net-long, net-short, or not involved. Ranked by the most-long assets.`}
          insight="A lopsided long consensus shows where conviction is — but an extreme skew is also crowded, and can unwind fast. 'Not involved' reveals what the pros are avoiding."
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={posData} layout="vertical" stackOffset="expand" margin={{ left: 8, right: 12, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => pctFrac(Number(v), 0)} stroke="#475569" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis type="category" dataKey="coin" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} width={48} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                labelStyle={{ color: '#cbd5e1' }}
                cursor={{ fill: '#1e293b', opacity: 0.4 }}
                formatter={(v, name) => [pctFrac(Number(v), 0), name]}
              />
              <Bar dataKey="Long" stackId="a" fill="#34d399" />
              <Bar dataKey="Short" stackId="a" fill="#f87171" />
              <Bar dataKey="Flat" stackId="a" fill="#334155" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Long</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Short</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-600" /> Not involved</span>
          </div>
        </InsightCard>

        {/* Inflow / outflow — mock */}
        <InsightCard
          title="Smart Money Flows (24h)"
          subtitle="Net capital the cohort added / cut, by asset"
          metric="The day-over-day change in the smart-money wallets' aggregate net position value per asset — how much smart-money capital flowed into or out of each coin in the last 24h."
          insight="Follow the money: sustained inflows into an asset show the cohort building conviction; outflows show them de-risking, often before the crowd reacts."
          isMock
          mockNote="Needs a 2nd snapshot for the day-over-day delta (inflow_usd is null on day 1)."
        >
          <div className="grid grid-cols-2 gap-2.5">
            {MOCK_INFLOW.map((f) => {
              const pos = f.usd >= 0;
              return (
                <div
                  key={f.coin}
                  className={`rounded-lg border px-3 py-2.5 ${
                    pos ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-300">{f.coin}</p>
                  <p className={`mt-0.5 text-base font-bold tabular-nums ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pos ? '+' : '−'}{formatCompactUsd(Math.abs(f.usd))}
                  </p>
                  <p className={`text-xs ${pos ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                    {signedPctFrac(f.pct, 0)}
                  </p>
                </div>
              );
            })}
          </div>
        </InsightCard>
      </div>
    </section>
  );
}
