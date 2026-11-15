export interface ApprovedPacket {
  request_id: string;
  storage_bucket: string;
  storage_path: string;
  filename: string;
  sha256: string | null;
  file_size_bytes: number | null;
  status: string;
}

const MAX_PACKET_BYTES = 15 * 1024 * 1024;

export function approvedPacketPath(packet: ApprovedPacket | undefined, requestId: string): string {
  if (!packet || packet.status !== "ready") throw new Error("Approved forms are not ready yet; delivery will retry.");
  if (packet.request_id !== requestId || packet.storage_bucket !== "training-request-packets" || packet.storage_path !== `${requestId}/approved-packet.pdf`) throw new Error("Approved packet location is invalid.");
  if (!packet.file_size_bytes || packet.file_size_bytes > MAX_PACKET_BYTES || !/^[a-f0-9]{64}$/.test(packet.sha256 ?? "")) throw new Error("Approved packet metadata is invalid.");
  return `${packet.storage_bucket}/${packet.storage_path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function verifiedPacketAttachment(packet: ApprovedPacket, bytes: Uint8Array) {
  if (bytes.byteLength !== packet.file_size_bytes || bytes.byteLength > MAX_PACKET_BYTES || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Approved packet contents are invalid.");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hash !== packet.sha256) throw new Error("Approved packet integrity check failed.");
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  const filename = packet.filename.replace(/[\r\n\\/\x00-\x1f]/g, "_").slice(0, 180);
  return { filename: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename || "approved-training-packet"}.pdf`, content: btoa(chunks.join("")), content_type: "application/pdf" };
}
