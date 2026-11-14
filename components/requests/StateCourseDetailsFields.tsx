"use client";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { AddressFields } from "@/components/settings/AddressFields";
import { ADDRESS_KEYS, type AddressField } from "@/lib/personnel-address";
import type { ReactNode } from "react";
import { STATE_COURSE_FIELDS, type StateCourseDetails, type StateCourseErrors, type StateCourseField } from "@/lib/state-course-details";

export function StateCourseDetailsFields({ values, errors, onChange, addressOptions, disabled = false }: {
  values: StateCourseDetails;
  errors: StateCourseErrors;
  onChange: (key: StateCourseField, value: string) => void;
  addressOptions?: ReactNode;
  disabled?: boolean;
}) {
  return <fieldset className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2 sm:p-5">
    <legend className="px-1 text-sm font-semibold text-zinc-900">OFPC Student Information</legend>
    <p className="text-sm leading-6 text-zinc-600">Required for state-run (OFPC) courses. These details will appear on your Training Authorization Letter. Include your apartment or unit in the street address, if applicable.</p>
    <AddressFields values={values} errors={errors} onChange={onChange} disabled={disabled} />
    {addressOptions}
    <div className="grid gap-4 sm:grid-cols-2">
      {STATE_COURSE_FIELDS.filter(({ key }) => !ADDRESS_KEYS.includes(key as AddressField)).map(({ key, label, maxLength, autoComplete, type }) => (
        <Field key={key} id={key} label={label} error={errors[key]} className={key === "requesterAddress" ? "sm:col-span-2" : undefined}>
          <Input id={key} type={type} value={values[key] ?? ""} required disabled={disabled}
            maxLength={maxLength} autoComplete={autoComplete}
            onChange={(event) => onChange(key, key === "requesterState" ? event.target.value.toUpperCase() : event.target.value)}
            aria-invalid={errors[key] ? true : undefined}
            aria-describedby={errors[key] ? `${key}-error` : undefined} />
        </Field>
      ))}
    </div>
  </fieldset>;
}
