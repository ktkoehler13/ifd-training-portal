"use client";

import {
  TRAINING_REQUEST_ACTION_LABELS,
  type TrainingRequestActionRecord,
} from "@/types/training-request-action";
import { formatActionTimestamp } from "@/lib/training-request-actions";
import { cn } from "@/lib/utils";
import { getExpenseChangeRows } from "@/lib/mto-expense-review";

interface RequestActionTimelineProps {
  actions: TrainingRequestActionRecord[];
  className?: string;
}

export function RequestActionTimeline({
  actions,
  className,
}: RequestActionTimelineProps) {
  if (actions.length === 0) {
    return (
      <p className={cn("text-sm text-zinc-500", className)}>
        No workflow actions recorded yet.
      </p>
    );
  }

  return (
    <ol className={cn("space-y-4", className)}>
      {actions.map((action, index) => (
        <li
          key={action.id}
          className="relative rounded-xl border border-zinc-200 bg-white p-4 pl-5"
        >
          <span
            className="absolute top-4 left-0 h-full w-px bg-zinc-200"
            aria-hidden="true"
          />
          <span
            className="absolute top-5 -left-1.5 h-3 w-3 rounded-full border-2 border-white bg-red-700 ring-1 ring-red-700"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                {TRAINING_REQUEST_ACTION_LABELS[action.action]}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {action.actorName} · Badge {action.actorBadgeNumber}
              </p>
            </div>
            <p className="text-xs text-zinc-500">
              {formatActionTimestamp(action.createdAt)}
            </p>
          </div>
          {action.electronicSignatureConfirmed && action.signatureName ? (
            <p className="mt-3 text-sm text-zinc-700">
              Electronically signed by{" "}
              <span className="font-medium text-zinc-900">
                {action.signatureName}
              </span>
              {action.signedAt
                ? ` on ${formatActionTimestamp(action.signedAt)}`
                : null}
            </p>
          ) : action.signatureName ? (
            <p className="mt-3 text-sm text-zinc-700">
              Signed as{" "}
              <span className="font-medium text-zinc-900">
                {action.signatureName}
              </span>
              {action.signedAt
                ? ` on ${formatActionTimestamp(action.signedAt)}`
                : null}
            </p>
          ) : null}
          {action.expenseChanges ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Expense changes recorded by the MTO
                </caption>
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th scope="col" className="py-2 pr-4">
                      Expense
                    </th>
                    <th scope="col" className="px-2 py-2">
                      Before
                    </th>
                    <th scope="col" className="px-2 py-2">
                      After
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getExpenseChangeRows(action.expenseChanges).map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-zinc-100 align-top"
                    >
                      <th scope="row" className="py-2 pr-4 font-medium">
                        {row.label}
                      </th>
                      <td className="max-w-xs break-words px-2 py-2 whitespace-pre-wrap">
                        {row.before}
                      </td>
                      <td className="max-w-xs break-words px-2 py-2 whitespace-pre-wrap">
                        {row.after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {action.comments ? (
            <div className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                {action.action === "mto_expenses_updated"
                  ? "Reason for Changes"
                  : "Comments"}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{action.comments}</p>
            </div>
          ) : null}
          {index < actions.length - 1 ? null : null}
        </li>
      ))}
    </ol>
  );
}
