import { useState } from 'react';

export interface SankeyNode {
  id: string;
  name: string;
  type: 'income' | 'pool' | 'expense' | 'savings' | 'deficit';
  color?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyFlowChartProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  formatAmount: (n: number) => string;
}

export function SankeyFlowChart({
  nodes,
  links,
  totalIncome,
  totalExpense,
  netSavings,
  formatAmount,
}: SankeyFlowChartProps) {
  const [hoveredLink, setHoveredLink] = useState<SankeyLink | null>(null);
  const [hoveredNode, setHoveredNode] = useState<SankeyNode | null>(null);

  if (!nodes || nodes.length === 0 || !links || links.length === 0) {
    return (
      <div className="empty-chart-state text-center p-xl text-muted">
        No financial transactions found in this period to construct cash flow rivers.
      </div>
    );
  }

  // Visual layout constants
  const width = 840;
  const height = 460;
  const paddingX = 40;
  const paddingY = 40;
  const nodeWidth = 24;

  const leftX = paddingX;
  const middleX = width / 2 - nodeWidth / 2;
  const rightX = width - paddingX - nodeWidth;

  const incomeNodes = nodes.filter((n) => n.type === 'income');
  const poolNode = nodes.find((n) => n.type === 'pool') || { id: 'pool', name: 'Revenue Pool', type: 'pool' as const };
  const sinkNodes = nodes.filter((n) => n.type === 'expense' || n.type === 'savings' || n.type === 'deficit');

  // Compute node Y positions and heights
  const chartHeight = height - paddingY * 2;
  const totalFlow = Math.max(totalIncome, totalExpense, 1);

  // Income nodes (Left column)
  let currIncomeY = paddingY;
  const incomeNodeLayouts = new Map<string, { x: number; y: number; height: number; value: number }>();
  const gap = 14;
  const availableIncomeHeight = chartHeight - (incomeNodes.length - 1) * gap;

  incomeNodes.forEach((node) => {
    const nodeVal = links.filter((l) => l.source === node.id).reduce((s, l) => s + l.value, 0) || 1;
    const h = Math.max(32, (nodeVal / totalFlow) * availableIncomeHeight);
    incomeNodeLayouts.set(node.id, { x: leftX, y: currIncomeY, height: h, value: nodeVal });
    currIncomeY += h + gap;
  });

  // Center Pool Node
  const poolHeight = Math.min(chartHeight * 0.85, Math.max(120, chartHeight * 0.7));
  const poolY = (height - poolHeight) / 2;
  const poolLayout = { x: middleX, y: poolY, height: poolHeight, value: totalIncome || totalExpense };

  // Sink nodes (Right column: Expenses + Net Savings)
  let currSinkY = paddingY;
  const sinkNodeLayouts = new Map<string, { x: number; y: number; height: number; value: number }>();
  const availableSinkHeight = chartHeight - (sinkNodes.length - 1) * gap;

  sinkNodes.forEach((node) => {
    const nodeVal = links.filter((l) => l.target === node.id).reduce((s, l) => s + l.value, 0) || 1;
    const h = Math.max(30, (nodeVal / totalFlow) * availableSinkHeight);
    sinkNodeLayouts.set(node.id, { x: rightX, y: currSinkY, height: h, value: nodeVal });
    currSinkY += h + gap;
  });

  const getNodeColor = (node: SankeyNode) => {
    if (node.color) return node.color;
    if (node.type === 'income') return '#10b981';
    if (node.type === 'expense') return '#f43f5e';
    if (node.type === 'savings') return '#06b6d4';
    if (node.type === 'deficit') return '#eab308';
    return '#3b82f6';
  };

  return (
    <div className="sankey-container">
      <div className="sankey-header-pills">
        <span className="sankey-pill income-pill">
          ● Inflows: {formatAmount(totalIncome)}
        </span>
        <span className="sankey-pill pool-pill">
          ● Operating Flow
        </span>
        <span className="sankey-pill expense-pill">
          ● Outflows: {formatAmount(totalExpense)}
        </span>
        <span className={`sankey-pill ${netSavings >= 0 ? 'savings-pill' : 'deficit-pill'}`}>
          ● Net Retained: {formatAmount(netSavings)}
        </span>
      </div>

      <div className="sankey-svg-wrapper">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="sankey-svg"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Sankey Cash Flow Diagram"
        >
          <defs>
            <linearGradient id="poolGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>

            {links.map((link, idx) => {
              const isIncomeLink = incomeNodeLayouts.has(link.source);
              const sourceColor = isIncomeLink ? '#10b981' : '#3b82f6';
              const targetNode = nodes.find((n) => n.id === link.target);
              const targetColor = targetNode ? getNodeColor(targetNode) : '#f43f5e';

              return (
                <linearGradient
                  key={`linkGrad-${idx}`}
                  id={`linkGrad-${idx}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor={sourceColor} stopOpacity={hoveredLink === link ? 0.85 : 0.45} />
                  <stop offset="100%" stopColor={targetColor} stopOpacity={hoveredLink === link ? 0.85 : 0.45} />
                </linearGradient>
              );
            })}
          </defs>

          {/* Links (Bézier Flow Ribbons) */}
          {links.map((link, idx) => {
            const isFromIncome = incomeNodeLayouts.has(link.source);
            const sourceLayout = isFromIncome ? incomeNodeLayouts.get(link.source) : poolLayout;
            const targetLayout = isFromIncome ? poolLayout : sinkNodeLayouts.get(link.target);

            if (!sourceLayout || !targetLayout) return null;

            const startX = sourceLayout.x + nodeWidth;
            const startY = sourceLayout.y + sourceLayout.height / 2;
            const endX = targetLayout.x;
            const endY = targetLayout.y + targetLayout.height / 2;

            const curvature = 0.5;
            const xi = (startX + endX) * curvature;

            const ribbonThickness = Math.max(6, Math.min(48, (link.value / totalFlow) * 70));
            const isHovered = hoveredLink === link;

            return (
              <g key={`flow-link-${idx}`} className="sankey-link-group">
                <path
                  d={`M ${startX} ${startY} C ${xi} ${startY}, ${xi} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke={`url(#linkGrad-${idx})`}
                  strokeWidth={ribbonThickness}
                  strokeLinecap="round"
                  className={`sankey-flow-path ${isHovered ? 'active' : ''}`}
                  onMouseEnter={() => setHoveredLink(link)}
                  onMouseLeave={() => setHoveredLink(null)}
                />
              </g>
            );
          })}

          {/* Income Source Nodes */}
          {incomeNodes.map((node) => {
            const layout = incomeNodeLayouts.get(node.id);
            if (!layout) return null;
            const color = getNodeColor(node);
            const isHovered = hoveredNode === node;

            return (
              <g
                key={node.id}
                className="sankey-node-group"
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <rect
                  x={layout.x}
                  y={layout.y}
                  width={nodeWidth}
                  height={layout.height}
                  rx={6}
                  fill={color}
                  className={`sankey-node-rect ${isHovered ? 'focused' : ''}`}
                />
                <text
                  x={layout.x + nodeWidth + 10}
                  y={layout.y + layout.height / 2 - 4}
                  fill="var(--color-text-primary)"
                  fontSize="12"
                  fontWeight="600"
                  alignmentBaseline="middle"
                >
                  {node.name.length > 18 ? node.name.slice(0, 16) + '...' : node.name}
                </text>
                <text
                  x={layout.x + nodeWidth + 10}
                  y={layout.y + layout.height / 2 + 12}
                  fill="#10b981"
                  fontSize="11"
                  fontWeight="700"
                  alignmentBaseline="middle"
                >
                  +{formatAmount(layout.value)}
                </text>
              </g>
            );
          })}

          {/* Center Pool Node */}
          <g
            className="sankey-node-group pool"
            onMouseEnter={() => setHoveredNode(poolNode)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <rect
              x={poolLayout.x}
              y={poolLayout.y}
              width={nodeWidth}
              height={poolLayout.height}
              rx={8}
              fill="url(#poolGrad)"
              className={`sankey-node-rect ${hoveredNode === poolNode ? 'focused' : ''}`}
            />
            <text
              x={poolLayout.x + nodeWidth / 2}
              y={poolLayout.y - 12}
              textAnchor="middle"
              fill="var(--color-text-primary)"
              fontSize="13"
              fontWeight="700"
            >
              Total Inflow Pool
            </text>
            <text
              x={poolLayout.x + nodeWidth / 2}
              y={poolLayout.y + poolLayout.height / 2}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="12"
              fontWeight="800"
              transform={`rotate(-90, ${poolLayout.x + nodeWidth / 2}, ${poolLayout.y + poolLayout.height / 2})`}
            >
              {formatAmount(poolLayout.value)}
            </text>
          </g>

          {/* Sink Nodes (Expenses & Savings) */}
          {sinkNodes.map((node) => {
            const layout = sinkNodeLayouts.get(node.id);
            if (!layout) return null;
            const color = getNodeColor(node);
            const isHovered = hoveredNode === node;
            const isSavings = node.type === 'savings';

            return (
              <g
                key={node.id}
                className="sankey-node-group"
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <rect
                  x={layout.x}
                  y={layout.y}
                  width={nodeWidth}
                  height={layout.height}
                  rx={6}
                  fill={color}
                  className={`sankey-node-rect ${isHovered ? 'focused' : ''}`}
                />
                <text
                  x={layout.x - 10}
                  y={layout.y + layout.height / 2 - 4}
                  textAnchor="end"
                  fill="var(--color-text-primary)"
                  fontSize="12"
                  fontWeight="600"
                  alignmentBaseline="middle"
                >
                  {node.name.length > 20 ? node.name.slice(0, 18) + '...' : node.name}
                </text>
                <text
                  x={layout.x - 10}
                  y={layout.y + layout.height / 2 + 12}
                  textAnchor="end"
                  fill={isSavings ? '#06b6d4' : '#f43f5e'}
                  fontSize="11"
                  fontWeight="700"
                  alignmentBaseline="middle"
                >
                  {isSavings ? '★ ' : '−'}{formatAmount(layout.value)}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredLink && (
          <div className="sankey-floating-tooltip">
            <span className="tooltip-label">
              {nodes.find((n) => n.id === hoveredLink.source)?.name || 'Inflow'} ➔{' '}
              {nodes.find((n) => n.id === hoveredLink.target)?.name || 'Outflow'}
            </span>
            <span className="tooltip-value">{formatAmount(hoveredLink.value)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
