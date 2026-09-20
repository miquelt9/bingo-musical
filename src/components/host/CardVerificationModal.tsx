import React, { useCallback, useEffect, useRef, useState } from "react";

import { Button, Input } from "@miquelt9/pc-ui";
import { Check, Camera, CircleAlert, Loader2, ScanLine, Trophy } from "lucide-react";
import { Deck } from "../../types/deck";
import {
  CardVerificationResult,
  verifyCardCode,
} from "../../lib/bingo/verification";
import { PcModal } from "../ui/PcModal";

interface CardVerificationModalProps {
  deck: Deck;
  calledTrackIds: ReadonlySet<string>;
  lineAwarded: boolean;
  onAcceptLine: () => void;
  onClose: () => void;
}

function resultTitle(result: Extract<CardVerificationResult, { kind: "verified" }>): string {
  if (result.bingo) return "Bingo confirmed";
  if (result.lineRows.length > 0 && result.lineAccepted) return "Line confirmed";
  if (result.lineRows.length > 0) return "Line found, but already awarded";
  return "No line or Bingo yet";
}

function resultClass(result: Extract<CardVerificationResult, { kind: "verified" }>): string {
  if (result.bingo || result.lineAccepted) return "text-emerald-700";
  if (result.lineRows.length > 0) return "text-pc-warning";
  return "text-pc-error";
}

export const CardVerificationModal: React.FC<CardVerificationModalProps> = ({
  deck,
  calledTrackIds,
  lineAwarded,
  onAcceptLine,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const scannedRef = useRef(false);
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<CardVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
  }, []);

  const verify = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setManualCode(trimmed);
      setIsVerifying(true);
      void verifyCardCode(trimmed, deck, calledTrackIds, lineAwarded)
        .then(setResult)
        .finally(() => setIsVerifying(false));
    },
    [calledTrackIds, deck, lineAwarded]
  );

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return undefined;

    void import("@zxing/browser")
      .then(({ BrowserQRCodeReader }) => {
        if (cancelled) return null;
        const reader = new BrowserQRCodeReader();
        return reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video,
          (decoded) => {
            if (cancelled || scannedRef.current || !decoded) return;
            scannedRef.current = true;
            stopCamera();
            verify(decoded.getText());
          }
        );
      })
      .then((controls) => {
        if (!controls) return;
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setCameraActive(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCameraError(
          error instanceof Error && error.message
            ? error.message
            : "Camera access was unavailable. You can enter the card code below."
        );
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [stopCamera, verify]);

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <PcModal title="Verify line or Bingo" onClose={handleClose} className="max-w-xl">
      <div className="space-y-4">
        <p className="text-sm">
          Scan the verification QR in the card&apos;s top-right corner, or enter its card code.
          Verification uses this deck and the songs already called in this game.
        </p>

        <div className="pc-bevel-inset p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Camera className="w-4 h-4" />
            Camera scanner
          </div>
          <div className="relative overflow-hidden bg-black min-h-48 flex items-center justify-center">
            <video
              ref={videoRef}
              muted
              autoPlay
              playsInline
              className={`w-full max-h-64 object-cover ${cameraActive ? "" : "hidden"}`}
            />
            {!cameraActive && (
              <div className="p-6 text-center text-xs text-white/80">
                <ScanLine className="w-8 h-8 mx-auto mb-2" />
                {cameraError || "Starting camera…"}
              </div>
            )}
          </div>
          {cameraError && <p className="text-[11px] text-pc-warning">{cameraError}</p>}
          {cameraActive && (
            <p className="text-[11px] text-muted">Point the camera at the card&apos;s verification QR.</p>
          )}
        </div>

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            verify(manualCode);
          }}
        >
          <label className="block text-xs font-bold" htmlFor="card-verification-code">
            Card code
          </label>
          <div className="flex gap-2">
            <Input
              id="card-verification-code"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="B1-…"
              autoComplete="off"
              className="flex-1 font-mono uppercase"
            />
            <Button type="submit" variant="primary" disabled={isVerifying || !manualCode.trim()}>
              {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
            </Button>
          </div>
        </form>

        {result?.kind === "invalid-code" && (
          <div className="pc-bevel-inset border-l-4 border-red-500 p-3 text-sm flex items-start gap-2">
            <CircleAlert className="w-4 h-4 text-pc-error shrink-0 mt-0.5" />
            <span>{result.message}</span>
          </div>
        )}

        {result?.kind === "deck-mismatch" && (
          <div className="pc-bevel-inset border-l-4 border-amber-500 p-3 text-sm flex items-start gap-2">
            <CircleAlert className="w-4 h-4 text-pc-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Different deck version</p>
              <p className="mt-1">{result.message} Restore the deck used for printing or open its original shared snapshot.</p>
            </div>
          </div>
        )}

        {result?.kind === "verified" && (
          <div className="pc-bevel-inset p-3 space-y-3" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`font-black text-lg ${resultClass(result)}`}>
                  {result.bingo ? <Trophy className="inline w-5 h-5 mr-1 align-[-3px]" /> : null}
                  {resultTitle(result)}
                </p>
                <p className="text-xs text-muted mt-1">
                  Card {result.payload.cardNumber} · {result.calledCellCount}/{result.filledCellCount} filled cells called
                </p>
              </div>
              {result.bingo && <Check className="w-6 h-6 text-emerald-700 shrink-0" />}
            </div>

            {result.lineRows.length > 0 && (
              <p className="text-xs font-bold">
                Horizontal row{result.lineRows.length === 1 ? "" : "s"} complete: {result.lineRows.join(", ")}
              </p>
            )}

            {!result.bingo && result.lineRows.length > 0 && result.lineAwarded && (
              <p className="text-xs text-pc-warning">
                The line is complete, but the single line prize has already been awarded. This card must complete Bingo for a new claim.
              </p>
            )}

            {result.missingCells.length > 0 && (
              <div>
                <p className="text-xs font-bold mb-1">Still missing:</p>
                <ul className="text-xs space-y-1 max-h-28 overflow-auto">
                  {result.missingCells.map((cell) => (
                    <li key={cell.index}>
                      Row {cell.row}, column {cell.column}: {cell.title} — {cell.artist}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {result.lineAccepted && (
                <Button type="button" variant="primary" onClick={onAcceptLine}>
                  <Check className="w-4 h-4" /> Award line
                </Button>
              )}
              <Button type="button" onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </PcModal>
  );
};
