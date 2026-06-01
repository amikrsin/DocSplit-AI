import { useEffect, useRef, useState } from "react";
import { ZoomIn, Check, Sparkles, Download } from "lucide-react";
import { motion } from "motion/react";

interface PageThumbnailProps {
  key?: any;
  pdfDoc: any; // Checked window.pdfjsLib instance
  pageNumber: number; // 1-based page index
  isSelected: boolean;
  onToggleSelect: () => void;
  zoomScale: number;
  onOpenZoomModal: (pageNumber: number) => void;
  aiBadgeReason?: string; // Reason description from AI analysis
  onDownloadSinglePage?: (pageNumber: number) => void;
}

export default function PageThumbnail({
  pdfDoc,
  pageNumber,
  isSelected,
  onToggleSelect,
  zoomScale,
  onOpenZoomModal,
  aiBadgeReason,
  onDownloadSinglePage,
}: PageThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Set up intersection observer to lazy-render the page canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      {
        rootMargin: "300px", // Star rendering as the item approaches the viewport within 300px limits
        threshold: 0.01,
      }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!pdfDoc || !isVisible) return;
    let isMounted = true;
    let renderTask: any = null;

    const renderCanvas = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (!isMounted) return;

        // Base thumbnail viewport scale adjusted by slider zoom values
        const scaleValue = 0.35 * zoomScale;
        const viewport = page.getViewport({ scale: scaleValue });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        // Match device pixel ratio for crystal clear text rendering
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.scale(dpr, dpr);

        renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
        });

        await renderTask.promise;
        if (isMounted) {
          setIsRendered(true);
        }
      } catch (err: any) {
        const isCancelled = err?.name === "RenderingCancelledException" || err?.message?.includes("cancelled") || err?.message?.includes("cancel");
        if (!isCancelled) {
          console.error(`Page ${pageNumber} render failed:`, err);
          if (isMounted) {
            setRenderError(true);
          }
        }
      }
    };

    renderCanvas();

    return () => {
      isMounted = false;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch (e) {
          // ignore cancel warnings
        }
      }
    };
  }, [pdfDoc, pageNumber, zoomScale, isVisible]);

  return (
    <motion.div
      ref={containerRef}
      whileHover={{ y: -3, scale: 1.01 }}
      className={`group relative flex flex-col bg-white rounded-xl border p-2.5 transition-all text-left shadow-2xs select-none ${
        isSelected
          ? "border-natural-accent ring-2 ring-natural-accent/20 bg-natural-badge/15"
          : "border-slate-200 hover:border-natural-accent/35"
      }`}
    >
      {/* Selector Checkbox Indicator or Circle clicker */}
      <div 
        onClick={onToggleSelect}
        className="absolute top-4 left-4 z-10 cursor-pointer"
      >
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
            isSelected
              ? "bg-natural-accent border-natural-accent text-white shadow-xs"
              : "bg-white/90 backdrop-blur-xs border-stone-300 hover:border-stone-400 text-transparent"
          }`}
        >
          <Check className="w-4 h-4 stroke-[3]" />
        </div>
      </div>

      {/* Magnify Tool Action */}
      <button
        onClick={() => onOpenZoomModal(pageNumber)}
        className="absolute top-4 right-4 z-10 w-8 h-8 rounded-lg bg-white/90 backdrop-blur-xs border border-slate-200 flex items-center justify-center text-slate-600 opacity-0 group-hover:opacity-100 transition-all hover:bg-white hover:text-natural-accent shadow-xs"
        title="Zoom and inspect pages"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      {/* Page Canvas Rendering Zone */}
      <div 
        onClick={onToggleSelect}
        className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-stone-50 flex items-center justify-center cursor-pointer border border-stone-100"
      >
        {!isRendered && !renderError && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-50">
            <div className="w-6 h-6 rounded-full border-2 border-stone-200 border-t-natural-accent animate-spin"></div>
          </div>
        )}
        
        {renderError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-50 p-2 text-center text-rose-500 font-mono text-[10px]">
            <span>Error</span>
            <span>Render</span>
          </div>
        )}

        <canvas ref={canvasRef} className="block shadow-2xs" />
      </div>

      {/* Page Label & Metadata Row */}
      <div className="flex items-center justify-between mt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-natural-text bg-natural-badge/60 px-2 py-0.5 rounded-md">
            Page {pageNumber}
          </span>
          {onDownloadSinglePage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownloadSinglePage(pageNumber);
              }}
              className={`p-1 rounded-lg border transition-all cursor-pointer ${
                isSelected
                  ? "bg-natural-accent border-natural-accent text-white hover:bg-natural-accent/90 shadow-2xs"
                  : "bg-stone-50 border-stone-200 text-stone-500 hover:text-natural-accent hover:border-natural-accent/30 hover:bg-natural-badge/25"
              }`}
              title={`Download Page ${pageNumber} immediately`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        
        {aiBadgeReason && (
          <span 
            className="flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2 py-0.5 font-medium truncate max-w-[120px]"
            title={aiBadgeReason}
          >
            <Sparkles className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{aiBadgeReason}</span>
          </span>
        )}
      </div>
    </motion.div>
  );
}
