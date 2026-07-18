export interface PersonnelSignatureFailureCleanupPlan {
  removePendingPath: boolean;
  restoreFromBackup: boolean;
  removePromotedFinalPath: boolean;
  removeUnusedBackupPath: boolean;
}

export function getPersonnelSignatureFailureCleanupPlan(input: {
  pendingUploaded: boolean;
  finalPromoted: boolean;
  backupCreated: boolean;
  hadExistingFinal: boolean;
}): PersonnelSignatureFailureCleanupPlan {
  return {
    removePendingPath: input.pendingUploaded,
    restoreFromBackup: input.finalPromoted && input.backupCreated,
    removePromotedFinalPath: input.finalPromoted && !input.hadExistingFinal,
    removeUnusedBackupPath: input.backupCreated && !input.finalPromoted,
  };
}
