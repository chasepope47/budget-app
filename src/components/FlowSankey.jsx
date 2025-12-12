import React from "react";
import { formatCurrency } from "./ui.js";

const NODE_WIDTH = 150;
const NODE_GAP = 18;
const CHART_PADDING = 32;
const MIN_NODE_HEIGHT = 14;
const MIN_LINK_THICKNESS = 2;
const MIN_COLUMN_SPACING = 140;
const MIN_CHART_WIDTH = 640;
const LINK_OFFSET = 10;

function FlowSankey({ nodes = [], links = [], height = 420 }) {
  const containerRef = React.useRef(null);
  const [containerWidth, setContainerWidth] = React.useState(null);

  React.useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect?.width) {
          setContainerWidth(Math.max(entry.contentRect.width, 320));
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const filteredNodes = (nodes || []).filter(
    (node) => Number.isFinite(Number(node.value)) && Number(node.value) >= 0
  );

  if (!filteredNodes.length) {
    return (
      <div className="text-xs text-slate-400">
        Not enough data for this timeframe. Import transactions or pick a
        wider range.
      </div>
    );
  }

  const columns = Array.from(
    new Set(filteredNodes.map((node) => node.column ?? 0))
  ).sort((a, b) => a - b);
  const columnCount = columns.length || 1;
  const spanCount = Math.max(columnCount - 1, 1);

  const minWidth =
    CHART_PADDING * 2 + NODE_WIDTH + Math.max(columnCount - 1, 0) * MIN_COLUMN_SPACING;
  const measuredWidth = containerWidth || minWidth;
  const targetWidth = Math.max(measuredWidth, MIN_CHART_WIDTH, minWidth);

  const rawSpacing =
    columnCount > 1
      ? (targetWidth - CHART_PADDING * 2 - NODE_WIDTH) / spanCount
      : 0;
  const columnSpacing =
    columnCount > 1 ? Math.max(MIN_COLUMN_SPACING, rawSpacing) : 0;

  const svgWidth =
    CHART_PADDING * 2 + NODE_WIDTH + columnSpacing * Math.max(columnCount - 1, 0);

  const columnTotals = columns.map((column) =>
    filteredNodes
      .filter((node) => node.column === column)
      .reduce((sum, node) => sum + Math.max(Number(node.value) || 0, 0), 0)
  );
  const maxColumnTotal = Math.max(...columnTotals, 1);
  const availableHeight = Math.max(height - CHART_PADDING, 120);
  const valueScale = availableHeight / maxColumnTotal;

  const layout = {};

  columns.forEach((columnKey, columnIndex) => {
    const columnNodes = filteredNodes
      .filter((node) => node.column === columnKey)
      .sort((a, b) => b.value - a.value);

    const heights = columnNodes.map((node) =>
      Math.max(Number(node.value) * valueScale, MIN_NODE_HEIGHT)
    );
    const totalHeight =
      heights.reduce((sum, h) => sum + h, 0) +
      (columnNodes.length - 1) * NODE_GAP;
    let yOffset = Math.max((availableHeight - totalHeight) / 2, 0) + CHART_PADDING / 2;
    columnNodes.forEach((node, idx) => {
      layout[node.id] = {
        ...node,
        width: NODE_WIDTH,
        height: heights[idx],
        x: CHART_PADDING + columnIndex * columnSpacing,
        y: yOffset,
      };
      yOffset += heights[idx] + NODE_GAP;
    });
  });

  const flowOffsets = {};
  filteredNodes.forEach((node) => {
    flowOffsets[node.id] = { out: 0, in: 0 };
  });

  const renderLinks = links
    .map((link, index) => {
      const source = layout[link.source];
      const target = layout[link.target];
      if (!source || !target) return null;

      const thickness = Math.max(
        Number(link.value) * valueScale,
        MIN_LINK_THICKNESS
      );
      const sourceOffset = flowOffsets[link.source] || { out: 0 };
      const targetOffset = flowOffsets[link.target] || { in: 0 };
      const y1 = source.y + sourceOffset.out + thickness / 2;
      const y2 = target.y + targetOffset.in + thickness / 2;
      sourceOffset.out += thickness;
      targetOffset.in += thickness;
      flowOffsets[link.source] = sourceOffset;
      flowOffsets[link.target] = targetOffset;

      const x1 = source.x + Math.max(source.width - LINK_OFFSET, 0);
      const x2 = target.x + Math.min(LINK_OFFSET, target.width || LINK_OFFSET);
      const curvature = (x2 - x1) * 0.5;

      const path = `
        M ${x1} ${y1}
        C ${x1 + curvature} ${y1},
          ${x2 - curvature} ${y2},
          ${x2} ${y2}
      `;

      return (
        <path
          key={`link-${index}`}
          d={path}
          fill="none"
          stroke={link.color || "rgba(255,255,255,0.25)"}
          strokeWidth={thickness}
          strokeOpacity={0.85}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    })
    .filter(Boolean);

  const renderNodes = filteredNodes.map((node) => {
    const box = layout[node.id];
    if (!box) return null;
    const label = node.label || "Node";
    const subtitle = node.subtitle || "";
    return (
      <g key={node.id}>
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx={10}
          fill="url(#nodeOverlay)"
          stroke={node.color || "#475569"}
          strokeWidth={1.5}
          style={{
            fill: `${node.color || "#475569"}20`,
          }}
        />
        <text
          x={box.x + 12}
          y={box.y + 20}
          fill="#e2e8f0"
          style={{ fontSize: "10px" }}
        >
          {label}
        </text>
        <text
          x={box.x + 12}
          y={box.y + 38}
          fill="#f8fafc"
          style={{ fontSize: "11px", fontWeight: 600 }}
        >
          {formatCurrency(node.value || 0)}
        </text>
        {subtitle && (
          <text
            x={box.x + 12}
            y={box.y + 52}
            fill="#94a3b8"
            style={{ fontSize: "10px" }}
          >
            {subtitle}
          </text>
        )}
      </g>
    );
  });

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgWidth} ${height}`}
        width={svgWidth}
        height={height}
        role="img"
        aria-label="Cash flow Sankey chart"
        className="min-w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="nodeOverlay" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(15,23,42,0.45)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0.85)" />
          </linearGradient>
        </defs>
        {renderLinks}
        {renderNodes}
      </svg>
    </div>
  );
}

export default FlowSankey;
