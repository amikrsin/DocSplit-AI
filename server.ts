import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { execSync } from "child_process";

const app = express();
const PORT = 3000;

try {
  let binChecked: Record<string, any> = {};
  const bins = ["libreoffice", "soffice", "pandoc", "wvWare", "docx2pdf"];
  for (const bin of bins) {
    try {
      const out = execSync(`which ${bin} || echo "no"`, { encoding: "utf8" });
      binChecked[bin] = out.trim() !== "no" ? out.trim() : false;
    } catch (e) {
      binChecked[bin] = false;
    }
  }

  // Deep recursive scan for soffice or libreoffice in system directories
  function findExecutable(dir: string, targets: string[], depth = 0, maxDepth = 5): string[] {
    if (depth > maxDepth) return [];
    let results: string[] = [];
    try {
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch (e) {
          continue;
        }
        if (stat.isDirectory()) {
          // Avoid scanning extremely large irrelevant directories recursively
          if (file === "share" || file === "src" || file === "node_modules" || file === "cache") continue;
          results = results.concat(findExecutable(fullPath, targets, depth + 1, maxDepth));
        } else {
          if (targets.includes(file)) {
            // Check if executable
            try {
              fs.accessSync(fullPath, fs.constants.X_OK);
              results.push(fullPath);
            } catch (pErr) {
              results.push(`${fullPath} (non-exec)`);
            }
          }
        }
      }
    } catch (err) {
      // ignore read/permission errors
    }
    return results;
  }

  const foundExecutables: string[] = [];
  try {
    foundExecutables.push(...findExecutable("/usr", ["soffice", "libreoffice"]));
    foundExecutables.push(...findExecutable("/opt", ["soffice", "libreoffice"]));
  } catch (pScanErr) {
    console.error("Scan error:", pScanErr);
  }

  binChecked["foundExecutables_scan"] = foundExecutables;
  fs.writeFileSync("detected_bins.txt", JSON.stringify(binChecked, null, 2), "utf8");
} catch (e) {
  console.error("Root diagnostic write failed:", e);
}

// High limits for processing documents (PDFs can be large)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Path to durable history file
const HISTORY_FILE = path.join(process.cwd(), "history.json");

// Helper to read and write database history
function getHistoryDB() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading history DB:", error);
  }
  return [];
}

function saveHistoryDB(history: any[]) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving history DB:", error);
  }
}

// 1. Initialize Gemini SDK server-side
const aiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({
  apiKey: aiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Utility to clean text XML tags and decode HTML entities
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/* ==========================================
   API ENDPOINTS
   ========================================== */

// Check server status
app.get("/api/health", (req, res) => {
  let binChecked: Record<string, string | boolean> = {};
  
  const bins = ["libreoffice", "soffice", "pandoc", "wvWare", "docx2pdf"];
  for (const bin of bins) {
    try {
      const out = require("child_process").execSync(`which ${bin} || echo "no"`, { encoding: "utf8" });
      binChecked[bin] = out.trim() !== "no" ? out.trim() : false;
    } catch (e) {
      binChecked[bin] = false;
    }
  }

  // Scan common system directories for soffice or libreoffice
  const commonPaths = [
    "/usr/bin/libreoffice",
    "/usr/bin/soffice",
    "/usr/lib/libreoffice/program/soffice",
    "/usr/lib64/libreoffice/program/soffice",
    "/opt/libreoffice/program/soffice",
    "/opt/libreoffice7.6/program/soffice",
    "/opt/libreoffice7.5/program/soffice",
    "/opt/libreoffice7.4/program/soffice",
    "/opt/soffice/program/soffice",
    "/usr/local/bin/soffice",
    "/usr/local/bin/libreoffice"
  ];
  let foundPaths: string[] = [];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      foundPaths.push(p);
    }
  }

  res.json({ status: "ok", apiKeyInstalled: !!aiKey, systemBinaries: binChecked, foundPaths });
});

// Load Split History
app.get("/api/history", (req, res) => {
  const history = getHistoryDB();
  res.json(history);
});

