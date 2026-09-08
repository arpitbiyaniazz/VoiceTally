import { useState } from 'react';

interface RunwaySimulatorProps {
  totalLiquidCash: number;
  totalReceivables: number;
  averageMonthlyBurn: number;
  monthlyIncomeAverage: number;
  formatAmount: (n: number) => string;
}

export function RunwaySimulator({
  totalLiquidCash,
  totalReceivables,
  averageMonthlyBurn,
  monthlyIncomeAverage,
  formatAmount,
}: RunwaySimulatorProps) {
  const [burnDeltaPercent, setBurnDeltaPercent] = useState<number>(0);
  const [receivablesRealization, setReceivablesRealization] = useState<number>(80);
  const [revenueGrowthPercent, setRevenueGrowthPercent] = useState<number>(0);

  // Baseline computations
  const effectiveReceivables = (totalReceivables * receivablesRealization) / 100;
  const simulatedCapitalPool = Math.max(0, totalLiquidCash + effectiveReceivables);

  const simulatedBurnRate = Math.max(0, averageMonthlyBurn * (1 + burnDeltaPercent / 100));
  const simulatedIncome = Math.max(0, monthlyIncomeAverage * (1 + revenueGrowthPercent / 100));
  const netMonthlyDeficit = simulatedBurnRate - simulatedIncome;

  let simulatedRunwayMonths = 999;
  if (netMonthlyDeficit > 0) {
    simulatedRunwayMonths = parseFloat((simulatedCapitalPool / netMonthlyDeficit).toFixed(1));
  } else if (simulatedCapitalPool === 0) {
    simulatedRunwayMonths = 0;
  }

  const simulatedRunwayDays = Math.round(simulatedRunwayMonths * 30);

  // Health state classification
  let healthZone: 'SAFE' | 'MODERATE' | 'CRITICAL' | 'INFINITE' = 'SAFE';
  if (netMonthlyDeficit <= 0) {
    healthZone = 'INFINITE';
  } else if (simulatedRunwayMonths >= 6) {
    healthZone = 'SAFE';
  } else if (simulatedRunwayMonths >= 3) {
    healthZone = 'MODERATE';
  } else {
    healthZone = 'CRITICAL';
  }

  const handleReset = () => {
    setBurnDeltaPercent(0);
    setReceivablesRealization(80);
    setRevenueGrowthPercent(0);
  };

  return (
    <div className="runway-simulator-card glass-card">
      <div className="simulator-header">
        <div>
          <h3 className="chart-card-title">⏳ Predictive Cash Runway & Burn Simulator</h3>
          <p className="chart-card-subtitle">
            Model forward-looking liquidity scenarios and stress-test your business runway
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleReset} title="Reset to current actuals">
          ↺ Reset Baseline
        </button>
      </div>

      <div className="simulator-body-grid">
        {/* Sliders Area */}
        <div className="simulator-controls">
          {/* Slider 1: Monthly Burn Variation */}
          <div className="control-group">
            <div className="control-label-row">
              <label>Monthly Expense/Burn Adjustment</label>
              <span className="control-val-badge">
                {burnDeltaPercent >= 0 ? `+${burnDeltaPercent}%` : `${burnDeltaPercent}%`} (
                {formatAmount(simulatedBurnRate)}/mo)
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="100"
              step="5"
              value={burnDeltaPercent}
              onChange={(e) => setBurnDeltaPercent(Number(e.target.value))}
              className="slider-input"
            />
            <div className="control-hints">
              <span>-50% (Austerity)</span>
              <span>Baseline</span>
              <span>+100% (Aggressive Expansion)</span>
            </div>
          </div>

          {/* Slider 2: Receivables Collection Realization */}
          <div className="control-group">
            <div className="control-label-row">
              <label>Receivables Realization Probability</label>
              <span className="control-val-badge">
                {receivablesRealization}% ({formatAmount(effectiveReceivables)} collected)
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={receivablesRealization}
              onChange={(e) => setReceivablesRealization(Number(e.target.value))}
              className="slider-input"
            />
            <div className="control-hints">
              <span>0% (Worst Case Default)</span>
              <span>80% (Typical)</span>
              <span>100% (Full Recovery)</span>
            </div>
          </div>

          {/* Slider 3: Revenue Growth */}
          <div className="control-group">
            <div className="control-label-row">
              <label>Expected Monthly Revenue Growth</label>
              <span className="control-val-badge">
                +{revenueGrowthPercent}% ({formatAmount(simulatedIncome)}/mo)
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={revenueGrowthPercent}
              onChange={(e) => setRevenueGrowthPercent(Number(e.target.value))}
              className="slider-input"
            />
            <div className="control-hints">
              <span>0% (Flat)</span>
              <span>+25%</span>
              <span>+50% (High Growth)</span>
            </div>
          </div>
        </div>

        {/* Dynamic Runway Metric Display */}
        <div className={`runway-result-box ${healthZone.toLowerCase()}`}>
          <div className="runway-status-pill">
            {healthZone === 'INFINITE' && '🟢 Cash Flow Positive (Self-Sustaining)'}
            {healthZone === 'SAFE' && '🟢 Safe Runway (> 6 Months)'}
            {healthZone === 'MODERATE' && '🟡 Moderate Runway (3–6 Months)'}
            {healthZone === 'CRITICAL' && '🔴 Critical Runway (< 3 Months)'}
          </div>

          <div className="runway-hero-metric">
            {healthZone === 'INFINITE' ? (
              <span className="infinite-symbol">∞ Months</span>
            ) : (
              <>
                <span className="metric-number">{simulatedRunwayMonths}</span>
                <span className="metric-unit">Months</span>
              </>
            )}
          </div>

          {healthZone !== 'INFINITE' && (
            <div className="runway-days-hint">≈ {simulatedRunwayDays} days of liquidity</div>
          )}

          <div className="runway-summary-stats">
            <div className="stat-line">
              <span>Simulated Capital Pool:</span>
              <strong>{formatAmount(simulatedCapitalPool)}</strong>
            </div>
            <div className="stat-line">
              <span>Net Monthly Deficit/Burn:</span>
              <strong style={{ color: netMonthlyDeficit <= 0 ? '#10b981' : '#f43f5e' }}>
                {netMonthlyDeficit <= 0 ? `+${formatAmount(Math.abs(netMonthlyDeficit))} Surplus` : formatAmount(netMonthlyDeficit)}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
