import { useState } from 'react';

export interface MonthlyTrendItem {
  monthKey: string;
  monthLabel: string;
  income: number;
  expense: number;
  netSavings: number;
}

interface TrendBarChartProps {
  trends: MonthlyTrendItem[];
  formatAmount: (n: number) => string;
}

export function TrendBarChart({ trends, formatAmount }: TrendBarChartProps) {
  const [hoveredMonth, setHoveredMonth] = useState<MonthlyTrendItem | null>(null);

  if (!trends || trends.length === 0) {
    return (
      <div className="trend-chart-card glass-card">
        <h3 className="chart-card-title">Monthly Financial Trends</h3>
        <div className="empty-chart-state text-center text-muted p-lg">
          No historical transaction data available for the selected period.
        </div>
      </div>
    );
  }

  const width = 760;
  const height = 280;
  const paddingX = 50;
  const paddingBottom = 40;
  const paddingTop = 30;

  const chartHeight = height - paddingBottom - paddingTop;
  const chartWidth = width - paddingX * 2;

  const maxVal = Math.max(
    ...trends.flatMap((t) => [t.income, t.expense]),
    1000
  );

  const groupWidth = chartWidth / trends.length;
  const barWidth = Math.min(22, groupWidth * 0.35);

  return (
    <div className="trend-chart-card glass-card">
      <div className="chart-card-header">
        <div>
          <h3 className="chart-card-title">Income vs Expense Trends</h3>
          <p className="chart-card-subtitle">Monthly trajectory over the past {trends.length} months</p>
        </div>
        <div className="trend-legend">
          <span className="legend-indicator income">● Inflows</span>
          <span className="legend-indicator expense">● Outflows</span>
        </div>
      </div>

      <div className="trend-svg-wrapper">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="trend-svg"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Monthly Financial Trends Chart"
        >
          {/* Horizontal Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = height - paddingBottom - ratio * chartHeight;
            const gridVal = ratio * maxVal;

            return (
              <g key={`grid-${i}`} className="grid-line-group">
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeDasharray={ratio === 0 ? 'none' : '4 4'}
                  strokeWidth={ratio === 0 ? '1.5' : '1'}
                  opacity={ratio === 0 ? 0.8 : 0.3}
                />
                <text
                  x={paddingX - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--color-text-muted)"
                  fontSize="10"
                >
                  ₹{(gridVal >= 100000 ? `${(gridVal / 100000).toFixed(1)}L` : `${Math.round(gridVal / 1000)}k`)}
                </text>
              </g>
            );
          })}

          {/* Grouped Bars per Month */}
          {trends.map((item, idx) => {
            const centerX = paddingX + idx * groupWidth + groupWidth / 2;
            const incomeBarHeight = Math.max(3, (item.income / maxVal) * chartHeight);
            const expenseBarHeight = Math.max(3, (item.expense / maxVal) * chartHeight);

            const incomeX = centerX - barWidth - 2;
            const expenseX = centerX + 2;

            const incomeY = height - paddingBottom - incomeBarHeight;
            const expenseY = height - paddingBottom - expenseBarHeight;

            const isHovered = hoveredMonth === item;

            return (
              <g
                key={item.monthKey}
                className={`trend-month-group ${isHovered ? 'active' : ''}`}
                onMouseEnter={() => setHoveredMonth(item)}
                onMouseLeave={() => setHoveredMonth(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Background Hover Column Highlight */}
                {isHovered && (
                  <rect
                    x={centerX - groupWidth / 2 + 4}
                    y={paddingTop}
                    width={groupWidth - 8}
                    height={chartHeight}
                    fill="var(--color-brand-primary)"
                    opacity="0.08"
                    rx="6"
                  />
                )}

                {/* Income Bar (Green) */}
                <rect
                  x={incomeX}
                  y={incomeY}
                  width={barWidth}
                  height={incomeBarHeight}
                  rx="4"
                  fill="#10b981"
                  className="bar-rect income"
                  opacity={isHovered ? 1 : 0.85}
                />

                {/* Expense Bar (Rose) */}
                <rect
                  x={expenseX}
                  y={expenseY}
                  width={barWidth}
                  height={expenseBarHeight}
                  rx="4"
                  fill="#f43f5e"
                  className="bar-rect expense"
                  opacity={isHovered ? 1 : 0.85}
                />

                {/* Net Badge */}
                {item.income > 0 || item.expense > 0 ? (
                  <text
                    x={centerX}
                    y={Math.min(incomeY, expenseY) - 8}
                    textAnchor="middle"
                    fill={item.netSavings >= 0 ? '#10b981' : '#f43f5e'}
                    fontSize="10"
                    fontWeight="700"
                  >
                    {item.netSavings >= 0 ? `+${(item.netSavings >= 1000 ? `${Math.round(item.netSavings / 1000)}k` : item.netSavings)}` : `-${Math.abs(item.netSavings)}`}
                  </text>
                ) : null}

                {/* Month Label */}
                <text
                  x={centerX}
                  y={height - paddingBottom + 18}
                  textAnchor="middle"
                  fill="var(--color-text-primary)"
                  fontSize="11"
                  fontWeight={isHovered ? '700' : '500'}
                >
                  {item.monthLabel.split(' ')[0]}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredMonth && (
          <div className="trend-tooltip glass-card">
            <div className="trend-tooltip-title">{hoveredMonth.monthLabel}</div>
            <div className="trend-tooltip-row">
              <span className="tooltip-dot income" /> Inflows: <strong>{formatAmount(hoveredMonth.income)}</strong>
            </div>
            <div className="trend-tooltip-row">
              <span className="tooltip-dot expense" /> Outflows: <strong>{formatAmount(hoveredMonth.expense)}</strong>
            </div>
            <div className="trend-tooltip-row net">
              Net Surplus: <strong style={{ color: hoveredMonth.netSavings >= 0 ? '#10b981' : '#f43f5e' }}>{formatAmount(hoveredMonth.netSavings)}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
