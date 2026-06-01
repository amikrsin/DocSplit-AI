import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LightboxModalProps {
  pdfDoc: any;
  pageNumber: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onClose: () => void;
}

export default function LightboxModal({
  pdfDoc,
  pageNumber,
  totalPages,
  onPageChange,
  onClose,
}: LightboxModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1.2);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!pdfDoc) return;
    let isMounted = true;
    let renderTask: any = null;

    const renderPage = async () => {
      setRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (!isMounted) return;

        const viewport = page.getViewport({ scale: scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

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
          setRendering(false);
        }
      } catch (err: any) {
        const isCancelled = err?.name === "RenderingCancelledException" || err?.message?.includes("cancelled") || err?.message?.includes("cancel");
        if (!isCancelled) {
          console.error("High-res render failure:", err);
        }
        if (isMounted) {
          setRendering(false);
        }
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDoc, pageNumber, scale]);

  const handlePrev = () => {
    if (pageNumber > 1) onPageChange(pageNumber - 1);
  };

  const handleNext = () => {
    if (pageNumber < totalPages) onPageChange(pageNumber + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-4xl bg-white border border-stone-200 rounded-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl glass-card text-natural-text">
        
        {/* Header Controls */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-50/50 border-b border-stone-200/50">
          <div className="flex items-center gap-3">
            <h3 className="text-natural-text font-serif font-bold text-sm">Zoom Inspecting Page</h3>
            <span className="font-mono bg-natural-badge text-natural-accent text-xs px-2.5 py-1 rounded-lg font-bold">
              {pageNumber} of {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setScale(s => Math.max(0.6, s - 0.2))}
              className="p-1.5 rounded-lg bg-stone-100 border border-stone-200 text-natural-accent hover:bg-natural-badge transition cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setScale(s => Math.min(2.5, s + 0.2))}
              className="p-1.5 rounded-lg bg-stone-100 border border-stone-200 text-natural-accent hover:bg-natural-badge transition cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-stone-200 mx-1"></div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-stone-100 border border-stone-200 text-stone-600 hover:text-stone-900 transition cursor-pointer"
              title="Close modal"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Dynamic Image Canvas Workspace */}
        <div className="flex-1 overflow-auto p-8 flex items-center justify-center relative min-h-[350px] bg-stone-50/20">
          {rendering && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-xs">
              <div className="w-8 h-8 rounded-full border-2 border-stone-200 border-t-natural-accent animate-spin"></div>
            </div>
          )}
          <motion.div 
            layout 
            className="shadow-2xl rounded-lg overflow-hidden bg-white max-w-full"
          >
            <canvas ref={canvasRef} className="block transition-transform duration-100 ease-out" />
          </motion.div>
        </div>

        {/* Footer Trait Controls */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-50/50 border-t border-stone-200/50">
          <button
            onClick={handlePrev}
            disabled={pageNumber === 1}
            className={`flex items-center gap-1 text-xs px-4 py-2 rounded-xl font-bold transition cursor-pointer ${
              pageNumber === 1
                ? "text-stone-300 bg-stone-50 cursor-not-allowed"
                : "text-natural-accent bg-natural-badge/60 hover:bg-natural-badge"
            }`}
          >
            <ChevronLeft className="w-4 h-4" /> Prev Page
          </button>

          <span className="font-mono text-xs text-stone-500 font-semibold">
            Use navigation keys or buttons to scrub document
          </span>

          <button
            onClick={handleNext}
            disabled={pageNumber === totalPages}
            className={`flex items-center gap-1 text-xs px-4 py-2 rounded-xl font-bold transition cursor-pointer ${
              pageNumber === totalPages
                ? "text-stone-300 bg-stone-50 cursor-not-allowed"
                : "text-natural-accent bg-natural-badge/60 hover:bg-natural-badge"
            }`}
          >
            Next Page <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
