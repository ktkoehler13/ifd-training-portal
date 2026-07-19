"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { AddUserForm } from "@/components/admin/AddUserForm";
import { DeleteUserDialog } from "@/components/admin/DeleteUserDialog";
import { EditUserModal } from "@/components/admin/EditUserModal";
import { ResetPasswordConfirmDialog } from "@/components/admin/ResetPasswordConfirmDialog";
import { ResetPasswordResultDialog } from "@/components/admin/ResetPasswordResultDialog";
import { StatusChangeDialog } from "@/components/admin/StatusChangeDialog";
import { UsersTable } from "@/components/admin/UsersTable";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AdminGate } from "@/components/layout/AuthGate";
import { signOutClientSession } from "@/lib/auth/client";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  getPersonnelErrorMessage,
  isSamePersonnelRecord,
  mapPersonnelRow,
  normalizePersonnelEmail,
  SELF_ACCOUNT_PROTECTION_MESSAGE,
} from "@/lib/personnel";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  CreatePersonnelAccountInput,
  PersonnelRecord,
  PersonnelRow,
  PersonnelUpdateInput,
} from "@/types/personnel";

type StatusFilter = "all" | "active" | "inactive";

function getSupabaseConfigError(): string | null {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.";
  }

  return null;
}

interface UserManagementContentProps {
  currentPersonnel: AuthenticatedPersonnel;
}

