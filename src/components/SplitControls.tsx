import { useState, useEffect } from "react";
import { Layers, ListChecks, Sliders, FolderClosed, Sparkles, Plus, Trash2, ArrowRight, HelpCircle, Zap, CheckCircle2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SplitMode, SplitGroup, AISmartAnalysis } from "../types";

interface SplitControlsProps {
  totalPages: number;
  activeMode: SplitMode;
  setActiveMode: (mode: SplitMode) => void;
  selectedPages: number[]; // From main thumbnail selection
  onTogglePage: (page: number) => void;
  docName: string;
  pdfDoc: any; // Checked window.pdfjsLib instance
  onExecuteSplit: (config: {
    mode: SplitMode;
    ranges?: Array<{ start: number; end: number; label: string }>;
    selectedPages?: number[];
    groups?: Array<{ name: string; pages: number[] }>;
  }) => void;
  executing: boolean;
}

export default function SplitControls({
  totalPages,
  activeMode,
  setActiveMode,
  selectedPages,
  onTogglePage,
  docName,
  pdfDoc,
  onExecuteSplit,
  executing,
}: SplitControlsProps) {
  // 1. Selected page-range configuration
  const [rangeBlocks, setRangeBlocks] = useState<Array<{ id: string; start: number; end: number }>>([
    { id: "r_1", start: 1, end: Math.min(totalPages, 5) },
  ]);

  // 2. Custom logical groupings configuration
  const [customGroups, setCustomGroups] = useState<SplitGroup[]>([
    { id: "g_1", name: "Group-A", pages: [1], reason: "Initial Page" },
  ]);

  // 3. AI smart grouping states
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AISmartAnalysis | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // 4. Auto-Split mode states
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoStep, setAutoStep] = useState<"idle" | "extracting" | "analyzing" | "splitting" | "done">("idle");
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoLog, setAutoLog] = useState<string[]>([]);

  // Auto-fill custom select text when selectedPages changes in visual workspace
  const handleAddRangeBlock = () => {
    const lastBlock = rangeBlocks[rangeBlocks.length - 1];
    const nextStart = lastBlock ? Math.min(totalPages, lastBlock.end + 1) : 1;
    const nextEnd = Math.min(totalPages, nextStart + 4);
    
    setRangeBlocks([
      ...rangeBlocks,
      { id: "r_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4), start: nextStart, end: nextEnd },
    ]);
  };

  const handleRemoveRangeBlock = (id: string) => {
    if (rangeBlocks.length === 1) return; // Maintain at least one block
    setRangeBlocks(rangeBlocks.filter((b) => b.id !== id));
  };

  const handleRangeValChange = (id: string, field: "start" | "end", val: number) => {
    const updated = rangeBlocks.map((b) => {
      if (b.id !== id) return b;
      let cleaned = Math.max(1, Math.min(totalPages, val));
      return { ...b, [field]: cleaned };
    });
    setRangeBlocks(updated);
  };

  // 1b. Custom Range Expression Input state & parser
  const [rangeExpression, setRangeExpression] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);

  const handleParseExpression = () => {
    setRangeError(null);
    if (!rangeExpression.trim()) {
      setRangeError("Please enter a valid page range expression.");
      return;
    }

    const parts = rangeExpression.split(",");
    const blocks: Array<{ id: string; start: number; end: number }> = [];

    for (let rawPart of parts) {
      const part = rawPart.trim();
      if (!part) continue;

      const rangeRegex = /^(\d+)\s*[-–—:to]+\s*(\d+)$/i;
      const singleRegex = /^(\d+)$/;

      if (rangeRegex.test(part)) {
        const match = part.match(rangeRegex);
        if (match) {
          const start = parseInt(match[1]);
          const end = parseInt(match[2]);

          if (isNaN(start) || isNaN(end)) {
            setRangeError(`Failed to parse range part: "${part}"`);
            return;
          }
          if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
            setRangeError(`Page numbers in "${part}" must be between 1 and ${totalPages}`);
            return;
          }
          blocks.push({
            id: "r_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
            start: Math.min(start, end),
            end: Math.max(start, end),
          });
        }
      } else if (singleRegex.test(part)) {
        const match = part.match(singleRegex);
        if (match) {
          const p = parseInt(match[1]);
          if (isNaN(p)) {
            setRangeError(`Failed to parse page number: "${part}"`);
            return;
          }
          if (p < 1 || p > totalPages) {
            setRangeError(`Page number ${p} must be between 1 and ${totalPages}`);
            return;
          }
          blocks.push({
            id: "r_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
            start: p,
            end: p,
          });
        }
      } else {
        setRangeError(`Invalid format: "${part}". Use formulas like "1-5" or "8"`);
        return;
      }
    }

    if (blocks.length === 0) {
      setRangeError("No valid range segments found in your input.");
      return;
    }

    setRangeBlocks(blocks);
  };

  // Group helpers
  const handleAddGroup = () => {
    const idNum = customGroups.length + 1;
    setCustomGroups([
      ...customGroups,
      {
        id: "g_" + Date.now(),
        name: `Group-${String.fromCharCode(65 + (idNum % 26))}`,
        pages: selectedPages.length > 0 ? [...selectedPages] : [1],
        reason: "Manual Selection",
      },
    ]);
  };

  const handleRemoveGroup = (id: string) => {
    if (customGroups.length === 1) return;
    setCustomGroups(customGroups.filter((g) => g.id !== id));
  };

  const handleGroupTextChange = (id: string, val: string) => {
    setCustomGroups(
      customGroups.map((g) => (g.id === id ? { ...g, name: val.replace(/\s+/g, "_") } : g))
    );
  };

  const handleAssignSelectedToGroup = (groupId: string) => {
    if (selectedPages.length === 0) return;
    setCustomGroups(
      customGroups.map((g) => (g.id === groupId ? { ...g, pages: [...selectedPages] } : g))
    );
  };

  // Perform AI scan using Gemini
  const handlePerformAIScan = async () => {
    setAiAnalyzing(true);
    setAiError(null);
    setAiResult(null);

    try {
      if (!pdfDoc) {
        throw new Error("Document is not fully rendered yet. Please wait a second.");
      }

      // Extract text content from each page to feed Gemini
      const pagesExcerpt: string[] = [];
      const scanLimit = Math.min(totalPages, 25); // Cap to 25 pages as sensible metadata extract limit

      for (let i = 1; i <= scanLimit; i++) {
        try {
          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          const words = textContent.items.map((item: any) => item.str).join(" ");
          
          // Truncate text block per page to avoid excessive prompt size
          pagesExcerpt.push(words.substring(0, 1500) || "[Scanned Page/Minimal Text]");
        } catch (err) {
          pagesExcerpt.push("[Unreadable/Skipped]");
        }
      }

      // Execute endpoint
      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pagesExcerpt,
          docFilename: docName,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gemini analyzer failed to compile rules.");
      }

      // Successful analysis!
      setAiResult(result.analysis);
      
      // Auto-load proposal into groups representing AI structures
      if (result.analysis.groups && Array.isArray(result.analysis.groups)) {
        const groups: SplitGroup[] = result.analysis.groups.map((ag: any, index: number) => ({
          id: `ai_${index}_${Date.now()}`,
          name: ag.name,
          pages: ag.pages,
          reason: ag.reason,
        }));
        setCustomGroups(groups);
      }

    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "An error occurred calling the Smart AI models. Please configure keys.");
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handlePerformAutoSplit = async () => {
    setAutoRunning(true);
    setAutoError(null);
    setAutoStep("extracting");
    setAutoLog([
      "Initializing Auto-Split sequence...",
      "Extracting in-memory text from PDF document page elements..."
    ]);

    try {
      if (!pdfDoc) {
        throw new Error("Document is not fully loaded. Please wait a second.");
      }

      // Extract text content from each page to feed Gemini
      const pagesExcerpt: string[] = [];
      const scanLimit = Math.min(totalPages, 25); // Cap to 25 pages as sensible metadata extract limit

      for (let i = 1; i <= scanLimit; i++) {
        try {
          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          const words = textContent.items.map((item: any) => item.str).join(" ");
          
          // Truncate text block per page to avoid excessive prompt size
          pagesExcerpt.push(words.substring(0, 1500) || "[Scanned Page / Minimal Text]");
        } catch (err) {
          pagesExcerpt.push("[Unreadable / Skipped]");
        }
      }

      setAutoStep("analyzing");
      setAutoLog(prev => [
        ...prev,
        `Retrieved text lines for ${pagesExcerpt.length} pages.`,
        "Routing document payload content to Gemini model...",
        "Evaluating natural document transition boundaries dynamically..."
      ]);

      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pagesExcerpt,
          docFilename: docName,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gemini text-analysis parsing failed.");
      }

      const { analysis } = result;
      if (!analysis.groups || !Array.isArray(analysis.groups) || analysis.groups.length === 0) {
        throw new Error("No division groups or document transitions found by Gemini.");
      }

      setAutoStep("splitting");
      setAutoLog(prev => [
        ...prev,
        `Gemini completed analysis! Identified category: ${analysis.documentType || "General Document"}.`,
        `Detected ${analysis.groups.length} logical boundaries & sub-segments.`,
        "Automatically compiling and executing PDF segment slicing..."
      ]);

      // Formulate groups
      const formattedGroups = analysis.groups.map((g: any) => ({
        name: g.name || "Unnamed_Group",
        pages: g.pages,
      }));

      // Automatically trigger the splitting process!
      await onExecuteSplit({
        mode: "auto-split",
        groups: formattedGroups,
      });

      setAutoStep("done");
      setAutoLog(prev => [
        ...prev,
        "Completed! All partitioned files are prepared and loaded in the Download Cabinet below."
      ]);

    } catch (err: any) {
      console.error(err);
      setAutoError(err.message || "An unexpected error occurred during automatic splitting.");
      setAutoStep("idle");
    } finally {
      setAutoRunning(false);
    }
  };

  const triggerExecution = () => {
    if (activeMode === "individual") {
      onExecuteSplit({ mode: "individual" });
    } else if (activeMode === "selected") {
      if (selectedPages.length === 0) return;
      onExecuteSplit({ mode: "selected", selectedPages });
    } else if (activeMode === "range") {
      const formattedRanges = rangeBlocks.map((b, idx) => ({
        start: Math.min(b.start, b.end),
        end: Math.max(b.start, b.end),
        label: `Part-${idx + 1}`,
      }));
      onExecuteSplit({ mode: "range", ranges: formattedRanges });
    } else if (activeMode === "group" || activeMode === "smart-ai") {
      const formattedGroups = customGroups.map((g) => ({
        name: g.name || "Unnamed_Group",
        pages: g.pages,
      }));
      onExecuteSplit({ mode: activeMode, groups: formattedGroups });
    } else if (activeMode === "auto-split") {
      handlePerformAutoSplit();
    }
  };

  return (
    <div id="split_module_controls" className="bg-white rounded-2xl border border-stone-200 p-6 shadow-2xs glass-card">
      
      {/* Tab Navigation header */}
      <h3 className="text-xs font-bold text-natural-accent uppercase tracking-widest mb-4">Split Settings</h3>
      
      <div className="flex bg-stone-100/85 p-1.5 rounded-xl gap-1 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveMode("individual")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
            activeMode === "individual" ? "bg-natural-accent text-white shadow-xs" : "text-stone-500 hover:text-stone-850"
          }`}
        >
          <Layers className="w-4 h-4" /> Each Page
        </button>
        <button
          onClick={() => setActiveMode("selected")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
            activeMode === "selected" ? "bg-natural-accent text-white shadow-xs" : "text-stone-500 hover:text-stone-850"
          }`}
        >
          <ListChecks className="w-4 h-4" /> Selected Only
        </button>
        <button
          onClick={() => setActiveMode("range")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
            activeMode === "range" ? "bg-natural-accent text-white shadow-xs" : "text-stone-500 hover:text-stone-850"
          }`}
        >
          <Sliders className="w-4 h-4" /> Range Splits
        </button>
        <button
          onClick={() => setActiveMode("group")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
            activeMode === "group" ? "bg-natural-accent text-white shadow-xs" : "text-stone-500 hover:text-stone-850"
          }`}
        >
          <FolderClosed className="w-4 h-4" /> Custom Groups
        </button>
        <button
          onClick={() => setActiveMode("smart-ai")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
            activeMode === "smart-ai" ? "bg-natural-accent text-white shadow-xs" : "text-stone-700 hover:bg-natural-badge/40"
          }`}
        >
          <Sparkles className="w-4 h-4 animate-pulse" /> AI Smart Split
        </button>
        <button
          onClick={() => setActiveMode("auto-split")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
            activeMode === "auto-split" ? "bg-natural-accent text-white shadow-xs" : "text-stone-700 hover:bg-natural-badge/40"
          }`}
        >
          <Zap className="w-4 h-4 text-amber-500 animate-pulse animate-duration-1000" /> Auto-Split
        </button>
      </div>

      {/* Dynamic Tab Workspace Container */}
      <div className="min-h-[220px] mb-6">
        <AnimatePresence mode="wait">
          {/* 1. INDIVIDUAL PAGE SPLITS */}
          {activeMode === "individual" && (
            <motion.div
              key="individual"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-4"
            >
              <div className="bg-stone-50/50 border border-stone-200/60 p-4 rounded-xl text-xs text-natural-text">
                <p className="font-bold text-natural-accent flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-natural-accent"></span> 1-Page Extraction Mode
                </p>
                <p className="mt-1">
                  DocSplit will break document <span className="font-mono text-[10px] text-stone-750 bg-natural-badge px-1.5 py-0.5 rounded-sm">{docName}</span> down into exactly <strong className="text-natural-accent">{totalPages} separate PDFs</strong>.
                </p>
                <ul className="list-disc leading-loose pl-4 mt-3 space-y-0.5 font-semibold">
                  <li>Page 1 → Page-1.pdf</li>
                  <li>Page 2 → Page-2.pdf</li>
                  <li>Page {totalPages} → Page-{totalPages}.pdf</li>
                </ul>
              </div>
            </motion.div>
          )}

          {/* 2. SELECTED PAGES ONLY */}
          {activeMode === "selected" && (
            <motion.div
              key="selected"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-4"
            >
              <div className="bg-stone-50/50 border border-stone-200/60 p-4 rounded-xl text-xs text-natural-text">
                <p className="font-bold text-natural-accent">Visual Workspace Selection</p>
                <p className="mt-1">
                  Extract only specified pages. Select / deselect pages interactively by clicking pages inside the main visual grid.
                </p>
                
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-[11px] font-mono bg-natural-badge text-natural-accent px-2 py-1 rounded-lg font-semibold">
                    Selected: {selectedPages.length} pages
                  </span>
                  
                  {selectedPages.length > 0 && (
                    <span className="text-stone-500 font-mono truncate max-w-[200px]" title={selectedPages.sort((a,b)=>a-b).join(", ")}>
                      ({selectedPages.sort((a, b) => a - b).join(", ")})
                    </span>
                  )}
                </div>

                {selectedPages.length === 0 && (
                  <p className="text-amber-800 font-medium mt-3 bg-amber-50/60 border border-amber-100 py-1.5 px-2.5 rounded-lg flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 shrink-0" /> Click page thumbnails in the grid to select extraction targets.
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* 3. RANGE SLITS */}
          {activeMode === "range" && (
            <motion.div
              key="range"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-4 text-left"
            >
              {/* Quick Parser Expression Block */}
              <div className="bg-[#FAF9F5] border border-stone-200/80 rounded-xl p-3 shadow-3xs">
                <label className="block text-[10px] font-bold text-natural-accent uppercase tracking-wider mb-1">
                  Quick Range Expression
                </label>
                <p className="text-[10px] text-stone-500 mb-2 leading-tight">
                  Type custom ranges (e.g., <code className="font-mono bg-stone-100 px-1 py-0.5 rounded text-stone-800 font-bold">1-5, 8, 10-12</code>) and click parse:
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. 1-3, 5, 8-10"
                    value={rangeExpression}
                    onChange={(e) => setRangeExpression(e.target.value)}
                    className="flex-grow py-1.5 px-3 border border-stone-250 focus:border-natural-accent focus:ring-1 focus:ring-natural-accent outline-hidden rounded-lg font-mono text-xs font-semibold bg-white placeholder-stone-400"
                  />
                  <button
                    type="button"
                    onClick={handleParseExpression}
                    className="py-1.5 px-3 bg-stone-200 hover:bg-stone-300 text-stone-900 border border-stone-300 text-[10px] font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    Parse & Apply
                  </button>
                </div>
                {rangeError && (
                  <p className="text-rose-600 font-bold text-[9px] mt-1.5">
                    ⚠️ {rangeError}
                  </p>
                )}
              </div>

              <div className="border-t border-stone-100 pt-2">
                <p className="text-xs text-stone-605 font-medium leading-relaxed mb-2">
                  Define page margins to slice document into contiguous sections as output files:
                </p>

                <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                  {rangeBlocks.map((block, index) => (
                    <div key={block.id} className="flex items-center gap-3 bg-stone-50 border border-stone-150 p-2.5 rounded-xl">
                      <span className="font-mono text-xs text-stone-500 font-bold px-1.5 shrink-0">
                        Part {index + 1}
                      </span>
                      
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex items-center gap-1 flex-1">
                          <span className="text-[10px] text-stone-400 uppercase font-mono tracking-tight shrink-0">From</span>
                          <input
                            type="number"
                            value={block.start}
                            onChange={(e) => handleRangeValChange(block.id, "start", parseInt(e.target.value) || 1)}
                            className="w-full text-center py-1.5 border border-stone-200 focus:border-natural-accent focus:ring-1 focus:ring-natural-accent outline-hidden rounded-lg font-mono text-xs font-bold bg-white"
                          />
                        </div>

                        <ArrowRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />

                        <div className="flex items-center gap-1 flex-1">
                          <span className="text-[10px] text-stone-400 uppercase font-mono tracking-tight shrink-0">To</span>
                          <input
                            type="number"
                            value={block.end}
                            onChange={(e) => handleRangeValChange(block.id, "end", parseInt(e.target.value) || 1)}
                            className="w-full text-center py-1.5 border border-stone-200 focus:border-natural-accent focus:ring-1 focus:ring-natural-accent outline-hidden rounded-lg font-mono text-xs font-bold bg-white"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveRangeBlock(block.id)}
                        disabled={rangeBlocks.length === 1}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Delete block"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleAddRangeBlock}
                className="w-full flex items-center justify-center gap-1 text-xs py-2 bg-natural-badge/60 hover:bg-natural-badge text-natural-accent font-bold rounded-xl cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" /> Add Range Segment
              </button>
            </motion.div>
          )}

          {/* 4. CUSTOM GROUP SPLITS */}
          {activeMode === "group" && (
            <motion.div
              key="group"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-3"
            >
              <p className="text-xs text-stone-600 font-medium leading-relaxed">
                Add multiple custom Named Groups, choose targets in the grid, and assign them into folders.
              </p>

              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {customGroups.map((group) => (
                  <div key={group.id} className="border border-stone-150 rounded-xl p-3 bg-stone-50/50 hover:border-stone-350 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <input
                        type="text"
                        value={group.name}
                        onChange={(e) => handleGroupTextChange(group.id, e.target.value)}
                        placeholder="Group_Name"
                        className="flex-1 py-1 border-b border-transparent hover:border-stone-300 focus:border-natural-accent outline-hidden font-bold text-natural-text text-xs bg-transparent"
                      />

                      <button
                        onClick={() => handleRemoveGroup(group.id)}
                        disabled={customGroups.length === 1}
                        className="p-1 rounded-lg text-stone-400 hover:text-rose-600 disabled:opacity-30 self-center"
                        title="Remove group"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-stone-500 truncate max-w-[200px]" title={group.pages.join(", ")}>
                        Pages: <strong className="font-mono text-natural-text bg-natural-badge/70 px-1.5 py-0.5 rounded-sm font-semibold">{group.pages.length === 0 ? "None" : group.pages.join(", ")}</strong>
                      </span>

                      <button
                        onClick={() => handleAssignSelectedToGroup(group.id)}
                        className="text-natural-accent font-bold hover:underline"
                        title="Assign indices checked in the page grid to this folder"
                      >
                        Assign {selectedPages.length || ""} checkeds
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleAddGroup}
                className="w-full flex items-center justify-center gap-1 text-xs py-2 bg-natural-badge/60 hover:bg-natural-badge text-natural-accent font-bold rounded-xl cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" /> Add Custom Group Folder
              </button>
            </motion.div>
          )}

          {/* 5. GOLDFISH SMART AI SPLITTING */}
          {activeMode === "smart-ai" && (
            <motion.div
              key="smart-ai"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-4"
            >
              <div className="bg-natural-badge/35 border border-natural-accent/20 p-4 rounded-xl text-xs text-natural-text">
                <p className="font-bold font-serif flex items-center gap-1.5 text-natural-text text-sm">
                  <Sparkles className="w-4.5 h-4.5 text-natural-accent" /> AI Document Categorizer & Splitter
                </p>
                <p className="mt-1 text-stone-600 leading-relaxed">
                  Calls Gemini and performs smart scanning of page contents. It automatically detects natural document partitions (like transitions in PO, Invoice bundles, or Compliance segments).
                </p>

                {aiError && (
                  <div className="mt-3 p-3 bg-rose-50 border border-rose-100 text-rose-700 font-medium rounded-lg text-[11px]">
                    {aiError}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    onClick={handlePerformAIScan}
                    disabled={aiAnalyzing}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-bold py-2 px-4 rounded-xl text-white bg-natural-accent hover:bg-natural-accent/90 disabled:bg-stone-300 transition-all shadow-xs cursor-pointer"
                  >
                    {aiAnalyzing ? (
                      <>
                        <span className="w-3.5 h-3.5 rounded-full border border-stone-200 border-t-white animate-spin shrink-0"></span>
                        AI Scanning Page Contents...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> Trigger AI Scan ({Math.min(totalPages, 25)} pages max)
                      </>
                    )}
                  </button>
                </div>
              </div>

              {aiResult && (
                <div className="bg-[#5A5A40]/5 border border-[#5A5A40]/20 p-4 rounded-xl space-y-3.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-natural-accent uppercase tracking-wider text-[10px]">Analysis Result</span>
                    <span className="bg-natural-badge text-natural-accent px-2.5 py-0.5 rounded-full font-bold text-[10px]">
                      Confidence: {Math.round(aiResult.confidence * 100)}%
                    </span>
                  </div>

                  <div>
                    <span className="text-natural-accent font-bold text-xs bg-natural-badge px-2 py-0.5 rounded-md border border-neutral-200 uppercase tracking-tight">
                      {aiResult.documentType}
                    </span>
                    <p className="text-stone-700 font-semibold text-[11px] leading-relaxed mt-2 bg-white/60 p-2.5 rounded-lg border border-stone-100">
                      {aiResult.explanation}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="font-bold text-stone-500 uppercase tracking-wider text-[9px]">PREPARED GROUP TILES ({aiResult.groups.length}):</p>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 text-[11px]">
                      {aiResult.groups.map((g, idx) => (
                        <div key={idx} className="bg-white p-2 rounded-lg border border-stone-150 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-stone-700 block truncate">{g.name}.pdf</span>
                            <span className="text-stone-500 font-medium text-[10px] block mt-0.5">{g.reason}</span>
                          </div>
                          <span className="font-mono text-[10px] bg-natural-badge/50 text-natural-accent px-1.5 py-0.5 rounded-sm shrink-0 font-bold">
                            p. {g.pages.join(", ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* 6. AUTO-SPLIT MODE PANE */}
          {activeMode === "auto-split" && (
            <motion.div
              key="auto-split"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-4"
            >
              <div className="bg-[#FAF9F5] border border-amber-250 p-4 rounded-xl text-xs text-natural-text relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none"></div>
                <p className="font-bold flex items-center gap-1.5 text-stone-900 text-sm">
                  <Zap className="w-4.5 h-4.5 text-amber-500 animate-pulse" /> Gemini Auto-Split Mode
                </p>
                <p className="mt-1.5 text-stone-605 leading-relaxed font-semibold">
                  Automatically classify and partition your entire document bundle in a single step. Gemini analyzes logical page transitions recursively and initiates extraction immediately.
                </p>

                {autoError && (
                  <div className="mt-3 p-3 bg-rose-50 border border-rose-100 text-rose-700 font-medium rounded-lg text-[11px]">
                    {autoError}
                  </div>
                )}

                {autoRunning && (
                  <div className="mt-4 p-3.5 bg-white border border-stone-200 rounded-xl space-y-3 shadow-3xs text-[11px] text-stone-600">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
                      <span className="font-bold text-stone-900">Auto-Split Pipeline Active</span>
                    </div>

                    <div className="space-y-1.5 border-t border-stone-100 pt-3 font-semibold text-[10px] font-mono">
                      {autoLog.map((log, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-500">•</span>
                          <span className="flex-1 text-stone-500 leading-normal">{log}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <div className="h-1 bg-stone-100 rounded-full flex-1 overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 transition-all duration-550 animation-ease-in-out"
                          style={{ 
                            width: autoStep === "extracting" ? "25%" : autoStep === "analyzing" ? "65%" : autoStep === "splitting" ? "90%" : "100%" 
                          }}
                        ></div>
                      </div>
                      <span className="font-mono text-[9px] text-stone-400 font-bold">
                        {autoStep === "extracting" ? "25%" : autoStep === "analyzing" ? "65%" : autoStep === "splitting" ? "90%" : "100%"}
                      </span>
                    </div>
                  </div>
                )}

                {!autoRunning && autoStep === "done" && (
                  <div className="mt-4 p-3 bg-emerald-50 border border-emerald-150 rounded-xl text-[11px] text-emerald-800 font-semibold leading-relaxed">
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" /> Auto-Split Sequence Completed!
                    </div>
                    Check the Download Cabinet below to retrieve your individual compiled document sub-packages.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Primary Trigger execution block */}
      <button
        onClick={triggerExecution}
        disabled={executing || autoRunning || (activeMode === "selected" && selectedPages.length === 0)}
        className={`w-full flex items-center justify-center gap-2 text-sm font-bold py-3.5 px-6 rounded-full transition-all shadow-lg cursor-pointer ${
          executing || autoRunning
            ? "bg-stone-300 text-stone-500 cursor-not-allowed"
            : (activeMode === "selected" && selectedPages.length === 0)
            ? "bg-stone-100 text-stone-400 border border-stone-200 cursor-not-allowed shadow-none"
            : "bg-natural-accent text-white hover:scale-[1.01] active:scale-[0.99] shadow-natural-accent/25"
        }`}
      >
        {executing || autoRunning ? (
          <>
            <span className="w-4 h-4 rounded-full border border-stone-400 border-t-white animate-spin shrink-0"></span>
            {autoRunning ? "Auto-Splitting Package..." : "Extracting PDF Segments..."}
          </>
        ) : (
          <>
            {activeMode === "auto-split" ? (
              <>
                <Zap className="w-4 h-4 text-amber-400 animate-pulse" /> Run Auto-Split & Download
              </>
            ) : (
              "Split & Download"
            )}
          </>
        )}
      </button>

      <p className="text-[10px] text-center text-stone-400 font-medium mt-3 uppercase tracking-wider">
        Compliance standard sandbox • completely client-side key-compilation
      </p>

    </div>
  );
}
