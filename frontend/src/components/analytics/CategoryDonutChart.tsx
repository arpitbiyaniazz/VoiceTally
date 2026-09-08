import { useState } from 'react';

export interface CategoryItem {
  accountId: string;
  accountName: string;
  subtype: string;
  amount: number;
  percentage: number;
}

interface CategoryDonutChartProps {
  title: string;
  categories: CategoryItem[];
  formatAmount: (n: number) => string;
  colorPalette?: string[];
  emptyMessage?: string;
}

const DEFAULT_EXPENSE_COLORS = [
  '#f43f5e', // Rose
  '#fb923c', // Orange
  '#eab308', // Amber
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
];

export function CategoryDonutChart({
  title,
  categories,
  formatAmount,
  colorPalette = DEFAULT_EXPENSE_COLORS,
  emptyMessage = 'No transactions recorded for this period.',
}: CategoryDonutChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const totalAmount = categories.reduce((sum, c) => sum + c.amount, 0);

  if (!categories || categories.length === 0 || totalAmount === 0) {
    return (
      <div className="donut-chart-card glass-card">
        <h3 className="chart-card-title">{title}</h3>
        <div className="empty-chart-state text-center text-muted p-lg">
          {emptyMessage}
        </div>
      </div>
    );
  }

  const size = 260;
  const strokeWidth = 36;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Compute strokeDasharray and strokeDashoffset for SVG circles
  let accumulatedPercent = 0;
  const slices = categories.map((cat, idx) => {
    const percent = totalAmount > 0 ? cat.amount / totalAmount : 0;
    const strokeDasharray = `${percent * circumference} ${circumference}`;
    const strokeDashoffset = -accumulatedPercent * circumference;
    accumulatedPercent += percent;
    const color = colorPalette[idx % colorPalette.length];

    return {
      ...cat,
      index: idx,
      color,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  const activeCategory = hoveredIndex !== null ? categories[hoveredIndex] : null;

  return (
    <div className="donut-chart-card glass-card">
      <div className="chart-card-header">
        <h3 className="chart-card-title">{title}</h3>
        <span className="badge badge-neutral">{categories.length} accounts</span>
      </div>

      <div className="donut-chart-layout">
        {/* SVG Donut */}
        <div className="donut-svg-wrapper">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="donut-svg"
            role="img"
            aria-label={`${title} Donut Chart`}
          >
            {/* Background Track Circle */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="var(--color-bg-secondary)"
              strokeWidth={strokeWidth}
            />

            {/* Colored Segment Rings */}
            {slices.map((slice) => {
              const isHovered = hoveredIndex === slice.index;
              return (
                <circle
                  key={slice.accountId}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth={isHovered ? strokeWidth + 6 : strokeWidth}
                  strokeDasharray={slice.strokeDasharray}
                  strokeDashoffset={slice.strokeDashoffset}
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${center} ${center})`}
                  className={`donut-segment ${isHovered ? 'hovered' : ''}`}
                  onMouseEnter={() => setHoveredIndex(slice.index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    cursor: 'pointer',
                    transition: 'stroke-width 0.25s ease, filter 0.25s ease',
                    filter: isHovered ? `drop-shadow(0 0 8px ${slice.color}88)` : 'none',
                  }}
                />
              );
            })}
          </svg>

          {/* Center Text Overlay */}
          <div className="donut-center-info">
            {activeCategory ? (
              <>
                <div className="donut-center-label">
                  {activeCategory.accountName.length > 14
                    ? activeCategory.accountName.slice(0, 12) + '...'
                    : activeCategory.accountName}
                </div>
                <div className="donut-center-val" style={{ color: colorPalette[hoveredIndex! % colorPalette.length] }}>
                  {formatAmount(activeCategory.amount)}
                </div>
                <div className="donut-center-percent">{activeCategory.percentage}% of total</div>
              </>
            ) : (
              <>
                <div className="donut-center-label">Total Volume</div>
                <div className="donut-center-val">{formatAmount(totalAmount)}</div>
                <div className="donut-center-percent">100% Breakdown</div>
              </>
            )}
          </div>
        </div>

        {/* Legend List */}
        <div className="donut-legend-list">
          {categories.slice(0, 6).map((cat, idx) => {
            const isHovered = hoveredIndex === idx;
            const color = colorPalette[idx % colorPalette.length];

            return (
              <div
                key={cat.accountId}
                className={`donut-legend-item ${isHovered ? 'active' : ''}`}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div className="legend-item-left">
                  <span className="legend-color-dot" style={{ backgroundColor: color }} />
                  <span className="legend-item-name" title={cat.accountName}>
                    {cat.accountName}
                  </span>
                </div>
                <div className="legend-item-right">
                  <span className="legend-item-amount">{formatAmount(cat.amount)}</span>
                  <span className="legend-item-pct">{cat.percentage}%</span>
                </div>
              </div>
            );
          })}
          {categories.length > 6 && (
            <div className="text-xs text-muted text-center pt-xs">
              + {categories.length - 6} other accounts included in total
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
