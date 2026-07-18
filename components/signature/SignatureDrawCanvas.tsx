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
  mapSignatureErrorForUser,
  normalizeSignatureCanvas,
} from "@/lib/personnel-signature-normalize";

interface SignatureDrawCanvasProps {
  disabled?: boolean;
  onSave: (
    blob: Blob,
    meta?: { resized?: boolean },
  ) => void | Promise<void>;
}

interface Point {
  x: number;
  y: number;
}

const DRAWING_INSET_PX = 16;

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

  const configureDrawingContext = useCallback((context: CanvasRenderingContext2D) => {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    context.strokeStyle = "#000000";
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(Math.floor(rect.width), 480);
    const nextHeight = Math.max(Math.floor(rect.height), 224);
    const imageData = canvas
      .getContext("2d")
      ?.getImageData(0, 0, canvas.width, canvas.height);

    canvas.width = nextWidth;
    canvas.height = nextHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    configureDrawingContext(context);

    if (imageData && hasStroke) {
      context.putImageData(imageData, 0, 0);
    }
  }, [configureDrawingContext, hasStroke]);

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
    const rawX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const rawY = ((event.clientY - rect.top) / rect.height) * canvas.height;

    return {
      x: Math.min(
        canvas.width - DRAWING_INSET_PX,
        Math.max(DRAWING_INSET_PX, rawX),
      ),
      y: Math.min(
        canvas.height - DRAWING_INSET_PX,
        Math.max(DRAWING_INSET_PX, rawY),
      ),
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

    configureDrawingContext(context);
    setHasStroke(false);
    setError(null);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) {
      setError("Draw your signature before saving.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const normalized = await normalizeSignatureCanvas(canvas);
      await onSave(normalized.blob, { resized: normalized.resized });
    } catch (saveError) {
      setError(mapSignatureErrorForUser(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white p-4 sm:p-6">
        <canvas
          ref={canvasRef}
          className="block h-56 w-full touch-none lg:h-72"
          aria-label="Signature drawing canvas"
          onPointerDown={startDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          onPointerCancel={stopDrawing}
        />
      </div>
      <p className="text-sm text-zinc-600">
        Draw with your mouse, finger, or stylus. The panel is wider on desktop so
        long signatures fit comfortably. Use Clear to start over.
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
