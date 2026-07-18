"use client";

import { Button } from "@/components/ui/Button";
import {
  formatPersonnelCreatedAt,
  isSamePersonnelRecord,
  SELF_ACCOUNT_PROTECTION_MESSAGE,
} from "@/lib/personnel";
import { cn } from "@/lib/utils";
import type { PersonnelRecord } from "@/types/personnel";
import { PERSONNEL_ROLE_LABELS } from "@/types/personnel";

interface UsersTableProps {
  users: PersonnelRecord[];
  currentUserEmail: string;
  onEdit: (user: PersonnelRecord) => void;
  onChangeStatus: (user: PersonnelRecord, nextActive: boolean) => void;
  onDelete: (user: PersonnelRecord) => void;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        active
          ? "bg-green-100 text-green-800"
          : "bg-zinc-200 text-zinc-700",
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function UsersTable({
  users,
  currentUserEmail,
  onEdit,
  onChangeStatus,
  onDelete,
}: UsersTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Badge Number</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = isSamePersonnelRecord(user, currentUserEmail);

              return (
                <tr
                  key={user.id}
                  className={cn(
                    "border-b border-zinc-100 last:border-b-0",
                    !user.active && "bg-zinc-50/80 text-zinc-600",
                  )}
                >
                  <td className="px-4 py-4 align-top font-medium text-zinc-900">
                    {user.badgeNumber}
                  </td>
                  <td className="px-4 py-4 align-top">{user.email}</td>
                  <td className="px-4 py-4 align-top">
                    {PERSONNEL_ROLE_LABELS[user.role]}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <StatusBadge active={user.active} />
                  </td>
                  <td className="px-4 py-4 align-top whitespace-nowrap">
                    {formatPersonnelCreatedAt(user.createdAt)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex min-w-[12rem] flex-col gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 px-3 text-xs"
                        onClick={() => onEdit(user)}
                      >
                        Edit
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 px-3 text-xs"
                        disabled={isSelf && user.active}
                        title={isSelf ? SELF_ACCOUNT_PROTECTION_MESSAGE : undefined}
                        onClick={() =>
                          onChangeStatus(user, user.active ? false : true)
                        }
                      >
                        {user.active ? "Move to Inactive" : "Reactivate"}
                      </Button>

                      {isSelf ? (
                        <p className="text-xs leading-5 text-zinc-500">
                          {SELF_ACCOUNT_PROTECTION_MESSAGE}
                        </p>
                      ) : null}

                      <div className="border-t border-zinc-200 pt-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 w-full border-red-200 px-3 text-xs text-red-700 hover:bg-red-50"
                          disabled={isSelf}
                          title={isSelf ? SELF_ACCOUNT_PROTECTION_MESSAGE : undefined}
                          onClick={() => onDelete(user)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
