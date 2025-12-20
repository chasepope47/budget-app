// src/components/FlowSankey.jsx
import React from "react";
import * as d3 from "d3";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";

export default function FlowSankey({
  data,
  height = 560,
  nodeWidth = 16,
  nodePadding = 18,
  onNodeClick,
}) {
  const ref = React.useRef(null);
  const [containerWidth, setContainerWidth] = React.useState(0);

  // ✅ Track container width (mobile-friendly, updates on resize)
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect?.width || 0);
      setContainerWidth(w);
    });

    ro.observe(el);
    // initial measure (helps if observer lags)
    setContainerWidth(Math.floor(el.clientWidth || 0));

    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // clear previous render
    el.innerHTML = "";

    // ✅ Use the real container width (no forced 700px min)
    const width = Math.max(320, containerWidth || el.clientWidth || 0);

    const svg = d3
      .select(el)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .style("display", "block"); // avoids inline SVG whitespace quirks

    const show = (msg) => {
      svg
        .append("text")
        .attr("x", 16)
        .attr("y", 28)
        .attr("fill", "#e2e8f0")
        .attr("font-size", 12)
        .text(msg);
    };

    const COLORS = {
      Income: "#22c55e",
      Fixed: "#f97316",
      Essential: "#3b82f6",
      Variable: "#a855f7",
      Transfers: "#eab308",
      Leftover: "#10b981",
    };

    const incomeTotal = Number(data?.meta?.incomeTotal || 0);
    const pct = (v) => (incomeTotal > 0 ? (v / incomeTotal) * 100 : 0);
    const fmtMoney = (v) => `$${Number(v || 0).toFixed(2)}`;

    // ✅ Slightly smaller labels on narrow screens
    const labelFont = width < 420 ? 10 : 12;

    let raf = requestAnimationFrame(() => {
      try {
        const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
        const rawLinks = Array.isArray(data?.links) ? data.links : [];

        if (!rawNodes.length || !rawLinks.length) {
          show("No report data yet — import transactions to see cash flow.");
          return;
        }

        // Build node list from declared nodes + endpoints
        const nameSet = new Set(rawNodes.map((n) => n?.name).filter(Boolean));
        for (const l of rawLinks) {
          if (typeof l?.source === "string") nameSet.add(l.source);
          if (typeof l?.target === "string") nameSet.add(l.target);
        }

        const names = [...nameSet];
        const nameToIndex = new Map(names.map((n, i) => [n, i]));
        const nodes = names.map((name) => ({ name }));

        const links = rawLinks
          .map((l) => {
            const source =
              typeof l.source === "string" ? nameToIndex.get(l.source) : l.source;
            const target =
              typeof l.target === "string" ? nameToIndex.get(l.target) : l.target;
            const value = Number(l.value || 0);

            if (
              typeof source !== "number" ||
              typeof target !== "number" ||
              !Number.isFinite(value) ||
              value <= 0
            ) {
              return null;
            }
            return { source, target, value };
          })
          .filter(Boolean);

        if (!links.length) {
          show("Report links are empty after validation.");
          return;
        }

        const chart = sankey()
          .nodeWidth(nodeWidth)
          .nodePadding(nodePadding)
          .extent([
            [12, 12],
            [width - 12, height - 12],
          ]);

        const graph = chart({
          nodes: nodes.map((d) => ({ ...d })),
          links: links.map((d) => ({ ...d })),
        });

        // ----- LINKS -----
        const linkSel = svg
          .append("g")
          .attr("fill", "none")
          .attr("stroke-opacity", 0.35)
          .selectAll("path")
          .data(graph.links)
          .join("path")
          .attr("d", sankeyLinkHorizontal())
          .attr("stroke", (d) => {
            const srcName = graph.nodes[d.source.index]?.name;
            return COLORS[srcName] || "#94a3b8";
          })
          .attr("stroke-width", (d) => Math.max(1, d.width));

        linkSel.append("title").text((d) => {
          const value = Number(d.value || 0);
          const sName = graph.nodes[d.source.index]?.name;
          const tName = graph.nodes[d.target.index]?.name;
          return `${sName} → ${tName}\n${fmtMoney(value)} (${pct(value).toFixed(
            1
          )}% of income)`;
        });

        // ----- NODES -----
        const nodeSel = svg.append("g").selectAll("g").data(graph.nodes).join("g");

        nodeSel
          .append("rect")
          .attr("x", (d) => d.x0)
          .attr("y", (d) => d.y0)
          .attr("height", (d) => Math.max(1, d.y1 - d.y0))
          .attr("width", (d) => d.x1 - d.x0)
          .attr("rx", 6)
          .attr("fill", (d) => COLORS[d.name] || "#64748b")
          .attr("opacity", 0.9)
          .style("cursor", typeof onNodeClick === "function" ? "pointer" : "default")
          .on("click", (event, d) => {
            if (typeof onNodeClick === "function") onNodeClick(d.name, d);
          })
          .append("title")
          .text((d) => {
            const value = Number(d.value || 0);
            return `${d.name}\n${fmtMoney(value)} (${pct(value).toFixed(
              1
            )}% of income)`;
          });

        nodeSel
          .append("text")
          .attr("x", (d) => (d.x0 < width / 2 ? d.x1 + 8 : d.x0 - 8))
          .attr("y", (d) => (d.y0 + d.y1) / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", (d) => (d.x0 < width / 2 ? "start" : "end"))
          .attr("font-size", labelFont)
          .attr("fill", "#e2e8f0")
          .text((d) => d.name);
      } catch (err) {
        console.error("FlowSankey render error:", err);
        show(`Sankey render error: ${err?.message || String(err)}`);
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [data, height, nodeWidth, nodePadding, onNodeClick, containerWidth]);

  // ✅ Important: this div is what ResizeObserver measures
  return <div ref={ref} style={{ width: "100%" }} />;
}
