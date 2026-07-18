import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPersonnelSignatureRestoreFailureError,
  buildPersonnelSignatureRestoreSuccessError,
} from "./personnel-signature-restore-outcome";

describe("personnel signature restore outcome messages", () => {
  it("reports replacement failure and successful restoration", () => {
    const error = buildPersonnelSignatureRestoreSuccessError(
      "Metadata save failed.",
    );

    assert.match(error.message, /Metadata save failed\./);
    assert.match(error.message, /Your previous signature was restored\./);
    assert.doesNotMatch(error.message, /backup remains/i);
    assert.doesNotMatch(error.message, /Manual intervention may be required/i);
  });

  it("reports replacement failure, restoration failure, manual intervention, and backup path", () => {
    const backupPath =
      "11111111-1111-1111-1111-111111111111/pending/backup-22222222-2222-2222-2222-222222222222.png";
    const error = buildPersonnelSignatureRestoreFailureError({
      originalMessage: "Metadata save failed.",
      restoreFailure: new Error(
        "Unable to copy the backup signature back to the final path: copy failed.",
      ),
      backupPath,
    });

    assert.match(error.message, /Metadata save failed\./);
    assert.match(error.message, /Unable to copy the backup signature back to the final path/);
    assert.match(error.message, /Manual intervention may be required\./);
    assert.match(error.message, new RegExp(backupPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(error.message, /Your previous signature was restored/i);
  });
});
