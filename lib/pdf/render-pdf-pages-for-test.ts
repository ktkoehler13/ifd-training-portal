import { mkdtemp, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

export async function renderPdfBytesToPngPages(
  pdfBytes: Uint8Array,
  outputDirectory?: string,
): Promise<{ outputDirectory: string; pngPaths: string[] } | null> {
  const pdftoppm = spawnSync("which", ["pdftoppm"]);
  if (pdftoppm.status !== 0 || !pdftoppm.stdout.toString().trim()) {
    return null;
  }

  const directory =
    outputDirectory ??
    (await mkdtemp(path.join(os.tmpdir(), "ifd-approved-packet-")));
  const pdfPath = path.join(directory, "approved-packet.pdf");
  await writeFile(pdfPath, pdfBytes);

  const prefix = path.join(directory, "page");
  const render = spawnSync("pdftoppm", ["-png", pdfPath, prefix], {
    encoding: "utf8",
  });

  if (render.status !== 0) {
    throw new Error(render.stderr || "pdftoppm failed to render the approved packet.");
  }

  return {
    outputDirectory: directory,
    pngPaths: [path.join(directory, "page-1.png"), path.join(directory, "page-2.png")],
  };
}
