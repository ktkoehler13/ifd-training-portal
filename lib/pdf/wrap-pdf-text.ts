import type { PDFFont } from "pdf-lib";

// Standard PDF fonts support WinAnsi. Normalize controls and substitute unsupported
// glyphs so an optional free-text character cannot make a historical PDF fail.
export function encodePdfText(value: string, font: PDFFont): string {
  return Array.from(value.replace(/\r\n?/g, "\n").replace(/\t/g, " ")).map((char) => {
    if (char === "\n") return char;
    if (char.charCodeAt(0) < 32) return "";
    try { font.encodeText(char); return char; } catch { return "?"; }
  }).join("");
}

export function wrapPdfText(value: string, font: PDFFont, width: number, size = 9): string[] {
  const lines: string[] = [];
  for (const paragraph of encodePdfText(value, font).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const char of word) {
        if (line && font.widthOfTextAtSize(line + char, size) > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

