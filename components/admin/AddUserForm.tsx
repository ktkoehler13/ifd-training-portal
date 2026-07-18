"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  toPersonnelInsertInput,
  validateAddUserForm,
  type AddUserFormErrors,
  type AddUserFormValues,
} from "@/lib/personnel";
import type { PersonnelInsertInput, PersonnelRecord } from "@/types/personnel";
import { PERSONNEL_ROLE_LABELS, PERSONNEL_ROLES } from "@/types/personnel";

const initialValues: AddUserFormValues = {
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
  const [values, setValues] = useState<AddUserFormValues>(initialValues);
  const [errors, setErrors] = useState<AddUserFormErrors>({});
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          id="badgeNumber"
          label="Badge Number"
          error={errors.badgeNumber}
        >
          <Input
            id="badgeNumber"
            value={values.badgeNumber}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                badgeNumber: event.target.value,
              }))
            }
            disabled={disabled || isSubmitting}
            aria-invalid={errors.badgeNumber ? true : undefined}
            aria-describedby={
              errors.badgeNumber ? "badgeNumber-error" : undefined
            }
          />
        </Field>

        <Field
          id="departmentEmail"
          label="Department Email"
          error={errors.email}
        >
          <Input
            id="departmentEmail"
            type="email"
            value={values.email}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            disabled={disabled || isSubmitting}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "departmentEmail-error" : undefined}
          />
        </Field>

        <Field id="role" label="Role" error={errors.role}>
          <Select
            id="role"
            value={values.role}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                role: event.target.value as AddUserFormValues["role"],
              }))
            }
            disabled={disabled || isSubmitting}
            aria-invalid={errors.role ? true : undefined}
            aria-describedby={errors.role ? "role-error" : undefined}
          >
            <option value="">Select a role</option>
            {PERSONNEL_ROLES.map((role) => (
              <option key={role} value={role}>
                {PERSONNEL_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="active" label="Active">
          <label className="flex h-11 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-zinc-800 shadow-sm">
            <input
              id="active"
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 text-red-700 focus:ring-red-700"
              checked={values.active}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
              disabled={disabled || isSubmitting}
            />
            Active user
          </label>
        </Field>
      </div>

      {errors.submit ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {errors.submit}
        </p>
      ) : null}

      <div className="mt-6">
        <Button
          type="submit"
          disabled={disabled || isSubmitting}
          className="w-full sm:w-auto sm:px-6"
        >
          {isSubmitting ? "Adding User…" : "Add User"}
        </Button>
      </div>
    </form>
  );
}
