"use client";

import { useRef } from "react";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TRAINING_LOCATIONS, normalizeTrainingLocation, type TrainingLocationType } from "@/lib/training-location";

export function TrainingLocationFields({ type, location, error, onChange }: {
  type?: TrainingLocationType | ""; location: string; error?: string;
  onChange: (type: TrainingLocationType | "", location: string) => void;
}) {
  const selected = normalizeTrainingLocation(type, location).locationType;
  const other = useRef(selected === "other" ? location : "");
  return <div className="space-y-4 sm:col-span-2">
    <Field id="trainingLocationType" label="Training Location" error={error}>
      <Select id="trainingLocationType" value={selected} onChange={(event) => {
        const value = event.target.value as TrainingLocationType | "";
        onChange(value, value === "other" ? other.current : value ? TRAINING_LOCATIONS[value] : "");
      }} aria-invalid={error ? true : undefined} aria-describedby={error ? "trainingLocationType-error" : undefined}>
        <option value="">Select a location</option>
        {Object.entries(TRAINING_LOCATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </Select>
    </Field>
    {selected === "other" ? <Field id="location" label="Other Training Location">
      <Input id="location" value={location} maxLength={300} onChange={(event) => { other.current = event.target.value; onChange("other", event.target.value); }} />
    </Field> : null}
  </div>;
}
