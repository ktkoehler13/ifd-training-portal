"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  canRetryApprovedPacketGeneration,
  formatTrainingRequestPacketStatus,
} from "@/lib/training-request-packet-access";
import {
  getTrainingRequestPacketByRequestId,
  retryApprovedPacketGeneration,
} from "@/lib/training-request-packet";
import type { TrainingRequestRecord } from "@/types/training-request";
import type { TrainingRequestPacketRecord } from "@/types/training-request-packet";

interface ApprovedPacketPanelProps {
  personnel: AuthenticatedPersonnel;
  request: TrainingRequestRecord;
  initialPacket: TrainingRequestPacketRecord | null;
}

function formatGeneratedAt(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ApprovedPacketPanel({
  personnel,
  request,
  initialPacket,
}: ApprovedPacketPanelProps) {
  const [packet, setPacket] = useState(initialPacket);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (request.status !== "approved") {
    return null;
  }

  const canRetry = canRetryApprovedPacketGeneration(personnel.role);
  const downloadUrl = `/api/training-requests/${encodeURIComponent(request.id)}/approved-packet`;

  async function handleRetry() {
    setIsRetrying(true);
    setError(null);

    try {
      await retryApprovedPacketGeneration(request.id);
      const refreshed = await getTrainingRequestPacketByRequestId(request.id);
      setPacket(refreshed);
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "Unable to retry approved packet generation.",
      );
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
      <h2 className="text-lg font-semibold text-zinc-900">
        Approved Training Packet
      </h2>

      {!packet ? (
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Approved packet metadata is not available yet.
        </p>
      ) : (
        <dl className="mt-4 grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-zinc-900">Filename</dt>
            <dd className="mt-1">{packet.filename}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900">Status</dt>
            <dd className="mt-1">{formatTrainingRequestPacketStatus(packet.status)}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900">Generated</dt>
            <dd className="mt-1">{formatGeneratedAt(packet.generatedAt)}</dd>
          </div>
        </dl>
      )}

      {packet?.status === "pending" || packet?.status === "processing" ? (
        <p className="mt-4 text-sm leading-6 text-zinc-600" role="status">
          Approved packet is being prepared.
        </p>
      ) : null}

      {packet?.status === "failed" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-6 text-red-700" role="alert">
            Approved packet generation failed.
          </p>
          {packet.lastError ? (
            <p className="text-sm leading-6 text-zinc-600">{packet.lastError}</p>
          ) : null}
          {canRetry ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isRetrying}
              onClick={() => void handleRetry()}
            >
              {isRetrying ? "Retrying..." : "Retry Generation"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {packet?.status === "ready" ? (
        <div className="mt-5">
          <Button
            type="button"
            onClick={() => {
              window.location.href = downloadUrl;
            }}
          >
            Download Approved Training Packet
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
