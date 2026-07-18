"use client";

import { FormEvent, useEffect, useState } from "react";
import { PersonnelFormFields } from "@/components/admin/PersonnelFormFields";
import { Button } from "@/components/ui/Button";
import {
  personnelRecordToFormValues,
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
}

interface EditUserModalContentProps {
  user: PersonnelRecord;
  existingUsers: PersonnelRecord[];
  currentUserEmail: string;
  onClose: () => void;
  onSave: (userId: string, input: PersonnelUpdateInput) => Promise<void>;
}

function EditUserModalContent({
  user,
  existingUsers,
  currentUserEmail,
  onClose,
  onSave,
}: EditUserModalContentProps) {
  const [values, setValues] = useState<PersonnelFormValues>(() =>
    personnelRecordToFormValues(user),
  );
  const [errors, setErrors] = useState<PersonnelFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSelfEdit = user.email === currentUserEmail.trim().toLowerCase();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      return;
    }

    const nextErrors = validatePersonnelForm(values, existingUsers, {
      excludeUserId: user.id,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      await onSave(user.id, toPersonnelUpdateInput(values));
      onClose();
    } catch (error) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-4 sm:items-center"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
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
            disabledFields={
              isSelfEdit
                ? {
                    badgeNumber: true,
                    email: true,
                    role: true,
                    active: true,
                  }
                : undefined
            }
            selfEditNotice={
              isSelfEdit
                ? "You cannot change your own badge number, email, role, or active status while signed in."
                : null
            }
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
              disabled={isSubmitting || isSelfEdit}
              className="w-full sm:w-auto sm:px-6"
            >
              {isSubmitting ? "Saving Changes…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditUserModal({
  user,
  existingUsers,
  currentUserEmail,
  onClose,
  onSave,
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
    />
  );
}
