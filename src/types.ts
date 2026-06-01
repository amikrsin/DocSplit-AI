export interface SplitHistoryItem {
  id: string;
  filename: string;
  uploadedAt: string;
  splitType: string;
  pages: number;
  outputCount: number;
}

export type SplitMode = "individual" | "selected" | "range" | "group" | "smart-ai" | "auto-split";

export interface DocumentState {
  name: string;
  size: number;
  type: string;
  pagesCount: number;
  base64: string; // Base64 raw PDF data
}

export interface SplitGroup {
  id: string;
  name: string;
  pages: number[]; // 1-based page index array
  reason?: string;
}

export interface SplitOutput {
  id: string;
  name: string;
  pages: number[];
  base64?: string; // Generated PDF
  dataUrl?: string; // Printable URL link
  size?: string; // Formatted file size
  isCompressed?: boolean;
  originalSize?: string;
}

export interface AISmartAnalysis {
  documentType: string;
  confidence: number;
  explanation: string;
  groups: Array<{
    name: string;
    pages: number[];
    reason: string;
  }>;
}
