"use client";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ADDRESS_FIELDS, type AddressErrors, type AddressField } from "@/lib/personnel-address";
import type { StateCourseDetails } from "@/lib/state-course-details";

export function AddressFields({ values, errors, onChange, disabled = false }: {
  values: StateCourseDetails;
  errors: AddressErrors;
  onChange: (key: AddressField, value: string) => void;
  disabled?: boolean;
}) {
  return <div className="grid gap-4 sm:grid-cols-2">
    {ADDRESS_FIELDS.map(({ key, label, maxLength, autoComplete }) => (
      <Field key={key} id={key} label={label} error={errors[key]} className={key === "requesterAddress" ? "sm:col-span-2" : undefined}>
        <Input id={key} value={values[key] ?? ""} required disabled={disabled}
          maxLength={maxLength} autoComplete={autoComplete}
          onChange={(event) => onChange(key, key === "requesterState" ? event.target.value.toUpperCase() : event.target.value)}
          aria-invalid={errors[key] ? true : undefined} aria-describedby={errors[key] ? `${key}-error` : undefined} />
      </Field>
    ))}
  </div>;
}
