import React, { useMemo } from "react";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { Sun, Moon, Loader2, StopCircle, Target, Monitor, Smartphone, CheckCircle, AlertCircle } from "lucide-react";
import { getWSClient } from "../../utils/ws-client.ts";

export function StatusBar() {
  const state = useSession();
  const dispatch = useSessionDispatch();

  const totalCost = useMemo(() => {
    return Object.values(state.sessionUsage || {}).reduce((acc, curr) => acc + (curr.cost || 0), 0);
  }, [state.sessionUsage]);

  const totalTokens = useMemo(() => {
    return Object.values(state.sessionUsage || {}).reduce((acc, curr) => acc + (curr.prompt_tokens || 0) + (curr.completion_tokens || 0), 0);
  }, [state.sessionUsage]);

  const handleInterrupt = () => {
    getWSClient().send("user.interrupt", {});
  };

  const isBusy = state.phase !== "ready" && state.phase !== "init" && state.phase !== "error";
  const showActiveSpinner = state.phase === "thinking" || state.phase === "coding" || state.phase === "researching";

  const getStatusBarClasses = (phase: string) => {
    if (!state.isConnected) return "bg-gray-600 dark:bg-gray-800 text-white";
    switch (phase) {
      case "thinking": return "bg-amber-600 dark:bg-amber-700 text-white";
      case "coding": return "bg-sky-600 dark:bg-sky-700 text-white";
      case "researching": return "bg-violet-600 dark:bg-violet-700 text-white";
      case "error": return "bg-red-600 dark:bg-red-700 text-white";
      default: return "bg-blue-600 dark:bg-blue-800 text-white";
    }
  };

  return (
    <div className={`flex items-center justify-between px-3 h-6 shrink-0 text-[11px] font-mono select-none z-50 transition-colors ${getStatusBarClasses(state.phase)}`}>
      
      {/* Left side: Status, Branch/Project, Model */}
      <div className="flex items-center gap-3 h-full overflow-hidden">
        {/* Backend Status / Phase */}
        <div className="flex items-center gap-1.5 h-full px-1 hover:bg-white/10 cursor-pointer transition-colors" title={state.phaseDetail || state.phase}>
          {state.isConnected ? (
            showActiveSpinner ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />
          ) : (
            <AlertCircle size={12} className="text-yellow-300" />
          )}
          <span className="truncate max-w-[200px]">{state.isConnected ? (state.phase === "ready" ? "Ready" : state.phaseDetail || state.phase) : "Disconnected"}</span>
        </div>

        {/* Interrupt Button */}
        {isBusy && (
          <button 
            onClick={handleInterrupt}
            className="flex items-center gap-1 h-full px-2 hover:bg-red-500/50 bg-red-500/30 transition-colors"
          >
            <StopCircle size={10} />
            <span>Interrupt</span>
          </button>
        )}

        {/* Project Name */}
        {state.projectName && (
          <div className="flex items-center gap-1 h-full px-1 hover:bg-white/10 cursor-pointer transition-colors" title={state.lastWorkDir}>
            <span>{state.projectName}</span>
          </div>
        )}
      </div>

      {/* Right side: Stats, Settings */}
      <div className="flex items-center gap-3 h-full">
        {/* Modes */}
        {/* Modes */}
        <button
          onClick={() => {
            const v = !state.autoReview;
            getWSClient().send("auto_review.toggle", { enabled: v });
            dispatch({ type: "SET_AUTO_REVIEW", payload: v });
          }}
          className={`flex items-center justify-center h-full px-2 transition-colors ${state.autoReview ? "bg-blue-500/50 hover:bg-blue-500/70" : "hover:bg-white/10 opacity-70 hover:opacity-100"}`}
          title="Toggle Auto Mode"
        >
          Auto
        </button>
        <button
          onClick={() => {
            const v = !state.yoloMode;
            getWSClient().send("yolo.toggle", { enabled: v });
            dispatch({ type: "SET_YOLO_MODE", payload: v });
          }}
          className={`flex items-center justify-center h-full px-2 transition-colors ${state.yoloMode ? "bg-red-500/50 text-red-100 hover:bg-red-500/70" : "hover:bg-white/10 opacity-70 hover:opacity-100"}`}
          title="Toggle YOLO Mode"
        >
          YOLO
        </button>
        {state.goalMode && <span className="text-orange-200 px-1" title="Goal Mode On">Goal</span>}
        {state.soloMode && <span className="text-cyan-200 px-1" title="Solo Mode On">Solo</span>}

        {/* Context Usage */}
        {state.contextUsage && (
          <div className="flex items-center gap-1 h-full px-1" title="Context Usage">
            <div className="w-12 h-1.5 bg-black/20 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${state.contextUsage.percent > 80 ? 'bg-red-400' : state.contextUsage.percent > 50 ? 'bg-yellow-400' : 'bg-white/80'}`}
                style={{ width: `${Math.min(state.contextUsage.percent, 100)}%` }}
              />
            </div>
            <span>{state.contextUsage.percent.toFixed(0)}%</span>
          </div>
        )}

        {/* Token Stats */}
        {(totalTokens > 0 || totalCost > 0) && (
          <div className="flex items-center gap-2 h-full px-1" title="Total Tokens & Cost">
            <span>T: {(totalTokens / 1000).toFixed(1)}k</span>
            {totalCost > 0 && <span>${totalCost.toFixed(3)}</span>}
          </div>
        )}

        {/* Theme Toggle */}
        <button 
          onClick={() => dispatch({ type: "SET_THEME", payload: state.theme === "dark" ? "light" : "dark" })}
          className="flex items-center justify-center h-full px-1.5 hover:bg-white/10 transition-colors"
        >
          {state.theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
        </button>
      </div>
    </div>
  );
}
