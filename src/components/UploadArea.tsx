import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { UploadCloud, FileText, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { DocumentState } from "../types";

interface UploadAreaProps {
  onDocumentLoaded: (doc: DocumentState) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function UploadArea({ onDocumentLoaded, isLoading, setIsLoading }: UploadAreaProps) {
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate and process the selected file
  const processFile = async (file: File) => {
    setErrorMsg(null);
    setIsLoading(true);
    setProgressMsg("Checking file metadata...");

    const extension = file.name.split(".").pop()?.toLowerCase();
    
    // Validation
    const allowedExtensions = ["pdf", "docx", "doc"];
    if (!extension || !allowedExtensions.includes(extension)) {
      setErrorMsg("Invalid file format. Please upload a PDF, DOCX, or DOC document.");
      setIsLoading(false);
      return;
    }

    // Size check: Premium limit is 500 MB
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) {
      setErrorMsg("File is too large. Enterprise tier maximum size is 500 MB.");
      setIsLoading(false);
      return;
    }

    try {
      if (extension === "pdf") {
        setProgressMsg("Reading PDF file structure...");
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            if (!arrayBuffer) throw new Error("Could not read file binary buffer.");

            // Convert array buffer to base64
            const uint8 = new Uint8Array(arrayBuffer);
            let binary = "";
            const chunkSz = 0x8000; // 32k chunking to avoid stack overflows
            for (let i = 0; i < uint8.length; i += chunkSz) {
              binary += String.fromCharCode.apply(null, Array.from(uint8.subarray(i, i + chunkSz)));
            }
            const base64 = btoa(binary);

            // Get doc specs using pdf.js
            if (!(window as any).pdfjsLib) {
              throw new Error("PDF renderer is initializing. Please wait 1 second and retry.");
            }

            setProgressMsg("Rendering document layout...");
            const loadingTask = (window as any).pdfjsLib.getDocument({ data: arrayBuffer });
            const pdfDoc = await loadingTask.promise;
            
            onDocumentLoaded({
              name: file.name,
              size: file.size,
              type: "pdf",
              pagesCount: pdfDoc.numPages,
              base64: base64,
            });
            setIsLoading(false);
          } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || "Failed to process PDF components.");
            setIsLoading(false);
          }
        };

        reader.onerror = () => {
          setErrorMsg("Failed to read local document files.");
          setIsLoading(false);
        };

        reader.readAsArrayBuffer(file);

      } else {
        // Word DOCX or DOC file
        setProgressMsg("Uploading & converting Word layout to PDF...");
        const reader = new FileReader();

        reader.onload = async (e) => {
          try {
            const dataUrl = e.target?.result as string;
            const base64Content = dataUrl.split(",")[1];

            const response = await fetch("/api/convert-docx", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileBase64: base64Content,
                filename: file.name,
              }),
            });

            let result: any = null;
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              try {
                result = await response.json();
              } catch (parseErr) {
                console.warn("JSON parsing of response failed:", parseErr);
              }
            }

            if (!response.ok) {
              if (response.status === 413) {
                throw new Error("This document is too large for the conversion server's memory limits. Please convert your Word document to a PDF locally and upload the PDF directly.");
              } else if (response.status === 502 || response.status === 503 || response.status === 504) {
                throw new Error(`The document conversion gateway is temporarily busy or timed out (status ${response.status}). To process this file immediately, please export it as a PDF locally first and upload the PDF here.`);
              }
              throw new Error(result?.error || `Server returned HTTP status ${response.status}. We suggest saving this file as a PDF locally and uploading it.`);
            }

            if (!result || !result.success) {
              throw new Error(result?.error || "The Word-to-PDF conversion was unsuccessful. We recommend exporting the document as a PDF locally first and uploading the PDF.");
            }

            // Successfully received PDF base64 converted inside the node core backend!
            const pdfBase64 = result.pdfBase64;
            const pdfBin = atob(pdfBase64);
            const pdfArr = new Uint8Array(pdfBin.length);
            for (let i = 0; i < pdfBin.length; i++) {
              pdfArr[i] = pdfBin.charCodeAt(i);
            }

            onDocumentLoaded({
              name: file.name.replace(/\.(docx|doc)$/i, "") + "_converted.pdf",
              size: file.size, // Kept original indicator
              type: "docx",
              pagesCount: result.pagesCount,
              base64: pdfBase64,
            });
            setIsLoading(false);
          } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || "Word conversion failed. Make sure server is online.");
            setIsLoading(false);
          }
        };

        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Upload system fault occurred.");
      setIsLoading(false);
    }
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div id="upload_module_container" className="w-full">
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex flex-col items-center justify-center border-2 border-dashed border-natural-accent bg-natural-badge/20 rounded-2xl p-12 text-center shadow-xs"
          >
            <RefreshCw className="w-12 h-12 text-natural-accent animate-spin mb-4" />
            <h3 className="font-semibold text-lg text-natural-text">Processing Your Document</h3>
            <p className="text-sm text-slate-500 max-w-sm mt-1 mb-4">{progressMsg}</p>
            <div className="w-48 bg-stone-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-natural-accent h-full rounded-full animate-[progress_1.5s_infinite]" style={{ width: "60%" }}></div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="uploader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative"
          >
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerInput}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                dragActive
                  ? "border-natural-accent bg-natural-badge/40 shadow-xs"
                  : "border-natural-accent/15 bg-white/75 hover:border-natural-accent/40 hover:bg-natural-badge/20 glass-card"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.doc"
                onChange={handleChange}
              />
              
              <div className="w-16 h-16 rounded-2xl bg-natural-badge/50 flex items-center justify-center mb-4 transition-transform group-hover:scale-105">
                <UploadCloud className="w-8 h-8 text-natural-accent" />
              </div>

              <h3 className="text-lg font-bold font-serif text-natural-text tracking-tight">
                Upload your document
              </h3>
              <p className="text-sm text-stone-600 mt-1 mb-6 max-w-sm">
                Drag and drop your file here, or click to browse. Supports <strong className="font-semibold text-natural-text">PDF, DOCX, & DOC</strong> up to 500 MB.
              </p>

              <div className="flex flex-wrap justify-center gap-3 text-[10px]">
                <span className="flex items-center gap-1.5 bg-neutral-100 py-1 px-2.5 rounded-lg text-neutral-600 font-semibold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-natural-accent"></span> Purchase Orders
                </span>
                <span className="flex items-center gap-1.5 bg-neutral-100 py-1 px-2.5 rounded-lg text-neutral-600 font-semibold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-natural-accent"></span> Invoices
                </span>
                <span className="flex items-center gap-1.5 bg-neutral-100 py-1 px-2.5 rounded-lg text-neutral-600 font-semibold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-natural-accent"></span> Employee Records
                </span>
                <span className="flex items-center gap-1.5 bg-neutral-100 py-1 px-2.5 rounded-lg text-neutral-600 font-semibold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-natural-accent"></span> Contracts
                </span>
              </div>
            </div>

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-sm flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-rose-900">Document upload issue</h4>
                  <p className="text-rose-700 mt-0.5">{errorMsg}</p>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