function UserManagementContent({ currentPersonnel }: UserManagementContentProps) {
  const router = useRouter();
  const [users, setUsers] = useState<PersonnelRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<PersonnelRecord | null>(null);
  const [deletingUser, setDeletingUser] = useState<PersonnelRecord | null>(
    null,
  );
  const [statusChangeTarget, setStatusChangeTarget] = useState<{
    user: PersonnelRecord;
    nextActive: boolean;
  } | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] =
    useState<PersonnelRecord | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<string | null>(
    null,
  );
  const configError = getSupabaseConfigError();

  const filteredUsers = useMemo(() => {
    if (statusFilter === "active") {
      return users.filter((user) => user.active);
    }

    if (statusFilter === "inactive") {
      return users.filter((user) => !user.active);
    }

    return users;
  }, [statusFilter, users]);

  const loadUsers = useCallback(async () => {
    if (configError) {
      setLoadError(configError);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("personnel")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const mapped = (data as PersonnelRow[]).map(mapPersonnelRow);
      startTransition(() => {
        setUsers(mapped);
        setIsLoading(false);
      });
    } catch (error) {
      startTransition(() => {
        setUsers([]);
        setLoadError(getPersonnelErrorMessage(error));
        setIsLoading(false);
      });
    }
  }, [configError]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function showSuccess(message: string) {
    setSuccessMessage(message);
    setOperationError(null);
  }

  async function handleAddUser(input: CreatePersonnelAccountInput) {
    if (configError) {
      throw new Error(configError);
    }

    const response = await fetch("/api/admin/personnel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    const payload = (await response.json()) as {
      error?: string;
      personnel?: PersonnelRecord;
    };

    if (!response.ok || !payload.personnel) {
      throw new Error(payload.error ?? "Unable to create personnel account.");
    }

    setUsers((current) => [payload.personnel!, ...current]);
    setLoadError(null);
  }

  async function handleConfirmResetPassword(userId: string) {
    if (configError) {
      throw new Error(configError);
    }

    const response = await fetch(
      `/api/admin/personnel/${encodeURIComponent(userId)}/reset-password`,
      {
        method: "POST",
      },
    );

    const payload = (await response.json()) as {
      error?: string;
      temporaryPassword?: string;
    };

    if (!response.ok || !payload.temporaryPassword) {
      throw new Error(payload.error ?? "Unable to reset password.");
    }

    setUsers((current) =>
      current.map((user) =>
        user.id === userId ? { ...user, mustChangePassword: true } : user,
      ),
    );
    setResetPasswordTarget(null);
    setResetPasswordResult(payload.temporaryPassword);
    setOperationError(null);
    showSuccess("Password reset successfully. Share the temporary password securely.");
  }

  async function handleEditUser(userId: string, input: PersonnelUpdateInput) {
    if (configError) {
      throw new Error(configError);
    }

    const targetUser = users.find((user) => user.id === userId);
    const isSelfEdit =
      targetUser !== undefined &&
      isSamePersonnelRecord(targetUser, currentPersonnel.email);

    if (isSelfEdit && !input.active) {
      throw new Error(SELF_ACCOUNT_PROTECTION_MESSAGE);
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("personnel")
      .update({
        first_name: input.firstName,
        last_name: input.lastName,
        badge_number: input.badgeNumber,
        email: input.email,
        title: input.title,
        role: input.role,
        active: input.active,
      })
      .eq("id", userId)
      .select("*")
      .single();

    if (error) {
      throw new Error(getPersonnelErrorMessage(error));
    }

    const updated = mapPersonnelRow(data as PersonnelRow);
    const emailChangedOnSelf =
      isSelfEdit &&
      normalizePersonnelEmail(input.email) !==
        normalizePersonnelEmail(currentPersonnel.email);

    if (emailChangedOnSelf) {
      return;
    }

    setUsers((current) =>
      current.map((user) => (user.id === userId ? updated : user)),
    );
    showSuccess(`Updated ${updated.badgeNumber} (${updated.email}).`);
  }

  async function handleSelfEmailUpdated() {
    await signOutClientSession();
    router.replace("/?reason=email-updated");
  }

  async function handleChangeActiveStatus(userId: string, active: boolean) {
    if (configError) {
      throw new Error(configError);
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("personnel")
      .update({ active })
      .eq("id", userId)
      .select("*")
      .single();

    if (error) {
      throw new Error(getPersonnelErrorMessage(error));
    }

    const updated = mapPersonnelRow(data as PersonnelRow);
    setUsers((current) =>
      current.map((user) => (user.id === userId ? updated : user)),
    );
    showSuccess(
      active
        ? `Reactivated ${updated.badgeNumber} (${updated.email}).`
        : `Moved ${updated.badgeNumber} (${updated.email}) to Inactive.`,
    );
  }

  async function handleDeleteUser(userId: string) {
    if (configError) {
      throw new Error(configError);
    }

    const deletedUser = users.find((user) => user.id === userId);

    const supabase = createClient();
    const { error } = await supabase.from("personnel").delete().eq("id", userId);

    if (error) {
      throw new Error(getPersonnelErrorMessage(error));
    }

    setUsers((current) => current.filter((user) => user.id !== userId));
    showSuccess(
      deletedUser
        ? `Permanently deleted ${deletedUser.badgeNumber} (${deletedUser.email}).`
        : "Personnel record deleted.",
    );
  }

  const dataUnavailable = Boolean(configError || loadError);

  return (
    <>
      <div className="flex flex-1 flex-col bg-zinc-100">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                User Management
              </h1>
              <p className="mt-1 text-sm text-zinc-600">
                Manage personnel records and password-based Supabase Auth
                accounts keyed by badge number and department email.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
              >
                Dashboard
              </Link>
              <SignOutButton className="px-5" />
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            Administrative access only. Personnel changes are protected by
            Supabase Row Level Security and require an active MTO, Deputy Chief,
            or Admin personnel record.
          </div>

          {successMessage ? (
            <div
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
              role="status"
            >
              {successMessage}
            </div>
          ) : null}

          {loadError ? (
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {loadError}
            </div>
          ) : null}

          {operationError ? (
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {operationError}
            </div>
          ) : null}

          <AddUserForm
            existingUsers={users}
            onSubmit={handleAddUser}
            disabled={dataUnavailable}
          />

          <section aria-labelledby="existing-users-heading">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2
                id="existing-users-heading"
                className="text-sm font-semibold tracking-wide text-zinc-500 uppercase"
              >
                Existing users
              </h2>

              <div className="flex flex-wrap gap-2">
                {(["all", "active", "inactive"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStatusFilter(filter)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      statusFilter === filter
                        ? "bg-red-700 text-white"
                        : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50",
                    )}
                  >
                    {filter === "all"
                      ? "All"
                      : filter === "active"
                        ? "Active"
                        : "Inactive"}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-zinc-500" role="status">
                Loading users...
              </p>
            ) : users.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center shadow-sm shadow-zinc-200/60">
                <h3 className="text-lg font-semibold text-zinc-900">
                  No users found
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Personnel records visible to your administrative account will
                  appear here.
                </p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center shadow-sm shadow-zinc-200/60">
                <h3 className="text-lg font-semibold text-zinc-900">
                  No matching users
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Try a different status filter to view other personnel records.
                </p>
              </div>
            ) : (
              <UsersTable
                users={filteredUsers}
                currentUserEmail={currentPersonnel.email}
                onEdit={setEditingUser}
                onChangeStatus={(user, nextActive) =>
                  setStatusChangeTarget({ user, nextActive })
                }
                onResetPassword={(user) => {
                  setOperationError(null);
                  setResetPasswordTarget(user);
                }}
                onDelete={setDeletingUser}
              />
            )}
          </section>
        </div>
      </div>

      <EditUserModal
        user={editingUser}
        existingUsers={users}
        currentUserEmail={currentPersonnel.email}
        onClose={() => setEditingUser(null)}
        onSave={handleEditUser}
        onSelfEmailUpdated={handleSelfEmailUpdated}
      />

      <StatusChangeDialog
        user={statusChangeTarget?.user ?? null}
        nextActive={statusChangeTarget?.nextActive ?? null}
        onClose={() => setStatusChangeTarget(null)}
        onConfirm={handleChangeActiveStatus}
      />

      <DeleteUserDialog
        user={deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={handleDeleteUser}
      />

      <ResetPasswordConfirmDialog
        user={resetPasswordTarget}
        onClose={() => setResetPasswordTarget(null)}
        onConfirm={handleConfirmResetPassword}
      />

      <ResetPasswordResultDialog
        temporaryPassword={resetPasswordResult}
        onClose={() => setResetPasswordResult(null)}
      />
    </>
  );
}

export function UserManagementView() {
  return (
    <AdminGate>
      {(currentPersonnel) => (
        <UserManagementContent currentPersonnel={currentPersonnel} />
      )}
    </AdminGate>
  );
}
