# BTC Market-Regime Model Selection (research)

Offline data-science study to decide which ML model PerpScope's **Market Regime Detection Engine** should use to
classify Bitcoin's market regime. This folder is *research only* — it informs the app implementation, it is not
shipped to the browser.

## Files
- **`btc_regime_model_selection.ipynb`** — the full study: data extraction → cleaning → feature engineering → EDA →
  preprocessing → model search (regime-count selection, hyper-parameter tuning, time-series cross-validation) →
  comparison → interpretation → recommendation & export.
- **`btc_regime_model_selection_explained.ipynb`** — the **beginner-friendly companion**: identical runnable code,
  but every code cell is preceded by an in-depth markdown explanation of the data-science step, how each algorithm
  (K-Means / Agglomerative / GMM / HMM) works, and which model is best in which situation. Start here if you're new
  to data science.
- **`regime_hmm_params.sample.json`** — example of the trained model's exported parameters (scaler + HMM
  start/transition/emission params + state labels). This is what the TypeScript engine will load to classify days
  in the browser without running Python. Regenerated each time the notebook's final cell runs.

## How to run
```bash
pip install numpy pandas requests matplotlib seaborn scikit-learn scipy hmmlearn joblib
jupyter notebook btc_regime_model_selection.ipynb   # or open in VS Code
```
Data is fetched live from Binance's public USD-M futures API (no key required), so an internet connection is needed.

## What it does / the statistics used
Regime detection is **unsupervised** (no ground-truth labels), so we compare model *families* — K-Means,
Agglomerative clustering, Gaussian Mixture (GMM) and a Gaussian **Hidden Markov Model (HMM)** — on cluster validity
(silhouette / Davies–Bouldin / Calinski–Harabasz), model selection (BIC/AIC), **regime persistence** (mean run
length), **economic distinctness** (ANOVA F of next-day returns), and **walk-forward time-series cross-validation**.
Features span four economic axes: trend/momentum, volatility, funding-rate sentiment, and volume participation.

> Note: Binance only serves ~30 days of open-interest history on the free endpoint, too short to train on, so OI is
> excluded from training and the leverage/positioning signal comes from **funding rate** + volume. The live app,
> which aggregates OI across exchanges in real time, can add it back.

## Conclusion
**Recommended model: Gaussian HMM (diagonal covariance, 4 regimes).** It is the only candidate that models the time
dimension, giving *persistent* regimes (~31-day mean duration vs. ~10–12 days for the i.i.d. clustering methods) and
the most economically distinct states, while also exposing transition probabilities and scoring new days online.
GMM is the runner-up/fallback (better raw fit but choppy, non-persistent regimes). The four discovered regimes map
to **Bull / Bear / Range / Accumulation** by their return–volatility signature (for BTC the Bear state is the
high-volatility selloff).

### Productionising in the React app
The browser can't run Python/`hmmlearn`. We export the trained HMM parameters (see the sample JSON) and re-implement
the lightweight forward/Viterbi inference in TypeScript — a few matrix multiplies per day. The engine page computes
today's features from live data, runs them through the exported parameters, and shows the current regime, its
probability, and the odds of switching.
