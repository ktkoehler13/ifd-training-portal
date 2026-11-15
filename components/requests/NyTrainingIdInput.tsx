"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { isValidNyTrainingId, normalizeNyTrainingId, nyTrainingIdDigits } from "@/lib/ny-training-id";

export function NyTrainingIdInput({ value, error, disabled, onChange }: {
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [entryError, setEntryError] = useState<string>();
  const digits = nyTrainingIdDigits(value);
  const message = entryError ?? error;
  return <Field id="nyTrainingId" label="New York Training ID" error={message}>
    <div className="flex">
      <span aria-hidden="true" className="flex h-11 items-center rounded-l-xl border border-r-0 border-zinc-200 bg-zinc-100 px-3.5 text-sm font-semibold text-zinc-700">NY</span>
      <Input id="nyTrainingId" type="text" inputMode="numeric" pattern="[0-9]{1,7}"
        autoComplete="off" required disabled={disabled} value={digits}
        className="min-w-0 rounded-l-none" placeholder="0000000"
        aria-invalid={message ? true : undefined}
        aria-describedby={`nyTrainingId-help${message ? " nyTrainingId-error" : ""}`}
        onChange={(event) => {
          const next = event.target.value;
          if (!/^[0-9]{0,7}$/.test(next)) {
            setEntryError("Enter up to seven numbers. Your entry has not been changed.");
            return;
          }
          setEntryError(undefined);
          onChange(next);
        }}
        onPaste={(event) => {
          event.preventDefault();
          const pasted = nyTrainingIdDigits(event.clipboardData.getData("text"));
          const input = event.currentTarget;
          const next = digits.slice(0, input.selectionStart ?? 0) + pasted + digits.slice(input.selectionEnd ?? digits.length);
          if (!/^[0-9]{0,7}$/.test(next)) {
            setEntryError("Enter up to seven numbers. Your entry has not been changed.");
            return;
          }
          setEntryError(undefined);
          onChange(next);
        }}
        onBlur={() => {
          if (isValidNyTrainingId(value)) onChange(normalizeNyTrainingId(value));
        }} />
    </div>
    <p id="nyTrainingId-help" className="text-sm leading-6 text-zinc-600">
      NY is included. Enter up to seven digits; leading zeroes are added automatically.
      {isValidNyTrainingId(value) && <span className="block font-medium">Training ID: {normalizeNyTrainingId(value)}</span>}
    </p>
  </Field>;
}
