// themeConfig.js

export const THEME_OPTIONS = [
  {
    key: "dark",
    label: "Cyber Dark",
    description: "Charcoal with neon cyan highlights",
    shellClass: "bg-[#05060A] text-slate-100",
    headerClass: "border-[#1f2937] bg-[#05060F]/90",
    pillClass: "border-slate-600/70 bg-black/20 hover:bg-black/40",
    previewGradient: "from-[#020617] via-[#05060f] to-[#020617]",
  },
  {
    key: "light",
    label: "Soft Light",
    description: "Warm whites with slate ink",
    shellClass: "bg-slate-50 text-slate-900",
    headerClass: "border-slate-200 bg-white/80",
    pillClass: "border-slate-300 bg-white/70 hover:bg-slate-100",
    previewGradient: "from-white via-slate-100 to-slate-200",
  },
  {
    key: "midnight",
    label: "Midnight Pulse",
    description: "Indigo mist with electric purple",
    shellClass: "bg-[#070718] text-indigo-100",
    headerClass: "border-[#191d3a] bg-gradient-to-r from-[#0f1032cc] to-[#1b0d3fcc]",
    pillClass: "border-indigo-600/50 bg-indigo-900/40 hover:bg-indigo-900/70",
    previewGradient: "from-[#0b1433] via-[#25124f] to-[#3b0f49]",
  },
  {
    key: "aurora",
    label: "Aurora Mist",
    description: "Deep teal with aurora glow",
    shellClass: "bg-gradient-to-br from-[#041b1f] via-[#082831] to-[#041b1f] text-emerald-50",
    headerClass: "border-emerald-900/40 bg-[#051f25]/90",
    pillClass: "border-emerald-500/40 bg-emerald-900/40 hover:bg-emerald-900/70",
    previewGradient: "from-[#052528] via-[#0b4b4f] to-[#0f766e]",
  },
];

export function getThemeConfig(key) {
  return (
    THEME_OPTIONS.find((theme) => theme.key === key) ||
    THEME_OPTIONS[0]
  );
}
