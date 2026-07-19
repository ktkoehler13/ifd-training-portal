"use client";

import { FormEvent, useState } from "react";
import { PersonnelFormFields } from "@/components/admin/PersonnelFormFields";
import { Button } from "@/components/ui/Button";
import {
  toCreatePersonnelAccountInput,
  validateAddUserForm,
  type AddUserFormErrors,
  type AddUserFormValues,
} from "@/lib/personnel";
import type { CreatePersonnelAccountInput, PersonnelRecord } from "@/types/personnel";

const initialValues: AddUserFormValues = {
  firstName: "",
  lastName: "",
  badgeNumber: "",
  email: "",
  title: "",
  role: "",
  active: true,
  initialPassword: "",
  confirmInitialPassword: "",
};

interface AddUserFormProps {
  existingUsers: PersonnelRecord[];
  onSubmit: (input: CreatePersonnelAccountInput) => Promise<void>;
  disabled?: boolean;
}

export function AddUserForm({
  existingUsers,
  onSubmit,
  disabled = false,
}: AddUserFormProps) {
  const [values, setValues] = useState<AddUserFormValues>(initialValues);
  const [errors, setErrors] = useState<AddUserFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInitialPassword, setShowInitialPassword] = useState(false);
  const [showConfirmInitialPassword, setShowConfirmInitialPassword] =
    useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setSuccessMessage(null);
    const nextErrors = validateAddUserForm(values, existingUsers);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      await onSubmit(toCreatePersonnelAccountInput(values));
      setValues(initialValues);
      setShowInitialPassword(false);
      setShowConfirmInitialPassword(false);
      setSuccessMessage(
        "User created successfully. Provide the initial password to the user securely.",
      );
    } catch (error) {
      setErrors({
        submit:
          error instanceof Error
            ? error.message
            : "Unable to add user. Try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8"
      noValidate
    >
      <h2 className="text-lg font-semibold text-zinc-900">Add User</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Create the personnel account and assign an initial password of at least 6
        characters. The user will be required to choose a stronger personal
        password after signing in.
      </p>

      <div className="mt-6 space-y-4">
        <PersonnelFormFields
          idPrefix="add-user"
          values={values}
          errors={errors}
          onChange={(nextValues) =>
            setValues((current) => ({
              ...nextValues,
              initialPassword: current.initialPassword,
              confirmInitialPassword: current.confirmInitialPassword,
            }))
          }
          disabled={disabled || isSubmitting}
          initialPasswordFields={{
            idPrefix: "add-user",
            initialPassword: values.initialPassword,
            confirmInitialPassword: values.confirmInitialPassword,
            errors,
            showInitialPassword,
            showConfirmInitialPassword,
            onInitialPasswordChange: (initialPassword) => {
              setValues((current) => ({ ...current, initialPassword }));
              if (errors.initialPassword) {
                setErrors((current) => ({ ...current, initialPassword: undefined }));
              }
            },
            onConfirmInitialPasswordChange: (confirmInitialPassword) => {
              setValues((current) => ({ ...current, confirmInitialPassword }));
              if (errors.confirmInitialPassword) {
                setErrors((current) => ({
                  ...current,
                  confirmInitialPassword: undefined,
                }));
              }
            },
            onToggleShowInitialPassword: () =>
              setShowInitialPassword((current) => !current),
            onToggleShowConfirmInitialPassword: () =>
              setShowConfirmInitialPassword((current) => !current),
            disabled: disabled || isSubmitting,
          }}
        />

        {successMessage ? (
          <p className="text-sm text-green-800" role="status">
            {successMessage}
          </p>
        ) : null}

        {errors.submit ? (
          <p role="alert" className="text-sm text-red-700">
            {errors.submit}
          </p>
        ) : null}

        <div>
          <Button
            type="submit"
            disabled={disabled || isSubmitting}
            className="w-full sm:w-auto sm:px-6"
          >
            {isSubmitting ? "Adding User…" : "Add User"}
          </Button>
        </div>
      </div>
    </form>
  );
}
