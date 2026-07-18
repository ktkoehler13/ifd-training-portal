"use client";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { PersonnelFormErrors, PersonnelFormValues } from "@/lib/personnel";
import { PERSONNEL_ROLE_LABELS, PERSONNEL_ROLES } from "@/types/personnel";

interface PersonnelFormFieldsProps {
  idPrefix: string;
  values: PersonnelFormValues;
  errors: PersonnelFormErrors;
  onChange: (values: PersonnelFormValues) => void;
  disabled?: boolean;
  disabledFields?: Partial<Record<keyof PersonnelFormValues, boolean>>;
  selfEditNotice?: string | null;
}

export function PersonnelFormFields({
  idPrefix,
  values,
  errors,
  onChange,
  disabled = false,
  disabledFields,
  selfEditNotice,
}: PersonnelFormFieldsProps) {
  return (
    <>
      {selfEditNotice ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {selfEditNotice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${idPrefix}-firstName`}
          label="First Name"
          error={errors.firstName}
        >
          <Input
            id={`${idPrefix}-firstName`}
            value={values.firstName}
            onChange={(event) =>
              onChange({ ...values, firstName: event.target.value })
            }
            disabled={disabled || disabledFields?.firstName}
            autoComplete="given-name"
            aria-invalid={errors.firstName ? true : undefined}
          />
        </Field>

        <Field
          id={`${idPrefix}-lastName`}
          label="Last Name"
          error={errors.lastName}
        >
          <Input
            id={`${idPrefix}-lastName`}
            value={values.lastName}
            onChange={(event) =>
              onChange({ ...values, lastName: event.target.value })
            }
            disabled={disabled || disabledFields?.lastName}
            autoComplete="family-name"
            aria-invalid={errors.lastName ? true : undefined}
          />
        </Field>

        <Field
          id={`${idPrefix}-badgeNumber`}
          label="Badge Number"
          error={errors.badgeNumber}
        >
          <Input
            id={`${idPrefix}-badgeNumber`}
            value={values.badgeNumber}
            onChange={(event) =>
              onChange({ ...values, badgeNumber: event.target.value })
            }
            disabled={disabled || disabledFields?.badgeNumber}
            aria-invalid={errors.badgeNumber ? true : undefined}
          />
        </Field>

        <Field
          id={`${idPrefix}-departmentEmail`}
          label="Department Email"
          error={errors.email}
        >
          <Input
            id={`${idPrefix}-departmentEmail`}
            type="email"
            value={values.email}
            onChange={(event) =>
              onChange({ ...values, email: event.target.value })
            }
            disabled={disabled || disabledFields?.email}
            aria-invalid={errors.email ? true : undefined}
          />
        </Field>

        <Field id={`${idPrefix}-role`} label="Role" error={errors.role}>
          <Select
            id={`${idPrefix}-role`}
            value={values.role}
            onChange={(event) =>
              onChange({
                ...values,
                role: event.target.value as PersonnelFormValues["role"],
              })
            }
            disabled={disabled || disabledFields?.role}
            aria-invalid={errors.role ? true : undefined}
          >
            <option value="">Select a role</option>
            {PERSONNEL_ROLES.map((role) => (
              <option key={role} value={role}>
                {PERSONNEL_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>

        <Field id={`${idPrefix}-active`} label="Active">
          <label className="flex h-11 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-zinc-800 shadow-sm">
            <input
              id={`${idPrefix}-active`}
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 text-red-700 focus:ring-red-700"
              checked={values.active}
              onChange={(event) =>
                onChange({ ...values, active: event.target.checked })
              }
              disabled={disabled || disabledFields?.active}
            />
            Active user
          </label>
        </Field>
      </div>
    </>
  );
}
