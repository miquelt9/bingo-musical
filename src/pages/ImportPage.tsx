import React, { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Window } from "@miquelt9/pc-ui";
import { AlertCircle, Upload } from "lucide-react";
import { BackButton } from "../components/ui/BackButton";
import { useDeck } from "../state/DeckContext";

export const ImportPage: React.FC = () => {
  const { importDeck } = useDeck();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    setError(null);
    setIsImporting(true);
    try {
      const imported = await importDeck(file);
      navigate(`/deck/${imported.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFile(e.target.files?.[0]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    void handleFile(file);
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <BackButton fallbackTo="/" fallbackLabel="All decks" className="inline-flex" />

      <Window title="Import a shared deck">
        <p className="text-sm mb-4">
          Drop a <code className="text-xs">.json</code> deck file shared with you, or choose it from your device.
          If someone sent you a short link (for example <code className="text-xs">#/share/Ab12Cd34</code>), open that
          link directly instead.
        </p>

        <div
          className={`pc-bevel-inset p-8 text-center transition-colors ${
            isDragging ? "bg-blue-50 dark:bg-blue-950/30" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <Upload className="w-10 h-10 mx-auto mb-3 opacity-70" />
          <p className="text-sm mb-4">Drag and drop your deck file here</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onFileChange}
          />
          <Button
            type="button"
            variant="primary"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" />
            {isImporting ? "Importing…" : "Choose file"}
          </Button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 text-xs pc-bevel-inset p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-xs mt-4">
          Don&apos;t have a deck yet?{" "}
          <Link to="/" className="pc-link">
            Create your own Musical Bingo deck
          </Link>
          .
        </p>
      </Window>
    </div>
  );
};
