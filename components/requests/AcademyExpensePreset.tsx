"use client";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ACADEMY_FEES_SOURCE, parseAcademyMealDays } from "@/lib/training-location";

export function AcademyExpensePreset({ days, onDaysChange, onApply, error }: {
  days: string; onDaysChange: (value: string) => void; onApply: () => void; error?: string;
}) {
  return <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <h3 className="text-sm font-semibold text-zinc-900">NYS Fire Academy commuter estimate</h3>
    <p className="text-sm leading-6 text-zinc-700">Registration starts at $25. Commuter breakfast and lunch are $8 per day. Check the number of meal days and adjust the expense amounts below for your course.</p>
    <Field id="academyMealDays" label="Commuter meal days" error={error}>
      <Input id="academyMealDays" type="number" min="0" max="366" step="1" value={days} onChange={(event) => onDaysChange(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "academyMealDays-error" : "academy-meal-help"} />
    </Field>
    <p id="academy-meal-help" className="text-sm text-zinc-600">The suggestion counts calendar days between the course dates. Exclude days you will not eat at the Academy. Lodging, course materials, and travel costs are additional.</p>
    <Button variant="secondary" disabled={parseAcademyMealDays(days) === null} onClick={onApply}>Apply $25 registration + $8/day meals</Button>
    <p className="text-xs text-zinc-600">Applying this estimate replaces Registration Fee and Food / Meals. <a href={ACADEMY_FEES_SOURCE} target="_blank" rel="noopener noreferrer" className="underline">View Academy fees</a>.</p>
  </div>;
}
