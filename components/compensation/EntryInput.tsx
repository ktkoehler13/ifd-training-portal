"use client";

import { useId, useRef, useState } from "react";
import { formatEntryDate, formatEntryTime, parseEntryDate, parseEntryTime } from "@/lib/compensation/entry-format";
import { localToday } from "@/lib/compensation/model";

// Text box for a compensation date or time. `value` and `onChange` use the
// stored formats (YYYY-MM-DD / 24-hour HH:MM); unreadable text reports "".
export function EntryInput({ kind, label, value, onChange, className }: {
  kind: "date" | "time"; label: string; value: string; onChange: (value: string) => void; className: string;
}) {
  const parse = (text: string) => kind === "date" ? parseEntryDate(text, localToday()) : parseEntryTime(text);
  const format = kind === "date" ? formatEntryDate : formatEntryTime;
  const [text, setText] = useState(() => format(value));
  const [touched, setTouched] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const hintId = useId();

  // Follow outside changes (loading a saved packet, calendar pick) without
  // overwriting what the person is still typing.
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    if ((parse(text) ?? "") !== value) setText(format(value));
  }

  const parsed = parse(text);
  const invalid = touched && text.trim() !== "" && parsed === null;
  const preview = parsed && text.trim() !== format(parsed) ? format(parsed) : "";
  const example = kind === "date" ? "e.g. 11/7/26" : "e.g. 1300 or 1:00 PM";

  function update(next: string) {
    setText(next);
    onChange(parse(next) ?? "");
  }

  return <label className="block min-w-0 space-y-1.5 text-sm font-medium text-zinc-700">
    <span>{label}</span>
    <span className="flex gap-1.5">
      <input className={`${className} aria-invalid:border-red-600`} type="text" inputMode="text" autoComplete="off" value={text} placeholder={example}
        aria-invalid={invalid || undefined} aria-describedby={hintId}
        onChange={(event) => update(event.target.value)}
        onBlur={() => { setTouched(true); if (parsed) setText(format(parsed)); }} />
      {kind === "date" ? <>
        <button type="button" tabIndex={-1} aria-label={`Choose ${label} from a calendar`} title="Choose from a calendar"
          className="shrink-0 rounded-lg border border-zinc-300 bg-white px-2 text-zinc-600 hover:bg-zinc-50 disabled:hidden"
          onClick={() => { try { picker.current?.showPicker(); } catch { picker.current?.focus(); } }}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4.5" width="14" height="12" rx="1.5" /><path d="M3 8.5h14M7 3v3M13 3v3" /></svg>
        </button>
        <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" className="sr-only" value={value}
          onChange={(event) => { setTouched(true); onChange(event.target.value); }} />
      </> : null}
    </span>
    <span id={hintId} aria-live="polite" className={`block text-xs font-normal ${invalid ? "text-red-700" : "text-zinc-500"}`}>
      {invalid ? (kind === "date" ? "Enter a date like 11/7/26 or 11/07/2026." : "Enter a time like 1300 or 1:00 PM.") : preview ? `Reads as ${preview}` : " "}
    </span>
  </label>;
}
