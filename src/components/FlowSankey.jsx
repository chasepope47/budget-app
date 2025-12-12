import React from "react";
import { formatCurrency } from "./ui.js";

const NODE_WIDTH = 150;
const NODE_GAP = 18;
const TOP_PADDING = 36;
const BOTTOM_PADDING = 120;
const HORIZONTAL_PADDING = 32;
const MIN_NODE_HEIGHT = 14;
const MIN_LINK_THICKNESS = 2;
const MIN_COLUMN_SPACING = 140;
const MIN_CHART_WIDTH = 640;
const LABEL_BLOCK_HEIGHT_NO_SUB = 48;
const LABEL_BLOCK_HEIGHT_WITH_SUB = 64;
const NODE_INNER_PADDING = 12;
const PHONE_WIDTH_CUTOFF = 520;
const MIN_EFFECTIVE_TEXT_PX = 8;

const MONARCH = true;
const PANEL = "rgba(2,6,23,0.35)";
const TEXT = "#E2E8F0";
const SUBTEXT = "#94A3B8";
const BORDER = "rgba(148,163,184,0.35)";

// You pass these (optional). If you don’t, we generate simple defaults.
const DEFAULT_COLUMN_LABELS = ["Income", "Cash Flow", "Spending"];

export default function FlowSankey({
  nodes = [],
  links = [],
  height = 420,
  columnLabels = DEFAULT_COLUMN_LABELS,
  emptyMessage = "Not enough data for this timeframe.",
}) {
  const containerRef = React.useRef(null);
  const [containerWidth, setContainerWidth] = React.useState(null);
  const [hover, setHover] = React.useState(null);

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

  const canHover =
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

  const safeNodes = (nodes || []).filter((n) => {
    const v = Number(n.value);
    return Number.isFinite(v) && v >= 0 && n.id;
  });

  if (!safeNodes.length) {
    return <div className="text-xs text-slate-400">{emptyMessage}</div>;
  }

  // Columns
  const columns = Array.from(new Set(safeNodes.map((n) => n.column ?? 0))).sort(
    (a, b) => a - b
  );
  const nodesByColumn = columns.map((col) =>
    safeNodes.filter((n) => (n.column ?? 0) === col)
  );

  // Layout sizing
  const columnCount = columns.length || 1;
  const spanCount = Math.max(columnCount - 1, 1);
  const maxNodesInColumn = nodesByColumn.reduce(
    (max, list) => Math.max(max, list.length),
    0
  );
  const baseSpacing =
    MIN_COLUMN_SPACING + Math.max(0, maxNodesInColumn - 4) * 24;

  const minWidth =
    HORIZONTAL_PADDING * 2 +
    NODE_WIDTH +
    Math.max(columnCount - 1, 0) * baseSpacing;
  const targetWidth = Math.max(MIN_CHART_WIDTH, minWidth);

  const columnSpacing =
    columnCount > 1
      ? Math.max(
          baseSpacing,
          (targetWidth - HORIZONTAL_PADDING * 2 - NODE_WIDTH) / spanCount
        )
      : 0;

  const svgWidth =
    HORIZONTAL_PADDING * 2 +
    NODE_WIDTH +
    columnSpacing * Math.max(columnCount - 1, 0);

  // Value scale per max column total
  const columnTotals = nodesByColumn.map((list) =>
    list.reduce((sum, n) => sum + Math.max(Number(n.value) || 0, 0), 0)
  );
  const maxColumnTotal = Math.max(...columnTotals, 1);

  const minHeightNeeded = nodesByColumn.reduce((max, list) => {
    if (!list.length) return max;
    const required =
      list.length * MIN_NODE_HEIGHT + Math.max(list.length - 1, 0) * NODE_GAP;
    return Math.max(max, required);
  }, 0);

  const verticalPadding = TOP_PADDING + BOTTOM_PADDING;
  const baseAvailableHeight = Math.max(height - verticalPadding, 120);
  const availableHeight = Math.max(baseAvailableHeight, minHeightNeeded);
  const svgHeight = availableHeight + verticalPadding;
  const valueScale = availableHeight / maxColumnTotal;

  // Build node layout
  const layout = {};
  nodesByColumn.forEach((columnNodes, columnIndex) => {
    const sorted = columnNodes.slice().sort((a, b) => Number(b.value) - Number(a.value));
    const heights = sorted.map((node) => {
      const hasSub = Boolean(node.subtitle);
      const labelMin = hasSub ? LABEL_BLOCK_HEIGHT_WITH_SUB : LABEL_BLOCK_HEIGHT_NO_SUB;
      const minH = Math.max(MIN_NODE_HEIGHT, labelMin + NODE_INNER_PADDING);
      return Math.max(Number(node.value) * valueScale, minH);
    });

    const totalHeight =
      heights.reduce((sum, h) => sum + h, 0) +
      Math.max(sorted.length - 1, 0) * NODE_GAP;

    let y =
      TOP_PADDING + Math.max((availableHeight - totalHeight) / 2, 0);

    sorted.forEach((node, idx) => {
      layout[node.id] = {
        ...node,
        width: NODE_WIDTH,
        height: heights[idx],
        x: HORIZONTAL_PADDING + columnIndex * columnSpacing,
        y,
      };
      y += heights[idx] + NODE_GAP;
    });
  });

  // Responsive scaling (svg viewBox stays fixed)
  const availableWidth = containerWidth || svgWidth;
  const scaleRaw = availableWidth / svgWidth;
  const scale = Math.min(scaleRaw, 1);
  const scaledHeight = svgHeight * scale;

  const isPhoneWidth =
    typeof containerWidth === "number" && containerWidth <= PHONE_WIDTH_CUTOFF;

  const effectiveLabelPx = 10 * scale;
  const effectiveValuePx = 11 * scale;
  const useCompact =
    isPhoneWidth ||
    effectiveLabelPx < MIN_EFFECTIVE_TEXT_PX ||
    effectiveValuePx < MIN_EFFECTIVE_TEXT_PX;

  if (useCompact) {
    return (
      <div ref={containerRef} className="w-full">
        <CompactFlowList nodes={nodes} links={links} />
      </div>
    );
  }

  // Link stacking offsets
  const flowOffsets = {};
  safeNodes.forEach((n) => {
    flowOffsets[n.id] = { out: 0, in: 0 };
  });

  const renderLinks = (links || [])
    .map((link, index) => {
      const source = layout[link.source];
      const target = layout[link.target];
      if (!source || !target) return null;

      const thickness = Math.max(
        (Number(link.value) || 0) * valueScale,
        MIN_LINK_THICKNESS
      );

      const srcOff = flowOffsets[link.source] || { out: 0 };
      const tgtOff = flowOffsets[link.target] || { in: 0 };

      const y1 = source.y + srcOff.out + thickness / 2;
      const y2 = target.y + tgtOff.in + thickness / 2;

      srcOff.out += thickness;
      tgtOff.in += thickness;

      flowOffsets[link.source] = srcOff;
      flowOffsets[link.target] = tgtOff;

      const x1 = source.x + source.width;
      const x2 = target.x;
      const curvature = (x2 - x1) * 0.5;

      const path = `M ${x1} ${y1} C ${x1 + curvature} ${y1}, ${x2 - curvature} ${y2}, ${x2} ${y2}`;

      return (
        <path
          key={`link-${index}`}
          d={path}
          fill="none"
          stroke={
            link.color ||
            (MONARCH ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.25)")
          }
          strokeWidth={thickness}
          strokeOpacity={MONARCH ? 0.55 : 0.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ mixBlendMode: MONARCH ? "multiply" : "normal" }}
        />
      );
    })
    .filter(Boolean);

  const renderNodes = safeNodes.map((node) => {
    const box = layout[node.id];
    if (!box) return null;

    const label = node.label || "Node";
    const subtitle = node.subtitle || "";
    const canShowSubtitle = box.height >= LABEL_BLOCK_HEIGHT_WITH_SUB;

    return (
      <g
        key={node.id}
        onMouseMove={(e) => {
          if (!canHover) return;

          const svgEl = e.currentTarget.ownerSVGElement;
          const rect = svgEl?.getBoundingClientRect();
          if (!rect) return;

          // Convert mouse (px) -> SVG viewBox coords (no scale bug)
          const x = ((e.clientX - rect.left) / rect.width) * svgWidth;
          const y = ((e.clientY - rect.top) / rect.height) * svgHeight;

          setHover({
            x,
            y,
            title: label,
            value: formatCurrency(node.value || 0),
            subtitle: subtitle || null,
          });
        }}
        onMouseLeave={() => {
          if (!canHover) return;
          setHover(null);
        }}
      >
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx={12}
          fill={PANEL}
          stroke={MONARCH ? BORDER : node.color || "#475569"}
          strokeWidth={MONARCH ? 1 : 1.5}
          style={{
            filter: MONARCH
              ? "drop-shadow(0 1px 2px rgba(15,23,42,0.08))"
              : undefined,
          }}
        />
        <text x={box.x + 12} y={box.y + 20} fill={TEXT} style={{ fontSize: "10px" }}>
          {label}
        </text>
        <text
          x={box.x + 12}
          y={box.y + 38}
          fill={TEXT}
          style={{ fontSize: "11px", fontWeight: 700 }}
        >
          {formatCurrency(node.value || 0)}
        </text>

        {subtitle && canShowSubtitle ? (
          <text x={box.x + 12} y={box.y + 52} fill={SUBTEXT} style={{ fontSize: "10px" }}>
            {subtitle}
          </text>
        ) : null}
      </g>
    );
  });

  // Bands + column headers
  const columnName = (idx) => columnLabels[idx] || `Column ${idx + 1}`;

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden relative"
      style={{ height: scaledHeight }}
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width="100%"
        height="100%"
        role="img"
        aria-label="Cash flow Sankey chart"
        preserveAspectRatio="xMidYMid meet"
      >
        {columns.map((col, idx) => {
          const x = HORIZONTAL_PADDING + idx * columnSpacing;
          return (
            <rect
              key={`band-${col}`}
              x={x}
              y={TOP_PADDING - 8}
              width={NODE_WIDTH}
              height={availableHeight + 16}
              rx={12}
              fill={
                layout[nodesByColumn[idx]?.[0]?.id]?.color ||
                (MONARCH ? "#E2E8F0" : "#94A3B8")
              }
              opacity={MONARCH ? 0.08 : 0.06}
            />
          );
        })}

        {columns.map((col, idx) => {
          const x = HORIZONTAL_PADDING + idx * columnSpacing;
          return (
            <text
              key={`colhead-${col}`}
              x={x}
              y={TOP_PADDING - 14}
              fill="#CBD5F5"
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.08em",
              }}
            >
              {columnName(idx).toUpperCase()}
            </text>
          );
        })}

        {renderLinks}
        {renderNodes}
      </svg>

      {hover ? (
        <div
          className="absolute pointer-events-none z-20 rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 shadow-lg"
          style={{
            left: Math.min(hover.x * scale + 12, Math.max((containerWidth || svgWidth * scale) - 220, 0)),
            top: Math.min(hover.y * scale + 12, Math.max(scaledHeight - 90, 8)),
            width: 210,
          }}
        >
          <div className="font-semibold truncate">{hover.title}</div>
          <div className="mt-1 font-bold">{hover.value}</div>
          {hover.subtitle ? (
            <div className="mt-1 text-slate-300 truncate">{hover.subtitle}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CompactFlowList({ nodes = [], links = [] }) {
  const safeNodes = (nodes || []).filter((n) => {
    const v = Number(n.value);
    return Number.isFinite(v) && v >= 0 && n.id;
  });
  const [openId, setOpenId] = React.useState(null);

  const outBySource = React.useMemo(() => {
    const map = {};
    (links || []).forEach((l) => {
      const v = Number(l.value) || 0;
      if (v <= 0) return;
      if (!map[l.source]) map[l.source] = [];
      map[l.source].push({ ...l, value: v });
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => b.value - a.value));
    return map;
  }, [links]);

  const inByTarget = React.useMemo(() => {
    const map = {};
    (links || []).forEach((l) => {
      const v = Number(l.value) || 0;
      if (v <= 0) return;
      if (!map[l.target]) map[l.target] = [];
      map[l.target].push({ ...l, value: v });
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => b.value - a.value));
    return map;
  }, [links]);

  const nodeById = React.useMemo(() => {
    const map = {};
    safeNodes.forEach((n) => (map[n.id] = n));
    return map;
  }, [safeNodes]);

  if (!safeNodes.length) return null;

  const columns = Array.from(new Set(safeNodes.map((n) => n.column ?? 0))).sort(
    (a, b) => a - b
  );

  const byColumn = columns.map((col) => ({
    col,
    nodes: safeNodes
      .filter((n) => (n.column ?? 0) === col)
      .slice()
      .sort((a, b) => Number(b.value) - Number(a.value)),
  }));

  const outTotals = {};
  (links || []).forEach((l) => {
    const v = Number(l.value) || 0;
    if (!outTotals[l.source]) outTotals[l.source] = 0;
    outTotals[l.source] += v;
  });

  return (
    <div className="w-full max-h-[70vh] overflow-y-auto space-y-3 pr-1">
      {byColumn.map(({ col, nodes: columnNodes }) => (
        <div
          key={`col-${col}`}
          className="rounded-xl border border-slate-800 bg-slate-900/30 p-3"
        >
          <div className="sticky top-0 z-10 -mx-3 mb-2 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-950/80 backdrop-blur border-b border-slate-800">
            Column {col + 1}
          </div>

          <div className="space-y-2">
            {columnNodes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setOpenId((cur) => (cur === n.id ? null : n.id))}
                className="w-full text-left rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                aria-expanded={openId === n.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-100 truncate">
                      {n.label || "Node"}
                    </div>
                    {n.subtitle ? (
                      <div className="text-xs text-slate-400 truncate">
                        {n.subtitle}
                      </div>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold text-slate-100">
                      {formatCurrency(n.value || 0)}
                    </div>
                    {outTotals[n.id] ? (
                      <div className="text-[11px] text-slate-400">
                        Out: {formatCurrency(outTotals[n.id])}
                      </div>
                    ) : null}
                  </div>
                </div>

                {openId === n.id ? (
                  <div className="mt-2 space-y-2 text-xs text-slate-300">
                    {!!(inByTarget[n.id]?.length) && (
                      <div>
                        <div className="mb-1 font-semibold text-slate-200">
                          Incoming
                        </div>
                        <div className="space-y-1">
                          {inByTarget[n.id].slice(0, 5).map((l, idx) => (
                            <div
                              key={`in-${idx}`}
                              className="flex justify-between gap-3"
                            >
                              <span className="truncate">
                                {nodeById[l.source]?.label || l.source}
                              </span>
                              <span className="shrink-0">
                                {formatCurrency(l.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!!(outBySource[n.id]?.length) && (
                      <div>
                        <div className="mb-1 font-semibold text-slate-200">
                          Outgoing
                        </div>
                        <div className="space-y-1">
                          {outBySource[n.id].slice(0, 5).map((l, idx) => (
                            <div
                              key={`out-${idx}`}
                              className="flex justify-between gap-3"
                            >
                              <span className="truncate">
                                {nodeById[l.target]?.label || l.target}
                              </span>
                              <span className="shrink-0">
                                {formatCurrency(l.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800" aria-hidden="true">
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: "100%",
                      background: n.color || "#64748b",
                      opacity: 0.55,
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
