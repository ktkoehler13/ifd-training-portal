"use client";

import { FormEvent, useEffect, useState } from "react";
import { PersonnelFormFields } from "@/components/admin/PersonnelFormFields";
import { SelfEditConfirmDialog } from "@/components/admin/SelfEditConfirmDialog";
import { Button } from "@/components/ui/Button";
import {
  getSelfEditChanges,
  normalizePersonnelEmail,
  personnelRecordToFormValues,
  SELF_EDIT_NOTICE,
  toPersonnelUpdateInput,
  validatePersonnelForm,
  type PersonnelFormErrors,
  type PersonnelFormValues,
} from "@/lib/personnel";
import type { PersonnelRecord, PersonnelUpdateInput } from "@/types/personnel";

interface EditUserModalProps {
  user: PersonnelRecord | null;
  existingUsers: PersonnelRecord[];
  currentUserEmail: string;
  onClose: () => void;
  onSave: (userId: string, input: PersonnelUpdateInput) => Promise<void>;
  onSelfEmailUpdated: () => Promise<void>;
}

interface EditUserModalContentProps {
  user: PersonnelRecord;
  existingUsers: PersonnelRecord[];
  currentUserEmail: string;
  onClose: () => void;
  onSave: (userId: string, input: PersonnelUpdateInput) => Promise<void>;
  onSelfEmailUpdated: () => Promise<void>;
}

type ConfirmStep = "email" | "identity" | null;

function EditUserModalContent({
  user,
  existingUsers,
  currentUserEmail,
  onClose,
  onSave,
  onSelfEmailUpdated,
}: EditUserModalContentProps) {
  const [values, setValues] = useState<PersonnelFormValues>(() =>
    personnelRecordToFormValues(user),
  );
  const [errors, setErrors] = useState<PersonnelFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmStep, setConfirmStep] = useState<ConfirmStep>(null);
  const [pendingInput, setPendingInput] = useState<PersonnelUpdateInput | null>(
    null,
  );
  const isSelfEdit =
    normalizePersonnelEmail(user.email) ===
    normalizePersonnelEmail(currentUserEmail);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting && !confirmStep) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmStep, isSubmitting, onClose]);

  function buildUpdateInput(): PersonnelUpdateInput {
    const input = toPersonnelUpdateInput(values);

    if (isSelfEdit) {
      return {
        ...input,
        active: user.active,
      };
    }

    return input;
  }

  async function performSave(input: PersonnelUpdateInput) {
    const changes = getSelfEditChanges(user, values, currentUserEmail);

    setIsSubmitting(true);
    setErrors({});

    try {
      await onSave(user.id, input);

      if (isSelfEdit && changes.emailChanged) {
        await onSelfEmailUpdated();
        return;
      }

      onClose();
    } catch (error) {
      setConfirmStep(null);
      setPendingInput(null);
      setErrors({
        submit:
          error instanceof Error
            ? error.message
            : "Unable to save changes. Try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validatePersonnelForm(values, existingUsers, {
      excludeUserId: user.id,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const input = buildUpdateInput();
    const changes = getSelfEditChanges(user, values, currentUserEmail);

    if (!changes.hasChanges) {
      onClose();
      return;
    }

    if (isSelfEdit && changes.activeChanged) {
      setErrors({
        submit: "You cannot deactivate your own signed-in account.",
      });
      return;
    }

    if (isSelfEdit && changes.emailChanged) {
      setPendingInput(input);
      setConfirmStep("email");
      return;
    }

    if (isSelfEdit && changes.requiresIdentityConfirmation) {
      setPendingInput(input);
      setConfirmStep("identity");
      return;
    }

    await performSave(input);
  }

  async function handleConfirmSave() {
    if (!pendingInput) {
      return;
    }

    await performSave(pendingInput);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-4 sm:items-center"
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget && !isSubmitting && !confirmStep) {
            onClose();
          }
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
          className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl sm:p-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="edit-user-title" className="text-lg font-semibold text-zinc-900">
                Edit User
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Update badge number, department email, role, or active status.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              aria-label="Close edit user dialog"
            >
              Close
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <PersonnelFormFields
              idPrefix="edit-user"
              values={values}
              errors={errors}
              onChange={setValues}
              disabled={isSubmitting}
              disabledFields={isSelfEdit ? { active: true } : undefined}
              selfEditNotice={isSelfEdit ? SELF_EDIT_NOTICE : null}
            />

            {errors.submit ? (
              <p role="alert" className="text-sm text-red-700">
                {errors.submit}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto sm:px-6"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto sm:px-6"
              >
                {isSubmitting ? "Saving Changes…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {confirmStep ? (
        <SelfEditConfirmDialog
          variant={confirmStep}
          isSubmitting={isSubmitting}
          onCancel={() => {
            if (isSubmitting) {
              return;
            }

            setConfirmStep(null);
            setPendingInput(null);
          }}
          onConfirm={() => {
            void handleConfirmSave();
          }}
        />
      ) : null}
    </>
  );
}

export function EditUserModal({
  user,
  existingUsers,
  currentUserEmail,
  onClose,
  onSave,
  onSelfEmailUpdated,
}: EditUserModalProps) {
  if (!user) {
    return null;
  }

  return (
    <EditUserModalContent
      key={user.id}
      user={user}
      existingUsers={existingUsers}
      currentUserEmail={currentUserEmail}
      onClose={onClose}
      onSave={onSave}
      onSelfEmailUpdated={onSelfEmailUpdated}
    />
  );
}
