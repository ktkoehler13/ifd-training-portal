import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSignatureSnapshotMetadata,
  getApprovedPacketStoragePath,
  getSignatureSnapshotStoragePath,
  isValidSignatureSnapshotPath,
  sha256Hex,
  SIGNATURE_REQUIRED_MESSAGE,
} from "./training-request-signature-snapshot";
import { buildTrainingRequestFilename } from "./training-request-filename";

describe("training request signature snapshots", () => {
  const requestId = "11111111-1111-1111-1111-111111111111";
  const mtoActionId = "22222222-2222-2222-2222-222222222222";
  const deputyActionId = "33333333-3333-3333-3333-333333333333";
  const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d]);

  it("requires a stored signature before signing", () => {
    assert.equal(
      SIGNATURE_REQUIRED_MESSAGE,
      "You must save your signature before signing this training request action.",
    );
  });

  it("uses immutable MTO approval snapshot paths", () => {
    const path = getSignatureSnapshotStoragePath(requestId, mtoActionId);
    assert.equal(path, `${requestId}/${mtoActionId}/signature.png`);
    assert.ok(isValidSignatureSnapshotPath(requestId, mtoActionId, path));
  });

  it("uses immutable Deputy Chief approval snapshot paths", () => {
    const path = getSignatureSnapshotStoragePath(requestId, deputyActionId);
    assert.equal(path, `${requestId}/${deputyActionId}/signature.png`);
    assert.notEqual(path, getSignatureSnapshotStoragePath(requestId, mtoActionId));
  });

  it("does not reuse live personnel signature paths for action snapshots", () => {
    const livePersonnelPath = `${deputyActionId}/signature.png`;
    const snapshotPath = getSignatureSnapshotStoragePath(requestId, deputyActionId);
    assert.notEqual(livePersonnelPath, snapshotPath);
  });

  it("calculates SHA-256 hashes from exact PNG bytes", () => {
    const metadata = buildSignatureSnapshotMetadata({
      requestId,
      actionId: mtoActionId,
      pngBytes,
    });

    assert.equal(metadata.sha256, sha256Hex(pngBytes));
    assert.match(metadata.sha256, /^[0-9a-f]{64}$/);
    assert.equal(metadata.mimeType, "image/png");
    assert.equal(metadata.fileSizeBytes, pngBytes.byteLength);
  });

  it("uses a stable approved packet storage path", () => {
    const first = getApprovedPacketStoragePath(requestId);
    const second = getApprovedPacketStoragePath(requestId);
    assert.equal(first, second);
    assert.equal(first, `${requestId}/approved-packet.pdf`);
  });

  it("uses the request number for the download filename", () => {
    const filename = buildTrainingRequestFilename({
      status: "approved",
      requestNumber: "Koehler, K, Fire Officer I, 2026.1",
    });

    assert.equal(filename, "Koehler, K, Fire Officer I, 2026.1.pdf");
  });
});
