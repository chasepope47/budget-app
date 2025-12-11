import React from "react";
import Card from "./Card.jsx";

function moveItem(array, index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= array.length) return array;
  const copy = [...array];
  const [item] = copy.splice(index, 1);
  copy.splice(newIndex, 0, item);
  return copy;
}

function CustomizationPanel({
  navOrder,
  setNavOrder,
  homePage,
  setHomePage,
  dashboardSectionsOrder,
  setDashboardSectionsOrder,
  navLabels,
}) {
  const dashboardLabels = {
    monthOverview: "Month overview",
    accountSnapshot: "Account snapshot",
    goals: "Goals",
    csvImport: "Bank import + parsed transactions",
  };

  return (
    <Card title="LAYOUT & NAVIGATION">
      <div className="grid md:grid-cols-2 gap-4 text-xs">
        <div>
          <h3 className="text-[0.7rem] uppercase tracking-[0.18em] text-slate-400 mb-2">
            Navigation buttons
          </h3>
          <p className="mb-2 text-slate-500">
            Reorder the top buttons and pick which page opens first.
          </p>
          <div className="space-y-1">
            {navOrder.map((key, index) => (
              <div
                key={key}
                className="flex items-center justify-between bg-[#05060F] border border-slate-700/70 rounded-lg px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setNavOrder((prev) => moveItem(prev, index, -1))
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setNavOrder((prev) => moveItem(prev, index, 1))
                    }
                  >
                    ↓
                  </button>
                  <span className="text-slate-200">
                    {navLabels[key] || key}
                  </span>
                </div>
                <label className="flex items-center gap-1 text-[0.7rem] text-slate-400">
                  <input
                    type="radio"
                    className="accent-cyan-400"
                    checked={homePage === key}
                    onChange={() => setHomePage(key)}
                  />
                  Home
                </label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[0.7rem] uppercase tracking-[0.18em] text-slate-400 mb-2">
            Dashboard sections
          </h3>
          <p className="mb-2 text-slate-500">
            Drag-style reorder with arrows to decide what you see first on
            the Dashboard.
          </p>
          <div className="space-y-1">
            {dashboardSectionsOrder.map((key, index) => (
              <div
                key={key}
                className="flex items-center justify-between bg-[#05060F] border border-slate-700/70 rounded-lg px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setDashboardSectionsOrder((prev) =>
                        moveItem(prev, index, -1)
                      )
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setDashboardSectionsOrder((prev) =>
                        moveItem(prev, index, 1)
                      )
                    }
                  >
                    ↓
                  </button>
                  <span className="text-slate-200">
                    {dashboardLabels[key] || key}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default CustomizationPanel;
