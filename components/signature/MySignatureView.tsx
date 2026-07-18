"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { SignatureDrawCanvas } from "@/components/signature/SignatureDrawCanvas";
import { Button } from "@/components/ui/Button";
import { isSignatureEligibleRole } from "@/lib/auth/roles";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  formatPersonnelFullName,
  formatPersonnelDashboardIdentity,
} from "@/lib/personnel";
import { savePersonnelSignature } from "@/lib/personnel-signature";
import { validateSignatureFile } from "@/lib/personnel-signature-validation";
import type { PersonnelSignatureRecord } from "@/types/personnel-signature";
import { PERSONNEL_ROLE_LABELS } from "@/types/personnel";
import type { SignatureInputMethod, SignatureUploadState } from "@/types/personnel-signature";

const CERTIFICATION_TEXT =
  "I certify that this is my official signature and authorize the IFD Training Portal to place it on training documents I electronically approve.";

const initialUploadState: SignatureUploadState = {
  isSaving: false,
  isDeleting: false,
  isLoadingPreview: true,
  error: null,
  successMessage: null,
};

export function MySignatureView() {
  return (
    <AuthGate>
      {(personnel) => {
        if (!isSignatureEligibleRole(personnel.role)) {
          return (
            <div className="flex flex-1 flex-col bg-zinc-100">
              <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-12 sm:px-6">
                <div className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                    Access denied
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    My Signature is available only to active MTO and Deputy Chief
                    personnel.
                  </p>
                  <div className="mt-8">
                    <Link href="/dashboard">
                      <Button variant="secondary" className="px-6">
                        Return to Dashboard
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return <MySignatureContent personnel={personnel} />;
      }}
    </AuthGate>
  );
}

function MySignatureContent({ personnel }: { personnel: AuthenticatedPersonnel }) {
  const [inputMethod, setInputMethod] = useState<SignatureInputMethod>("draw");
  const [certificationConfirmed, setCertificationConfirmed] = useState(false);
  const [signature, setSignature] = useState<PersonnelSignatureRecord | null>(
    null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] =
    useState<SignatureUploadState>(initialUploadState);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fullName = formatPersonnelFullName(personnel);

  const refreshSignature = useCallback(async () => {
    setUploadState((current) => ({
      ...current,
      isLoadingPreview: true,
      error: null,
    }));

    try {
      const response = await fetch("/api/settings/signature", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        signature?: PersonnelSignatureRecord | null;
        previewUrl?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load your signature.");
      }

      setSignature(payload.signature ?? null);
      setPreviewUrl(payload.previewUrl ?? null);
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load your signature.",
      }));
    } finally {
      setUploadState((current) => ({
        ...current,
        isLoadingPreview: false,
      }));
    }
  }, []);

  useEffect(() => {
    void refreshSignature();
  }, [refreshSignature]);

  async function handleSaveBlob(blob: Blob, originalFilename?: string | null) {
    if (!certificationConfirmed) {
      setUploadState((current) => ({
        ...current,
        error: "Certification is required before saving your signature.",
        successMessage: null,
      }));
      return;
    }

    setUploadState((current) => ({
      ...current,
      isSaving: true,
      error: null,
      successMessage: null,
    }));

    const replacingExistingSignature = Boolean(signature);

    try {
      const { signature: savedSignature, previewUrl: savedPreviewUrl } =
        await savePersonnelSignature({
          personnel,
          blob,
          originalFilename,
        });
      setSignature(savedSignature);
      setPreviewUrl(savedPreviewUrl);
      setUploadState((current) => ({
        ...current,
        successMessage: replacingExistingSignature
          ? "Signature replaced successfully."
          : "Signature saved successfully.",
      }));
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : "Unable to save your signature.",
      }));
    } finally {
      setUploadState((current) => ({
        ...current,
        isSaving: false,
      }));
    }
  }

  async function handleUploadSelected(file: File | null) {
    if (!file) {
      return;
    }

    const validation = await validateSignatureFile(file);
    if (!validation.valid) {
      setUploadState((current) => ({
        ...current,
        error: validation.error ?? "Invalid signature file.",
        successMessage: null,
      }));
      return;
    }

    await handleSaveBlob(file, file.name);
  }

  async function handleDeleteSignature() {
    setUploadState((current) => ({
      ...current,
      isDeleting: true,
      error: null,
      successMessage: null,
    }));

    try {
      const response = await fetch("/api/settings/signature", {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to delete your signature.");
      }

      setSignature(null);
      setPreviewUrl(null);
      setCertificationConfirmed(false);
      setUploadState((current) => ({
        ...current,
        successMessage: "Signature deleted successfully.",
      }));
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : "Unable to delete your signature.",
      }));
    } finally {
      setUploadState((current) => ({
        ...current,
        isDeleting: false,
      }));
    }
  }

  const isBusy =
    uploadState.isSaving || uploadState.isDeleting || uploadState.isLoadingPreview;

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              My Signature
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Manage the signature used for electronic approvals.
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="secondary" className="shrink-0 px-5">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <section className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
          <h2 className="text-lg font-semibold text-zinc-900">
            Authenticated identity
          </h2>
          <dl className="mt-4 grid gap-3 text-sm text-zinc-700 sm:grid-cols-3">
            <div>
              <dt className="font-medium text-zinc-500">Full name</dt>
              <dd className="mt-1">{fullName || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Badge number</dt>
              <dd className="mt-1">{personnel.badgeNumber}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Role</dt>
              <dd className="mt-1">{PERSONNEL_ROLE_LABELS[personnel.role]}</dd>
            </div>
          </dl>
          <p className="mt-6 text-sm leading-6 text-zinc-600">
            Your stored signature may be placed on official training documents
            when you electronically approve a request.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Signed in as {formatPersonnelDashboardIdentity(personnel)}.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
          <h2 className="text-lg font-semibold text-zinc-900">
            Current signature
          </h2>
          {uploadState.isLoadingPreview ? (
            <p className="mt-4 text-sm text-zinc-500" role="status">
              Loading signature preview…
            </p>
          ) : signature && previewUrl ? (
            <div className="mt-4 space-y-3">
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Current stored signature preview"
                  className="mx-auto max-h-32 w-auto object-contain"
                />
              </div>
              <p className="text-sm text-zinc-600">
                Certified on{" "}
                {new Date(signature.certifiedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                .
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">
              No signature is stored yet. Draw or upload a PNG below.
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
          <h2 className="text-lg font-semibold text-zinc-900">
            {signature ? "Replace signature" : "Save signature"}
          </h2>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={inputMethod === "draw" ? "primary" : "secondary"}
              onClick={() => setInputMethod("draw")}
              disabled={isBusy}
            >
              Draw signature
            </Button>
            <Button
              type="button"
              variant={inputMethod === "upload" ? "primary" : "secondary"}
              onClick={() => setInputMethod("upload")}
              disabled={isBusy}
            >
              Upload PNG
            </Button>
          </div>

          <div className="mt-6">
            <label className="flex items-start gap-3 text-sm leading-6 text-zinc-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-red-700 focus:ring-red-700"
                checked={certificationConfirmed}
                onChange={(event) => {
                  setCertificationConfirmed(event.target.checked);
                  setUploadState((current) => ({
                    ...current,
                    error: null,
                  }));
                }}
                disabled={isBusy}
              />
              <span>{CERTIFICATION_TEXT}</span>
            </label>
          </div>

          <div className="mt-6">
            {inputMethod === "draw" ? (
              <SignatureDrawCanvas
                disabled={isBusy || !certificationConfirmed}
                onSave={async (blob) => {
                  await handleSaveBlob(blob, "signature.png");
                }}
              />
            ) : (
              <div className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,.png"
                  className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-800 hover:file:bg-zinc-200"
                  disabled={isBusy || !certificationConfirmed}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleUploadSelected(file);
                    event.target.value = "";
                  }}
                />
                <p className="text-sm text-zinc-600">
                  PNG only. Maximum file size 1 MB. Recommended dimensions are
                  at least 150 by 50 pixels and no larger than 2000 by 1000
                  pixels.
                </p>
                <Button
                  type="button"
                  disabled={isBusy || !certificationConfirmed}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadState.isSaving ? "Saving…" : "Save Upload"}
                </Button>
              </div>
            )}
          </div>

          {uploadState.error ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {uploadState.error}
            </p>
          ) : null}
          {uploadState.successMessage ? (
            <p className="mt-4 text-sm text-green-700" role="status">
              {uploadState.successMessage}
            </p>
          ) : null}

          {signature ? (
            <div className="mt-8 border-t border-zinc-200 pt-6">
              <h3 className="text-base font-semibold text-zinc-900">
                Delete signature
              </h3>
              <p className="mt-2 text-sm text-zinc-600">
                Removing your stored signature deletes both the private image
                and its metadata.
              </p>
              <Button
                type="button"
                variant="danger"
                className="mt-4"
                disabled={isBusy}
                onClick={() => {
                  void handleDeleteSignature();
                }}
              >
                {uploadState.isDeleting ? "Deleting…" : "Delete Signature"}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
