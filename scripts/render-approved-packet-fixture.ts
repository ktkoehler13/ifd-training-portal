import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APPROVED_PACKET_VISUAL_FIXTURE_INPUT } from "@/lib/pdf/approved-packet-visual-fixture";
import { generateApprovedPacketBytes } from "@/lib/pdf/generate-approved-packet";
import { renderPdfBytesToPngPages } from "@/lib/pdf/render-pdf-pages-for-test";

async function main() {
  const bytes = await generateApprovedPacketBytes(APPROVED_PACKET_VISUAL_FIXTURE_INPUT);
  const outputDirectory = await mkdtemp(
    path.join(os.tmpdir(), "ifd-approved-packet-fixture-"),
  );
  const rendered = await renderPdfBytesToPngPages(bytes, outputDirectory);

  console.log(`Generated approved packet PDF (${bytes.byteLength} bytes).`);
  console.log(`Output directory: ${outputDirectory}`);

  if (rendered) {
    console.log("Rendered PNG pages:");
    for (const pngPath of rendered.pngPaths) {
      console.log(`- ${pngPath}`);
    }
  } else {
    console.log("pdftoppm is not installed; inspect the PDF manually.");
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
