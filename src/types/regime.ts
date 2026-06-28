export interface DailyBar {
  date: string; // yyyy-mm-dd
  close: number;
  volume: number;
  funding: number; // daily mean funding rate
}

export interface FeatureRow {
  date: string;
  mom_20: number; // 20-day log return (momentum)
  trend: number; // price vs 50-day SMA (−1..)
  vol_14: number; // 14-day realised vol, annualised
  downside_vol: number; // downside-only vol, annualised
  funding_ma: number; // 7-day mean funding rate
  vol_z: number; // volume z-score vs 30-day
}

export interface StateProb {
  index: number;
  label: string;
  prob: number;
}

export interface RegimeResult {
  date: string;
  label: string;
  stateIndex: number;
  confidence: number; // probability of the most-likely current state
  stateProbs: StateProb[]; // posterior over all states today
  transitions: StateProb[]; // P(next state | current state)
  features: FeatureRow;
  history: { date: string; stateIndex: number; label: string }[]; // Viterbi-decoded regime per day
}

export interface RegimePricePoint {
  date: string;
  close: number;
  label: string;
  color: string;
}
