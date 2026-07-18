"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/Button";
import {
  PERSONNEL_SIGNATURE_MIN_HEIGHT,
  PERSONNEL_SIGNATURE_MIN_WIDTH,
} from "@/types/personnel-signature";

interface SignatureDrawCanvasProps {
  disabled?: boolean;
  onSave: (blob: Blob) => void | Promise<void>;
}

interface Point {
  x: number;
  y: number;
}

function trimCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const context = source.getContext("2d");
  if (!context) {
    return null;
  }

  const { width, height } = source;
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  let top = height;
  let left = width;
  let right = 0;
  let bottom = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const isStroke =
        alpha > 0 && !(red === 255 && green === 255 && blue === 255);

      if (isStroke) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  const trimmedWidth = right - left + 1;
  const trimmedHeight = bottom - top + 1;
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;

  const trimmedContext = trimmedCanvas.getContext("2d");
  if (!trimmedContext) {
    return null;
  }

  trimmedContext.drawImage(
    source,
    left,
    top,
    trimmedWidth,
    trimmedHeight,
    0,
    0,
    trimmedWidth,
    trimmedHeight,
  );

  return trimmedCanvas;
}

export function SignatureDrawCanvas({
  disabled = false,
  onSave,
}: SignatureDrawCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const [hasStroke, setHasStroke] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(Math.floor(rect.width), 320);
    const nextHeight = Math.max(Math.floor(rect.height), 180);
    const imageData = canvas
      .getContext("2d")
      ?.getImageData(0, 0, canvas.width, canvas.height);

    canvas.width = nextWidth;
    canvas.height = nextHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#000000";
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (imageData && hasStroke) {
      context.putImageData(imageData, 0, 0);
    }
  }, [hasStroke]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  function getCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = getCanvasPoint(event);
    lastPointRef.current = point;
    context.beginPath();
    context.moveTo(point.x, point.y);
    setError(null);
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    event.preventDefault();
    const point = getCanvasPoint(event);
    const lastPoint = lastPointRef.current ?? point;
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
    setHasStroke(true);
  }

  function stopDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    lastPointRef.current = null;

    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    setError(null);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) {
      setError("Draw your signature before saving.");
      return;
    }

    const trimmedCanvas = trimCanvas(canvas);
    if (!trimmedCanvas) {
      setError("Draw your signature before saving.");
      return;
    }

    if (
      trimmedCanvas.width < PERSONNEL_SIGNATURE_MIN_WIDTH ||
      trimmedCanvas.height < PERSONNEL_SIGNATURE_MIN_HEIGHT
    ) {
      setError(
        `Signature must be at least ${PERSONNEL_SIGNATURE_MIN_WIDTH}px wide and ${PERSONNEL_SIGNATURE_MIN_HEIGHT}px tall after trimming.`,
      );
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        trimmedCanvas.toBlob((value) => {
          if (!value) {
            reject(new Error("Unable to export the drawn signature."));
            return;
          }

          resolve(value);
        }, "image/png");
      });

      await onSave(blob);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the drawn signature.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white">
        <canvas
          ref={canvasRef}
          className="block h-48 w-full touch-none sm:h-56"
          aria-label="Signature drawing canvas"
          onPointerDown={startDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          onPointerCancel={stopDrawing}
        />
      </div>
      <p className="text-sm text-zinc-600">
        Draw with your mouse, finger, or stylus. Use Clear to start over.
      </p>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={handleClear}
          disabled={disabled || isSaving}
        >
          Clear
        </Button>
        <Button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={disabled || isSaving || !hasStroke}
        >
          {isSaving ? "Saving…" : "Save Drawing"}
        </Button>
      </div>
    </div>
  );
}