// Add History Entry
app.post("/api/history", (req, res) => {
  try {
    const { filename, splitType, pages, outputCount } = req.body;
    const history = getHistoryDB();
    const newEntry = {
      id: "hist_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      filename: filename || "Untitled Document",
      uploadedAt: new Date().toISOString(),
      splitType: splitType || "Individual Pages",
      pages: pages || 0,
      outputCount: outputCount || 0,
    };
    history.unshift(newEntry);
    // Keep history down to last 50 entries
    if (history.length > 50) history.pop();
    saveHistoryDB(history);
    res.json(newEntry);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear History
app.delete("/api/history", (req, res) => {
  saveHistoryDB([]);
  res.json({ success: true });
});

// Delete specific entry
app.delete("/api/history/:id", (req, res) => {
  try {
    const { id } = req.params;
    let history = getHistoryDB();
    history = history.filter((item: any) => item.id !== id);
    saveHistoryDB(history);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Core API: Converts DOCX/DOC contents to PDF using headless LibreOffice
app.post("/api/convert-docx", async (req, res) => {
  let tempInputPath = "";
  let expectedPdfPath = "";
  try {
    const { fileBase64, filename } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ error: "Missing file data (fileBase64)" });
    }

    const docxName = filename || "document.docx";
    const fileBuffer = Buffer.from(fileBase64, "base64");
    
    // Generate secure unique path in /tmp to prevent race conditions during parallel uploads
    const tempId = Date.now() + "_" + Math.random().toString(36).substring(2, 8);
    // Sanitize filename to containing only letters, numbers, hyphens, and underscores for bash execution safety
    const sanitizedExt = path.extname(docxName);
    const sanitizedBase = path.basename(docxName, sanitizedExt).replace(/[^a-zA-Z0-9_-]/g, "_");
    const sanitizedName = `${sanitizedBase}${sanitizedExt}`;

    tempInputPath = path.join("/tmp", `${tempId}_${sanitizedName}`);
    fs.writeFileSync(tempInputPath, fileBuffer);

    // Set up unique isolated user profile path to prevent standard concurrent config clashes and lock file jams
    const userProfDir = path.join("/tmp", `lo_profile_${tempId}`);
    const userRegistryDir = path.join(userProfDir, "user");
    
    // Auto-create directory and initialize registry file to configure headless parameters
    try {
      fs.mkdirSync(userRegistryDir, { recursive: true });
      
      // Configuration preserves all layout pages (including blank delimiters or section breaks) to maintain document layout structure
      const xcuContent = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <item oor:path="/org.openoffice.Office.Common/Filter/PDF/Export">
    <prop oor:name="IsSkipEmptyPages" oor:op="fuse" oor:type="xs:boolean"><value>false</value></prop>
    <prop oor:name="ExportEmptyPages" oor:op="fuse" oor:type="xs:boolean"><value>true</value></prop>
    <prop oor:name="ExportPlaceholders" oor:op="fuse" oor:type="xs:boolean"><value>true</value></prop>
  </item>
  <item oor:path="/org.openoffice.Office.Writer/Print">
    <prop oor:name="EmptyPages" oor:op="fuse" oor:type="xs:boolean"><value>true</value></prop>
  </item>
</oor:items>`;
      fs.writeFileSync(path.join(userRegistryDir, "registrymodifications.xcu"), xcuContent);
    } catch (profilePrepErr) {
      console.warn("Failed to prepare isolated LibreOffice profile settings:", profilePrepErr);
    }

    console.log(`Converting ${tempInputPath} to PDF using headless LibreOffice with isolated profile...`);
    
    // Invoke LibreOffice headless conversion
    try {
      execSync(`libreoffice "-env:UserInstallation=file://${userProfDir}" --headless --convert-to pdf --outdir /tmp "${tempInputPath}"`, {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (execErr: any) {
      console.error("LibreOffice execute error, trying soffice fallback command...", execErr.message);
      // Fallback command utilizing soffice
      execSync(`soffice "-env:UserInstallation=file://${userProfDir}" --headless --convert-to pdf --outdir /tmp "${tempInputPath}"`, {
        encoding: "utf8",
        stdio: "pipe",
      });
    }

    // Determine expected PDF filename from the conversion output
    const expectedPdfName = `${tempId}_${sanitizedBase}.pdf`;
    expectedPdfPath = path.join("/tmp", expectedPdfName);

    if (!fs.existsSync(expectedPdfPath)) {
      throw new Error(`LibreOffice conversion completed but output PDF was not found at expected path: ${expectedPdfPath}`);
    }

    // Load PDF to verify and extract precise page count
    const pdfBuffer = fs.readFileSync(expectedPdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pagesCount = pdfDoc.getPageCount();

    // Convert converted PDF back to Base64 to return to workspace previewer
    const pdfBase64 = pdfBuffer.toString("base64");

    // Clean up temporary files on success
    try {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (fs.existsSync(expectedPdfPath)) fs.unlinkSync(expectedPdfPath);
      if (fs.existsSync(userProfDir)) fs.rmSync(userProfDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn("Temporary file cleanup warning:", cleanupErr);
    }

    res.json({
      success: true,
      originalName: docxName,
      pdfBase64: pdfBase64,
      pagesCount: pagesCount,
    });

  } catch (error: any) {
    console.error("DOCX To PDF LibreOffice Conversion Error:", error);
    
    // Safe cleanup in case of failures
    try {
      if (tempInputPath && fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (expectedPdfPath && fs.existsSync(expectedPdfPath)) fs.unlinkSync(expectedPdfPath);
    } catch (cleanupErr) {
      // ignore
    }

    res.status(500).json({ 
      error: error.message || "Failed to render Word document using LibreOffice engine." 
    });
  }
});

// Core AI Endpoint: Smart Split helper utilizing Gemini API
// This will analyze index page snippets or file metadata and detect boundaries
app.post("/api/gemini/analyze", async (req, res) => {
  try {
    if (!aiKey) {
      return res.status(200).json({
        success: false,
        error: "GEMINI_API_KEY environment variable is not defined. Please add it inside the Secrets panel relative to the AI instructions.",
      });
    }

    const { pagesExcerpt, docFilename } = req.body;
    if (!pagesExcerpt || !Array.isArray(pagesExcerpt)) {
      return res.status(400).json({ error: "Missing array of pagesExcerpt descriptions" });
    }

    // System instructions feeding
    const systemInstruction = `
      You are an expert document routing and AI classification assistant named DocSplit Smart AI.
      Your goal is to scan a set of text outlines from consecutive pages of a compiled document package, identify where logical partitions transition (e.g., changes in invoice number, changes in PO code, content categories, or employee names), and propose optimal boundaries/ranges to split them.

      For instance, if page 1, 2, and 3 have text referring to "Invoice #1005" and page 4 has "Invoice #1006", then pages 1-3 is Group A, page 4 is Group B.

      You must return structural, automated grouping rules in a specified clean JSON schema.
    `;

    const userPrompt = `
      Analyze the following page indices extracted from the uploaded document: "${docFilename || "unnamed.pdf"}".

      ${pagesExcerpt.map((p, i) => `Page ${i + 1}:\n"""\n${p}\n"""`).join("\n\n")}

      Determine the classification category for this overall document and suggest named groups with page ranges (1-indexed) based on logical boundary changes.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentType: {
              type: Type.STRING,
              description: "The identified category: 'Invoices Bundle', 'Purchase Orders Pack', 'Contract Agreements', 'HR Logs', 'Compliance Packet', 'Technical Guide', or 'General Report'",
            },
            confidence: {
              type: Type.NUMBER,
              description: "Confidence from 0.0 to 1.0",
            },
            explanation: {
              type: Type.STRING,
              description: "A summary explanation of why and where the transitions/dividers happen.",
            },
            groups: {
              type: Type.ARRAY,
              description: "List of proposed split groups",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: {
                    type: Type.STRING,
                    description: "Descriptive name for the grouped PDF file (e.g. 'Invoice-2034', 'PO-992-Part1', or 'Sourcing_Addendum')",
                  },
                  pages: {
                    type: Type.ARRAY,
                    description: "List of page indices (1-based integers) that belong in this group",
                    items: {
                      type: Type.INTEGER,
                    },
                  },
                  reason: {
                    type: Type.STRING,
                    description: "Short line indicating why these pages are bundled (e.g., 'Same Invoice Number #5502')",
                  },
                },
                required: ["name", "pages", "reason"],
              },
            },
          },
          required: ["documentType", "confidence", "explanation", "groups"],
        },
      },
    });

    const answer = JSON.parse(response.text.trim());
    res.json({ success: true, analysis: answer });

  } catch (error: any) {
    console.error("Gemini AI Analysis Error:", error);
    res.status(500).json({ error: error.message || "Failed during Gemini AI split analysis." });
  }
});

/* ==========================================
   VITE & STATIC MIDDLEWARE SETUP
   ========================================== */

if (process.env.NODE_ENV !== "production") {
  const startDevServer = async () => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Dynamic routing fallback for SPA in dev
    app.use("*", async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running in DEVELOPMENT mode on http://localhost:${PORT}`);
    });
  };

  startDevServer();
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));

  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running in PRODUCTION mode on http://localhost:${PORT}`);
  });
}
