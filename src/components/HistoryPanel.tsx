import { useState, useEffect } from "react";
import { Clock, Trash2, Calendar, FileText, Split, Layers, Trash } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SplitHistoryItem } from "../types";

interface HistoryPanelProps {
  historyItems: SplitHistoryItem[];
  onRefreshHistory: () => void;
  onClearAll: () => void;
  onDeleteEntry: (id: string) => void;
}

export default function HistoryPanel({
  historyItems,
  onRefreshHistory,
  onClearAll,
  onDeleteEntry,
}: HistoryPanelProps) {
  return (
    <div id="history_module_container" className="bg-white rounded-2xl border border-stone-200 p-6 shadow-2xs glass-card">
      <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-natural-badge/60 flex items-center justify-center text-natural-accent">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-natural-text text-sm tracking-tight leading-none font-serif">Process History</h3>
            <span className="text-xs text-stone-500 font-medium">Archived entries logged from your container session</span>
          </div>
        </div>

        {historyItems.length > 0 && (
          <button
            onClick={onClearAll}
            className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full border border-stone-200 bg-white text-stone-750 hover:bg-stone-150 transition-all cursor-pointer"
            title="Purge all logs"
          >
            <Trash2 className="w-3.5 h-3.5" /> Purge Logs
          </button>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {historyItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-10 text-center"
          >
            <div className="w-12 h-12 bg-stone-50 border border-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mb-3">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-stone-600">No document splits executed yet.</p>
            <p className="text-[11px] text-stone-400 max-w-[240px] mt-1 font-semibold">
              Upload a PDF or Word document, select a split mode, and download your outputs to see logs here.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {historyItems.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="group relative flex items-center justify-between p-3.5 rounded-xl border border-stone-100 hover:border-natural-accent/30 hover:bg-stone-50/50 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 pr-12">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-natural-badge/40 border border-stone-150 flex items-center justify-center text-natural-accent">
                    <FileText className="w-5 h-5" />
                  </div>
                  
                  <div className="min-w-0">
                    <h4 className="font-bold text-natural-text text-xs truncate max-w-[200px] sm:max-w-xs md:max-w-[400px]" title={item.filename}>
                      {item.filename}
                    </h4>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-stone-500 font-semibold">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {new Date(item.uploadedAt).toLocaleString()}
                      </span>
                      <span className="text-stone-300">•</span>
                      <span className="bg-natural-badge text-natural-accent px-1.5 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1 border border-stone-200">
                        <Split className="w-2.5 h-2.5 text-natural-accent" /> {item.splitType}
                      </span>
                      <span className="text-stone-300">•</span>
                      <span className="text-stone-650 bg-stone-100/80 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold">
                        {item.pages} pages
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-xs font-bold font-mono text-natural-accent bg-natural-badge border border-stone-200 px-2 py-1 rounded-lg">
                      {item.outputCount} pdf{item.outputCount > 1 ? "s" : ""}
                    </span>
                  </div>

                  <button
                    onClick={() => onDeleteEntry(item.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Delete log"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
