"use client";

import { FormEvent, useState } from "react";
import { PersonnelFormFields } from "@/components/admin/PersonnelFormFields";
import { Button } from "@/components/ui/Button";
import {
  toPersonnelInsertInput,
  validateAddUserForm,
  type PersonnelFormErrors,
  type PersonnelFormValues,
} from "@/lib/personnel";
import type { PersonnelInsertInput, PersonnelRecord } from "@/types/personnel";

const initialValues: PersonnelFormValues = {
  firstName: "",
  lastName: "",
  badgeNumber: "",
  email: "",
  role: "",
  active: true,
};

interface AddUserFormProps {
  existingUsers: PersonnelRecord[];
  onSubmit: (input: PersonnelInsertInput) => Promise<void>;
  disabled?: boolean;
}

export function AddUserForm({
  existingUsers,
  onSubmit,
  disabled = false,
}: AddUserFormProps) {
  const [values, setValues] = useState<PersonnelFormValues>(initialValues);
  const [errors, setErrors] = useState<PersonnelFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateAddUserForm(values, existingUsers);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      await onSubmit(toPersonnelInsertInput(values));
      setValues(initialValues);
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
        Create a personnel record using badge number and department email only.
      </p>

      <div className="mt-6 space-y-4">
        <PersonnelFormFields
          idPrefix="add-user"
          values={values}
          errors={errors}
          onChange={setValues}
          disabled={disabled || isSubmitting}
        />

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
