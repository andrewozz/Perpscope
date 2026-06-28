import { REGIME_MODEL } from '../features/engine/regimeModel';
import type { FeatureRow, RegimeResult, StateProb } from '../types/regime';

const M = REGIME_MODEL;

function logSumExp(values: number[]): number {
  const max = Math.max(...values);
  if (max === -Infinity) return -Infinity;
  let sum = 0;
  for (const v of values) sum += Math.exp(v - max);
  return max + Math.log(sum);
}

/** Log-probability of a standardised observation under state k's diagonal Gaussian. */
function logEmission(x: number[], k: number): number {
  const means = M.means[k];
  const vars = M.vars[k];
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    lp += -0.5 * Math.log(2 * Math.PI * vars[i]) - (x[i] - means[i]) ** 2 / (2 * vars[i]);
  }
  return lp;
}

/** Standardise a raw feature row with the trained scaler, in the model's feature order. */
function standardise(row: FeatureRow): number[] {
  return M.features.map((f, i) => ((row as unknown as Record<string, number>)[f] - M.scalerMean[i]) / M.scalerScale[i]);
}

const labelOf = (k: number) => M.stateLabels[String(k) as keyof typeof M.stateLabels];

/** Viterbi: the single most-likely sequence of states for the observation sequence. */
function viterbiPath(obs: number[][]): number[] {
  const K = M.nStates;
  const T = obs.length;
  const logStart = M.startprob.map((p) => Math.log(p));
  const logTrans = M.transmat.map((r) => r.map((p) => Math.log(p)));

  const delta: number[][] = [[]];
  const psi: number[][] = [[]];
  for (let k = 0; k < K; k++) {
    delta[0][k] = logStart[k] + logEmission(obs[0], k);
    psi[0][k] = 0;
  }
  for (let t = 1; t < T; t++) {
    delta[t] = [];
    psi[t] = [];
    for (let k = 0; k < K; k++) {
      let best = -Infinity;
      let arg = 0;
      for (let j = 0; j < K; j++) {
        const val = delta[t - 1][j] + logTrans[j][k];
        if (val > best) {
          best = val;
          arg = j;
        }
      }
      delta[t][k] = best + logEmission(obs[t], k);
      psi[t][k] = arg;
    }
  }

  const path = new Array<number>(T);
  let last = 0;
  let bestEnd = -Infinity;
  for (let k = 0; k < K; k++) if (delta[T - 1][k] > bestEnd) ((bestEnd = delta[T - 1][k]), (last = k));
  path[T - 1] = last;
  for (let t = T - 2; t >= 0; t--) path[t] = psi[t + 1][path[t + 1]];
  return path;
}

/**
 * Runs the HMM forward (filtering) pass for the latest day's regime — most-likely state, its
 * probability (confidence), the posterior over states, and next-day transition odds — plus a
 * Viterbi decode of the whole window so each recent day can be tagged with its regime.
 */
export function inferRegime(rows: FeatureRow[]): RegimeResult | null {
  if (rows.length === 0) return null;
  const obs = rows.map(standardise);
  const K = M.nStates;

  const logStart = M.startprob.map((p) => Math.log(p));
  const logTrans = M.transmat.map((r) => r.map((p) => Math.log(p)));

  // forward recursion in log-space
  let logAlpha: number[] = [];
  for (let k = 0; k < K; k++) logAlpha[k] = logStart[k] + logEmission(obs[0], k);
  for (let t = 1; t < obs.length; t++) {
    const next: number[] = [];
    for (let k = 0; k < K; k++) {
      const terms: number[] = [];
      for (let j = 0; j < K; j++) terms.push(logAlpha[j] + logTrans[j][k]);
      next[k] = logEmission(obs[t], k) + logSumExp(terms);
    }
    logAlpha = next;
  }

  // posterior over states today = softmax of the final log-alphas
  const norm = logSumExp(logAlpha);
  const probs = logAlpha.map((la) => Math.exp(la - norm));

  const stateProbs: StateProb[] = probs
    .map((prob, index) => ({ index, label: labelOf(index), prob }))
    .sort((a, b) => b.prob - a.prob);

  const current = stateProbs[0];
  const transitions: StateProb[] = M.transmat[current.index]
    .map((prob, index) => ({ index, label: labelOf(index), prob }))
    .sort((a, b) => b.prob - a.prob);

  const path = viterbiPath(obs);
  const history = rows.map((r, i) => ({ date: r.date, stateIndex: path[i], label: labelOf(path[i]) }));

  return {
    date: rows[rows.length - 1].date,
    label: current.label,
    stateIndex: current.index,
    confidence: current.prob,
    stateProbs,
    transitions,
    features: rows[rows.length - 1],
    history,
  };
}
