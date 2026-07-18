import { formatPersonnelCreatedAt } from "@/lib/personnel";
import type { PersonnelRecord } from "@/types/personnel";
import { PERSONNEL_ROLE_LABELS } from "@/types/personnel";

interface UsersTableProps {
  users: PersonnelRecord[];
}

export function UsersTable({ users }: UsersTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Badge Number</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Active</th>
              <th className="px-4 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-zinc-100 last:border-b-0"
              >
                <td className="px-4 py-4 align-top font-medium text-zinc-900">
                  {user.badgeNumber}
                </td>
                <td className="px-4 py-4 align-top text-zinc-700">
                  {user.email}
                </td>
                <td className="px-4 py-4 align-top text-zinc-700">
                  {PERSONNEL_ROLE_LABELS[user.role]}
                </td>
                <td className="px-4 py-4 align-top text-zinc-700">
                  {user.active ? "Yes" : "No"}
                </td>
                <td className="px-4 py-4 align-top whitespace-nowrap text-zinc-700">
                  {formatPersonnelCreatedAt(user.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
