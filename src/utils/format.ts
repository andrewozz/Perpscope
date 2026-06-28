export function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatMonthLabel(isoDate: string): string {
  // Full year (e.g. "Jun 2026") so the axis reads clearly as a month/year, not a day.
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
