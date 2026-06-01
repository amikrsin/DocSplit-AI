import { useState, useEffect } from "react";
import { 
  FileText, Columns, FolderCode, ShieldCheck, CheckCircle2, ChevronRight, 
  Trash2, Sliders, RefreshCw, ZoomIn, ZoomOut, Sparkles, LogOut, CheckSquare, Square, X, Calendar, Split
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { DocumentState, SplitMode, SplitOutput, SplitHistoryItem } from "./types";
import UploadArea from "./components/UploadArea";
import PageThumbnail from "./components/PageThumbnail";
import SplitControls from "./components/SplitControls";
import DownloadCenter from "./components/DownloadCenter";
import HistoryPanel from "./components/HistoryPanel";
import LightboxModal from "./components/LightboxModal";
import { PDFDocument } from "pdf-lib";

export default function App() {
  // Application Data States
  const [activeDoc, setActiveDoc] = useState<DocumentState | null>(null);
  const [pdfJsDoc, setPdfJsDoc] = useState<any>(null); // Loaded pdf.js reference
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [activeSplitMode, setActiveSplitMode] = useState<SplitMode>("individual");
  const [splitOutputs, setSplitOutputs] = useState<SplitOutput[]>([]);
  const [historyItems, setHistoryItems] = useState<SplitHistoryItem[]>([]);
  
  // App UI Helpers
  const [compiling, setCompiling] = useState(false);
  const [uploaderLoading, setUploaderLoading] = useState(false);
  const [uiZoomLevel, setUiZoomLevel] = useState<number>(1.0);
  const [lightboxPage, setLightboxPage] = useState<number | null>(null);

  // Load execution history on initialization
  useEffect(() => {
    fetchHistoryDB();
  }, []);

  // Fetch process logs from server DB
  const fetchHistoryDB = async () => {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const list = await res.json();
        setHistoryItems(list);
      }
    } catch (err) {
      console.error("Failed to load backend split records history:", err);
    }
  };

  // Safe Uint8 to Base64 utility protecting overflow stacks for large documents
  const uint8ToBase64 = (uint8: Uint8Array): string => {
    let binary = "";
    const len = uint8.byteLength;
    const chunkSz = 0x8000; // 32k chunk size
    for (let i = 0; i < len; i += chunkSz) {
      const chunk = uint8.subarray(i, i + chunkSz);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  };

  // Receives active document details and sets up layout refs
  const handleDocumentLoadedInWorkspace = async (doc: DocumentState) => {
    setActiveDoc(doc);
    setSplitOutputs([]); // Clear previous outputs
    setSelectedPages([]); // Reset pages selection

    try {
      if (!(window as any).pdfjsLib) {
        console.error("PDF renderer script not loaded inside index.html.");
        return;
      }

      // Convert Base64 back into buffer for pdfjs instantiation
      const binaryString = atob(doc.base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const renderingTask = (window as any).pdfjsLib.getDocument({ data: bytes.buffer });
      const jsDocRef = await renderingTask.promise;
      setPdfJsDoc(jsDocRef);
    } catch (err) {
      console.error("Failed to initialize pdfjsLib renderer workspace:", err);
    }
  };

  const handleTogglePageSelection = (pageNumber: number) => {
    if (selectedPages.includes(pageNumber)) {
      setSelectedPages(selectedPages.filter((p) => p !== pageNumber));
    } else {
      setSelectedPages([...selectedPages, pageNumber]);
    }
  };

  const handleSelectAllPagesInGrid = () => {
    if (!activeDoc) return;
    const all = Array.from({ length: activeDoc.pagesCount }, (_, i) => i + 1);
    setSelectedPages(all);
  };

  const handleClearAllPagesInGrid = () => {
    setSelectedPages([]);
  };

  const handleDownloadSinglePage = async (pageNumber: number) => {
    if (!activeDoc) return;
    try {
      const pdfBinary = atob(activeDoc.base64);
      const binaryLen = pdfBinary.length;
      const pdfBytes = new Uint8Array(binaryLen);
      for (let i = 0; i < binaryLen; i++) {
        pdfBytes[i] = pdfBinary.charCodeAt(i);
      }

      const srcDoc = await PDFDocument.load(pdfBytes);
      const splitPdf = await PDFDocument.create();
      const [copiedPage] = await splitPdf.copyPages(srcDoc, [pageNumber - 1]);
      splitPdf.addPage(copiedPage);

      const compiledBytes = await splitPdf.save();
      const compiledBase64 = uint8ToBase64(compiledBytes);
      const pdfBlob = new Blob([compiledBytes], { type: "application/pdf" });
      const downloadUrl = URL.createObjectURL(pdfBlob);

      const cleanName = `${activeDoc.name.replace(/\_converted\.pdf$|\.pdf$/i, "")}_page_${pageNumber}`;

      // Trigger instant browser download trigger
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `${cleanName}.pdf`;
      anchor.click();

      // Clean up pointer
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

      // Register the file in the download cabinet
      const newOutput: SplitOutput = {
        id: `single_${pageNumber}_${Date.now()}`,
        name: cleanName,
        pages: [pageNumber],
        base64: compiledBase64,
        dataUrl: URL.createObjectURL(pdfBlob),
        size: `${(compiledBytes.length / 1024).toFixed(1)} KB`,
      };

      setSplitOutputs((prev) => {
        const filtered = prev.filter(item => item.pages[0] !== pageNumber || item.pages.length > 1);
        return [...filtered, newOutput];
      });

      // Post transactions to system statistics panel DB
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: activeDoc.name,
          splitType: `Single Page ${pageNumber} Extraction`,
          pages: activeDoc.pagesCount,
          outputCount: 1,
        }),
      });
      fetchHistoryDB();

    } catch (err) {
      console.error("Direct single page extraction failed:", err);
    }
  };

  const handleCloseActiveDocument = () => {
    setActiveDoc(null);
    setPdfJsDoc(null);
    setSelectedPages([]);
    setSplitOutputs([]);
  };

  // Deletes single record
  const handleDeleteHistoryEntry = async (id: string) => {
    try {
      const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
      if (res.ok) fetchHistoryDB();
    } catch (err) {
      console.error(err);
    }
  };

  // Clears entire log array
  const handleClearAllHistory = async () => {
    try {
      const res = await fetch("/api/history", { method: "DELETE" });
      if (res.ok) fetchHistoryDB();
    } catch (err) {
      console.error(err);
    }
  };

  // Compile and split PDF files using pdf-lib on the client side
  const handleExecuteSplitRequest = async (config: {
    mode: SplitMode;
    ranges?: Array<{ start: number; end: number; label: string }>;
    selectedPages?: number[];
    groups?: Array<{ name: string; pages: number[] }>;
  }) => {
    if (!activeDoc) return;
    setCompiling(true);

    try {
      const pdfBinary = atob(activeDoc.base64);
      const binaryLen = pdfBinary.length;
      const pdfBytes = new Uint8Array(binaryLen);
      for (let i = 0; i < binaryLen; i++) {
        pdfBytes[i] = pdfBinary.charCodeAt(i);
      }

      // Load original document structure for extraction
      const srcDoc = await PDFDocument.load(pdfBytes);
      const outputsList: SplitOutput[] = [];

      if (config.mode === "individual") {
        const total = srcDoc.getPageCount();
        for (let i = 0; i < total; i++) {
          const splitPdf = await PDFDocument.create();
          const [copiedPage] = await splitPdf.copyPages(srcDoc, [i]);
          splitPdf.addPage(copiedPage);

          const compiledBytes = await splitPdf.save();
          const compiledBase64 = uint8ToBase64(compiledBytes);
          const pdfBlob = new Blob([compiledBytes], { type: "application/pdf" });

          outputsList.push({
            id: `indiv_${i}_${Date.now()}`,
            name: `${activeDoc.name.replace(/\_converted\.pdf$|\.pdf$/i, "")}_page_${i+1}`,
            pages: [i + 1],
            base64: compiledBase64,
            dataUrl: URL.createObjectURL(pdfBlob),
            size: `${(compiledBytes.length / 1024).toFixed(1)} KB`,
          });
        }
      } else if (config.mode === "selected" && config.selectedPages) {
        // Individual exports for selected ones
        for (const pageNum of config.selectedPages) {
          const splitPdf = await PDFDocument.create();
          const [copiedPage] = await splitPdf.copyPages(srcDoc, [pageNum - 1]);
          splitPdf.addPage(copiedPage);

          const compiledBytes = await splitPdf.save();
          const compiledBase64 = uint8ToBase64(compiledBytes);
          const pdfBlob = new Blob([compiledBytes], { type: "application/pdf" });

          outputsList.push({
            id: `selected_${pageNum}_${Date.now()}`,
            name: `${activeDoc.name.replace(/\_converted\.pdf$|\.pdf$/i, "")}_extracted_page_${pageNum}`,
            pages: [pageNum],
            base64: compiledBase64,
            dataUrl: URL.createObjectURL(pdfBlob),
            size: `${(compiledBytes.length / 1024).toFixed(1)} KB`,
          });
        }
      } else if (config.mode === "range" && config.ranges) {
        for (const range of config.ranges) {
          const splitPdf = await PDFDocument.create();
          const copyIndices: number[] = [];
          for (let pIdx = range.start; pIdx <= range.end; pIdx++) {
            copyIndices.push(pIdx - 1);
          }

          const copiedPages = await splitPdf.copyPages(srcDoc, copyIndices);
          copiedPages.forEach((p) => splitPdf.addPage(p));

          const compiledBytes = await splitPdf.save();
          const compiledBase64 = uint8ToBase64(compiledBytes);
          const pdfBlob = new Blob([compiledBytes], { type: "application/pdf" });

          outputsList.push({
            id: `range_${range.start}_${range.end}_${Date.now()}`,
            name: `${activeDoc.name.replace(/\_converted\.pdf$|\.pdf$/i, "")}_part_${range.start}-${range.end}`,
            pages: Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index),
            base64: compiledBase64,
            dataUrl: URL.createObjectURL(pdfBlob),
            size: `${(compiledBytes.length / 1024).toFixed(1)} KB`,
          });
        }
      } else if ((config.mode === "group" || config.mode === "smart-ai" || config.mode === "auto-split") && config.groups) {
        for (const group of config.groups) {
          if (group.pages.length === 0) continue;
          
          const splitPdf = await PDFDocument.create();
          const copyIndices = group.pages.map((p) => p - 1);

          const copiedPages = await splitPdf.copyPages(srcDoc, copyIndices);
          copiedPages.forEach((p) => splitPdf.addPage(p));

          const compiledBytes = await splitPdf.save();
          const compiledBase64 = uint8ToBase64(compiledBytes);
          const pdfBlob = new Blob([compiledBytes], { type: "application/pdf" });

          outputsList.push({
            id: `group_${group.name}_${Date.now()}`,
            name: group.name,
            pages: group.pages,
            base64: compiledBase64,
            dataUrl: URL.createObjectURL(pdfBlob),
            size: `${(compiledBytes.length / 1024).toFixed(1)} KB`,
          });
        }
      }

      setSplitOutputs(outputsList);

      // Post process action: log transactions on Express endpoint DB
      const label = config.mode === "smart-ai" 
        ? "Gemini Smart Split" 
        : config.mode === "auto-split" 
        ? "Gemini Auto-Split" 
        : config.mode.slice(0, 1).toUpperCase() + config.mode.slice(1) + " Split";
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: activeDoc.name,
          splitType: label,
          pages: activeDoc.pagesCount,
          outputCount: outputsList.length,
        }),
      });

      fetchHistoryDB(); // Refresh local logger list

    } catch (err) {
      console.error("Splitting action failed compiled inside reader engine:", err);
    } finally {
      setCompiling(false);
    }
  };

  return (
    <div className="min-h-screen bg-natural-bg text-natural-text flex flex-col font-sans">
      
      {/* 1. ENTERPRISE APPLICATION HEADER */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-stone-200/50 py-4 px-6 md:px-12 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-natural-accent flex items-center justify-center rounded-2xl text-white shadow-md">
            <Columns className="w-5 h-5 text-natural-badge rotate-90" />
          </div>
          <div>
            <div className="flex items-center gap-1.55">
              <h1 className="font-bold font-serif text-natural-text tracking-tight leading-none text-lg">DocSplit AI</h1>
              <span className="bg-natural-badge border border-stone-200 text-natural-accent px-2 py-0.5 rounded-full font-bold text-[9px] font-mono leading-none tracking-tight">V2.4 PRO</span>
            </div>
            <p className="text-[11px] text-stone-500 font-medium mt-0.5">Enterprise Document Parsing & Split Suite</p>
          </div>
        </div>

        {/* User Account Details Bar */}
        <div className="flex items-center gap-3 bg-[#F5F5F0]/85 border border-stone-200 py-1.5 px-3 rounded-2xl shadow-3xs">
          <div className="w-2 h-2 rounded-full bg-natural-accent animate-pulse"></div>
          <div className="text-left font-mono text-[11px]">
            <span className="text-stone-500 block leading-tight font-sans">Active Sandbox Member:</span>
            <strong className="text-stone-700 font-bold font-mono">ami.kr.sin@gmail.com</strong>
          </div>
          <div className="h-4 w-px bg-stone-250"></div>
          <span className="bg-natural-accent text-white font-mono font-bold text-[10px] px-2 py-0.5 rounded-lg uppercase">
            500MB premium
          </span>
        </div>
      </header>

      {/* 2. CORE WORKSPACE ENVIRONMENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 md:px-12 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Controls Panel & Tools (span 5) */}
        <section className="lg:col-span-5 space-y-6">
          
          {/* File Uploader */}
          <UploadArea 
            onDocumentLoaded={handleDocumentLoadedInWorkspace} 
            isLoading={uploaderLoading} 
            setIsLoading={setUploaderLoading} 
          />

          {/* Active File Metadata Card */}
          {activeDoc && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-natural-accent/30 p-5 rounded-2xl shadow-sm glass-card"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-natural-badge/40 border border-stone-200 flex items-center justify-center text-natural-accent">
                    <FileText className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-natural-text text-sm truncate max-w-[200px]" title={activeDoc.name}>
                      {activeDoc.name}
                    </h3>
                    <p className="text-[11px] font-mono text-stone-500 mt-0.5 font-semibold">
                      {(activeDoc.size / (1024 * 1024)).toFixed(2)} MB • {activeDoc.pagesCount} Pages Total
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleCloseActiveDocument}
                  className="p-1 px-1.5 text-xs text-rose-500 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-100 font-semibold rounded-lg transition"
                  title="Unload document"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Split Mode Selector & Action Buttons */}
          {activeDoc && (
            <SplitControls
              totalPages={activeDoc.pagesCount}
              activeMode={activeSplitMode}
              setActiveMode={setActiveSplitMode}
              selectedPages={selectedPages}
              onTogglePage={handleTogglePageSelection}
              docName={activeDoc.name}
              pdfDoc={pdfJsDoc}
              onExecuteSplit={handleExecuteSplitRequest}
              executing={compiling}
            />
          )}

          {/* Prepared split downloads cab */}
          {splitOutputs.length > 0 && (
            <DownloadCenter 
              splitOutputs={splitOutputs} 
              originalDocName={activeDoc ? activeDoc.name : "split_result"} 
            />
          )}

          {/* Process History database list */}
          <HistoryPanel 
            historyItems={historyItems} 
            onRefreshHistory={fetchHistoryDB} 
            onClearAll={handleClearAllHistory} 
            onDeleteEntry={handleDeleteHistoryEntry} 
          />

        </section>

        {/* RIGHT COLUMN: Interactive Rendering Workspace Stage (span 7) */}
        <section className="lg:col-span-7 h-full flex flex-col">
          
          <AnimatePresence mode="wait">
            {!activeDoc ? (
              // Onboarding Screen State
              <motion.div
                key="onboarding"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white/85 border border-stone-200/80 rounded-2xl p-10 flex flex-col items-center justify-center text-center shadow-2xs h-full min-h-[500px] glass-card"
              >
                <div className="w-16 h-16 bg-natural-badge/50 border border-stone-200 text-natural-accent rounded-2xl flex items-center justify-center mb-6">
                  <FolderCode className="w-8 h-8" />
                </div>

                <h2 className="text-xl font-bold font-serif text-natural-text tracking-tight max-w-sm">
                  Document Preview workspace
                </h2>
                
                <p className="text-sm text-stone-650 mt-2 max-w-md">
                  Browse and drag document packages into the uploader panel to visualize individual page matrices, review metrics, and split target pages.
                </p>

                {/* Stepper Graphic */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-md mt-10 text-left border-t border-stone-200/60 pt-8">
                  <div>
                    <span className="font-mono text-xs font-bold text-natural-text bg-natural-badge px-2.5 py-1 rounded-lg">STEP 1</span>
                    <h4 className="font-bold text-natural-text text-xs mt-3">Upload File Packages</h4>
                    <p className="text-[11px] text-stone-500 mt-1 font-semibold">Select standard PDF, docx, or doc. Files convert seamlessly.</p>
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold text-natural-text bg-natural-badge px-2.5 py-1 rounded-lg">STEP 2</span>
                    <h4 className="font-bold text-natural-text text-xs mt-3">Target & Adjust</h4>
                    <p className="text-[11px] text-stone-500 mt-1 font-semibold">Use visual checkmarks, slide margins, folders, or smart AI splitting.</p>
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold text-natural-text bg-natural-badge px-2.5 py-1 rounded-lg">STEP 3</span>
                    <h4 className="font-bold text-natural-text text-xs mt-3">Split and Export</h4>
                    <p className="text-[11px] text-stone-500 mt-1 font-semibold">Acquire single PDFs or download instant zip bundle packages.</p>
                  </div>
                </div>

                <div className="mt-12 flex items-center gap-1.5 text-stone-650 text-xs font-bold bg-natural-badge/40 border border-natural-accent/10 py-1.5 px-3 rounded-full">
                  <ShieldCheck className="w-4 h-4 text-natural-accent" /> HIPAA-Compliant Sandbox • local compilation
                </div>

              </motion.div>
            ) : (
              // Active Preview Stage
              <motion.div
                key="stage"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border border-stone-200 rounded-2xl overflow-hidden flex flex-col shadow-2xs h-full glass-card"
              >
                {/* Visual Stage Toolbar Header */}
                <header className="px-6 py-4 border-b border-stone-200/50 bg-stone-50/60 flex flex-wrap items-center justify-between gap-4 select-none">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-stone-500 uppercase tracking-wider font-mono">Workspace View</span>
                    <div className="h-4 w-px bg-stone-200"></div>
                    <span className="text-xs font-semibold text-natural-text">
                      {selectedPages.length} checked representing {activeDoc.pagesCount} total pages
                    </span>
                  </div>

                  {/* Visual sizing zoom controller and bulk checks */}
                  <div className="flex items-center gap-5">
                    {/* Bulk controls buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSelectAllPagesInGrid}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold border border-stone-200 hover:border-natural-accent bg-white hover:bg-stone-50 rounded-lg text-stone-600 transition cursor-pointer"
                        title="Check all pages"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-natural-accent" /> Check All
                      </button>
                      <button
                        onClick={handleClearAllPagesInGrid}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold border border-stone-200 hover:border-natural-accent bg-white hover:bg-stone-50 rounded-lg text-stone-600 transition cursor-pointer"
                        title="Uncheck all pages"
                      >
                        <Square className="w-3.5 h-3.5 text-stone-400" /> Uncheck All
                      </button>
                    </div>

                    <div className="h-4 w-px bg-stone-200"></div>

                    {/* Scale Sizing Slider */}
                    <div className="flex items-center gap-1.5 bg-white border border-stone-200 px-2 py-1 rounded-lg">
                      <ZoomOut className="w-3.5 h-3.5 text-stone-400" />
                      <input
                        type="range"
                        min="0.6"
                        max="1.5"
                        step="0.1"
                        value={uiZoomLevel}
                        onChange={(e) => setUiZoomLevel(parseFloat(e.target.value))}
                        className="w-16 h-1 bg-stone-100 accent-natural-accent rounded-lg appearance-none outline-hidden cursor-ew-resize"
                        title="Zoom Page Grid Layout"
                      />
                      <ZoomIn className="w-3.5 h-3.5 text-stone-400" />
                      <span className="text-[10px] font-mono text-stone-500 font-bold w-7">
                        {Math.round(uiZoomLevel * 100)}%
                      </span>
                    </div>
                  </div>
                </header>

                {/* Interactive page thumbnails grid card body */}
                <div className="flex-1 p-6 overflow-y-auto max-h-[640px] bg-[#fdfdfc]/50">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    {Array.from({ length: activeDoc.pagesCount }, (_, idx) => {
                      const pageNum = idx + 1;
                      return (
                        <PageThumbnail
                          key={pageNum}
                          pdfDoc={pdfJsDoc}
                          pageNumber={pageNum}
                          isSelected={selectedPages.includes(pageNum)}
                          onToggleSelect={() => handleTogglePageSelection(pageNum)}
                          zoomScale={uiZoomLevel}
                          onOpenZoomModal={(pn) => setLightboxPage(pn)}
                          onDownloadSinglePage={handleDownloadSinglePage}
                        />
                      );
                    })}
                  </div>
                </div>

                <footer className="p-3 bg-stone-50/60 border-t border-stone-150 text-center text-[10px] text-stone-400 font-bold select-none">
                  DocSplit Safe Core renders thumbnails completely relative to local client memory
                </footer>

              </motion.div>
            )}
          </AnimatePresence>

        </section>

      </main>

      {/* 3. LIGHTBOX INSPECT MODAL ACTION */}
      {lightboxPage !== null && activeDoc && pdfJsDoc && (
        <LightboxModal
          pdfDoc={pdfJsDoc}
          pageNumber={lightboxPage}
          totalPages={activeDoc.pagesCount}
          onPageChange={(np) => setLightboxPage(np)}
          onClose={() => setLightboxPage(null)}
        />
      )}

      {/* FOOTER METRICS INFO */}
      <footer className="bg-slate-900 text-slate-400 py-6 border-t border-slate-850 px-12 mt-12 text-center text-xs select-none">
        <p className="font-mono text-[10px] text-slate-500">DocSplit AI Systems Inc • Security Verified Session • Enterprise Vault Mode</p>
      </footer>

    </div>
  );
}
