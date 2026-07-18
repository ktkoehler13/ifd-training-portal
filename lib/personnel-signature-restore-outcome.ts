export function buildPersonnelSignatureRestoreSuccessError(
  originalMessage: string,
): Error {
  return new Error(
    `${originalMessage} Your previous signature was restored.`,
  );
}

export function buildPersonnelSignatureRestoreFailureError(input: {
  originalMessage: string;
  restoreFailure: unknown;
  backupPath: string;
}): Error {
  const restoreMessage =
    input.restoreFailure instanceof Error
      ? input.restoreFailure.message
      : "Unable to restore the previous signature.";

  return new Error(
    `${input.originalMessage} ${restoreMessage} Manual intervention may be required. The temporary backup remains at ${input.backupPath}.`,
  );
}
