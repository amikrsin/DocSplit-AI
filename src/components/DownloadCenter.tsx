import { useState, useEffect, useMemo } from "react";
import { FileText, Download, Archive, Info, Sliders, Sparkles, RefreshCw, CheckCircle, AlertCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import JSZip from "jszip";
import { SplitOutput } from "../types";
import { PDFDocument } from "pdf-lib";

interface DownloadCenterProps {
  splitOutputs: SplitOutput[];
  originalDocName: string;
}

interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "info" | "error";
}

export default function DownloadCenter({ splitOutputs, originalDocName }: DownloadCenterProps) {
  const [compressionEnabled, setCompressionEnabled] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedOutputs, setCompressedOutputs] = useState<SplitOutput[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Simple, self-cleaning local toast trigger
  const triggerToast = (message: string, type: "success" | "info" | "error" = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // Apply real-time local memory compaction when compression is toggled
  useEffect(() => {
    if (!compressionEnabled) {
      compressedOutputs.forEach((item) => {
        if (item.dataUrl && item.dataUrl.startsWith("blob:")) {
          URL.revokeObjectURL(item.dataUrl);
        }
      });
      setCompressedOutputs([]);
      return;
    }

    let active = true;
    const applyCompression = async () => {
      setIsCompressing(true);
      triggerToast("Optimizing & compressing PDF structures...", "info");
      try {
        const results: SplitOutput[] = [];
        for (const item of splitOutputs) {
          if (!active) return;
          if (item.base64) {
            try {
              // Convert base64 source to isolated binary Array
              const binary = atob(item.base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }

              // Load document reference
              const pdfDoc = await PDFDocument.load(bytes);
              
              // Compress structures using object stream packing to minimize file bloat
              const compressedBytes = await pdfDoc.save({
                useObjectStreams: true,
              });

              // Check if we produced actual size saving compared to original Page Segment
              if (compressedBytes.length < bytes.length) {
                const len = compressedBytes.length;
                const chunks: string[] = [];
                const chunkSize = 16383; // Maintain 16k buffer stack limits to protect browser engine memory
                for (let j = 0; j < len; j += chunkSize) {
                  const subArray = compressedBytes.subarray(j, j + chunkSize);
                  chunks.push(String.fromCharCode.apply(null, Array.from(subArray)));
                }
                const compressedBase64 = btoa(chunks.join(""));
                const compressedBlob = new Blob([compressedBytes], { type: "application/pdf" });
                const blobUrl = URL.createObjectURL(compressedBlob);

                const savings = Math.round((1 - compressedBytes.length / bytes.length) * 100);

                results.push({
                  ...item,
                  base64: compressedBase64,
                  dataUrl: blobUrl,
                  size: `${(compressedBytes.length / 1024).toFixed(1)} KB (Saved ${savings}%)`,
                  isCompressed: true,
                  originalSize: item.size,
                });
              } else {
                // Keep original if compression wasn't smaller
                results.push({
                  ...item,
                  isCompressed: false,
                  originalSize: item.size,
                });
              }
            } catch (err) {
              console.error("Single item compression error:", err);
              results.push(item);
            }
          } else {
            results.push(item);
          }
        }

        if (active) {
          setCompressedOutputs(results);
          triggerToast("All PDF page splits optimized and compressed successfully!", "success");
        }
      } catch (err) {
        console.error("Batch optimization processing failed:", err);
        triggerToast("Failed to optimize some split pages.", "error");
      } finally {
        if (active) {
          setIsCompressing(false);
        }
      }
    };

    applyCompression();

    return () => {
      active = false;
    };
  }, [splitOutputs, compressionEnabled]);

  // Clean remaining blob objects on component lifecycle shutdown or unmount
  useEffect(() => {
    return () => {
      compressedOutputs.forEach((item) => {
        if (item.dataUrl && item.dataUrl.startsWith("blob:")) {
          URL.revokeObjectURL(item.dataUrl);
        }
      });
    };
  }, [compressedOutputs]);

  // Dynamically resolve target streams for bulk downloads
  const activeOutputs = compressionEnabled && compressedOutputs.length > 0 ? compressedOutputs : splitOutputs;

  // Compute metric visual summary of total file size reduction
  const averageSavings = useMemo(() => {
    if (compressedOutputs.length === 0) return 0;
    let totalSavings = 0;
    let count = 0;
    compressedOutputs.forEach((item) => {
      if (item.size && item.size.includes("Saved")) {
        const m = item.size.match(/Saved (\d+)%/);
        if (m) {
          totalSavings += parseInt(m[1]);
          count++;
        }
      }
    });
    return count > 0 ? totalSavings / count : 0;
  }, [compressedOutputs]);

  // Triggers JSZip client-side packaging
  const handleDownloadZipTask = async () => {
    if (activeOutputs.length === 0) {
      triggerToast("No items available to package into ZIP archive.", "error");
      return;
    }

    triggerToast("Compiling output PDF files into a single ZIP archive...", "info");

    try {
      const zip = new JSZip();
      
      activeOutputs.forEach((item) => {
        if (item.base64) {
          const binary = atob(item.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          zip.file(`${item.name}.pdf`, bytes);
        }
      });

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const blobUrl = URL.createObjectURL(zipBlob);
      
      const anchorNode = document.createElement("a");
      anchorNode.href = blobUrl;
      const cleanName = originalDocName.replace(/\.pdf$/i, "");
      const downloadName = `${cleanName}_split_archive${compressionEnabled ? "_compressed" : ""}.zip`;
      anchorNode.download = downloadName;
      anchorNode.click();

      triggerToast(`ZIP archive ready! Successfully downloaded: ${downloadName}`, "success");

      // Clean browser ref memory
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error("Failed to generate zip package:", err);
      triggerToast("An error occurred while compiling the ZIP archive package.", "error");
    }
  };

  // Triggers all sequential files to download individually
  const handleDownloadAllTask = () => {
    if (activeOutputs.length === 0) {
      triggerToast("No items available for batch consecutive download queue.", "error");
      return;
    }

    triggerToast(`Initializing batch download trigger sequence for ${activeOutputs.length} files...`, "info");
    
    activeOutputs.forEach((item, index) => {
      if (item.dataUrl) {
        setTimeout(() => {
          const anchor = document.createElement("a");
          anchor.href = item.dataUrl!;
          anchor.download = `${item.name}.pdf`;
          anchor.click();
          triggerToast(`Successfully initiated download pipeline for: ${item.name}.pdf`, "success");
        }, index * 450); // 450ms delay loop to prevent browser blocking popup loops
      }
    });
  };

  if (splitOutputs.length === 0) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        id="download_module_cabinet"
        className="glass-card rounded-2xl border border-stone-200 p-6 shadow-xs relative overflow-hidden bg-white/70 text-natural-text"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#5A5A40]/5 rounded-full blur-2xl"></div>

        <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-natural-badge/60 flex items-center justify-center text-natural-accent">
              <Download className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h3 className="font-bold text-natural-text text-sm font-serif">Download Cabinet</h3>
              <span className="text-[10px] text-stone-500 font-medium">Ready PDF splits are prepared for retrieval</span>
            </div>
          </div>

          <span className="bg-natural-badge text-natural-accent px-2.5 py-0.5 rounded-full font-bold text-[10px] font-mono">
            {splitOutputs.length} item{splitOutputs.length > 1 ? "s" : ""}
          </span>
        </div>

        {/* Bulk operation buttons */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={handleDownloadZipTask}
            className="flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 px-3 rounded-full text-white bg-natural-accent hover:bg-natural-accent/90 transition shadow-xs cursor-pointer"
            title="Build zipped archive and download"
            disabled={isCompressing}
          >
            <Archive className="w-4 h-4" /> Download ZIP
          </button>

          <button
            onClick={handleDownloadAllTask}
            className="flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 px-3 rounded-full text-natural-text bg-white border border-stone-200 hover:bg-stone-50 transition shadow-2xs cursor-pointer"
            title="Download each individual pdf consecutively"
            disabled={isCompressing}
          >
            <Download className="w-4 h-4" /> Download All
          </button>
        </div>

        {/* Compression Suite Configuration Toggle */}
        <div className="bg-[#FAF9F5] border border-stone-200/70 rounded-xl p-3 mb-4 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-natural-accent shrink-0" />
              <div>
                <span className="text-xs font-bold text-natural-text block">Optimize & Compress</span>
                <span className="text-[9px] text-stone-505 font-medium block mt-0.5">Reduce download payload size via structural stream packing</span>
              </div>
            </div>
            
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={compressionEnabled}
                onChange={(e) => setCompressionEnabled(e.target.checked)}
                className="sr-only peer"
                disabled={isCompressing}
              />
              <div className="w-9 h-5 bg-stone-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-natural-accent/20 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-natural-accent"></div>
            </label>
          </div>

          {isCompressing && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-200/40 text-[10px] text-natural-accent font-bold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-natural-accent" />
              <span>Calculating stream optimizations...</span>
            </div>
          )}

          {compressionEnabled && !isCompressing && compressedOutputs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-stone-200/40 flex items-center justify-between text-[10px] text-stone-500 font-bold font-mono">
              <span className="flex items-center gap-1 text-[#4F5B36]">
                <Sparkles className="w-3 h-3 text-natural-accent animate-pulse" /> COMPRESSION ACTIVE
              </span>
              <span>Avg. Savings: {Math.round(averageSavings)}%</span>
            </div>
          )}
        </div>

        {/* Outputs List */}
        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
          {activeOutputs.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-xl border border-stone-100 bg-white hover:border-natural-accent/25 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                <FileText className="w-4.5 h-4.5 text-stone-400 shrink-0" />
                <div className="min-w-0 flex-1 text-left">
                  <span className="text-xs font-semibold text-natural-text block truncate" title={`${item.name}.pdf`}>
                    {item.name}.pdf
                  </span>
                  
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-stone-400 font-semibold font-mono flex-wrap">
                    <span>Pages: [{item.pages.join(", ")}]</span>
                    <span>•</span>
                    {item.isCompressed ? (
                      <span className="text-[#5A633F] font-bold bg-[#E6E8DB]/65 px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                        <Sparkles className="w-2.5 h-2.5 text-natural-accent shrink-0" /> {item.size}
                      </span>
                    ) : (
                      <span>{item.size || "Unknown"}</span>
                    )}
                  </div>
                </div>
              </div>

              <a
                href={item.dataUrl}
                download={`${item.name}.pdf`}
                onClick={() => triggerToast(`Successfully initiated download for ${item.name}.pdf`, "success")}
                className="p-1.5 text-stone-400 hover:text-natural-accent hover:bg-natural-badge/40 rounded-lg border border-transparent hover:border-stone-200 transition"
                title="Download single file"
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-stone-50 border border-stone-100 rounded-xl text-[10px] text-stone-500 font-medium flex gap-2 text-left">
          <Info className="w-4 h-4 text-natural-accent shrink-0 mt-0.5" />
          <p>
            These documents are stored temporarily in-memory. Deleting or closing this tab will clear this session download cabinet.
          </p>
        </div>
      </motion.div>

      {/* Floating Global Toast Notification Layer */}
      <div 
        id="toast_notification_portal"
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <motion.div
              layout
              key={toast.id}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -20, transition: { duration: 0.2 } }}
              className="pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border text-xs font-medium w-80 bg-white/95 backdrop-blur-md text-natural-text border-stone-200/90"
            >
              {toast.type === "success" && (
                <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                </div>
              )}
              {toast.type === "error" && (
                <div className="w-5 h-5 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                </div>
              )}
              {toast.type === "info" && (
                <div className="w-5 h-5 rounded-full bg-stone-50 text-natural-accent flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
                  <Info className="w-3.5 h-3.5" />
                </div>
              )}

              <div className="flex-1 min-w-0 text-left">
                <p className="font-bold text-stone-950 font-serif mb-0.5">
                  {toast.type === "success"
                    ? "Download Action"
                    : toast.type === "error"
                    ? "System Error"
                    : "Processing Operation"}
                </p>
                <p className="text-[10px] text-stone-500 font-medium leading-relaxed">{toast.message}</p>
              </div>

              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-stone-400 hover:text-stone-700 p-0.5 rounded-lg shrink-0 cursor-pointer"
                title="Dismiss details"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
