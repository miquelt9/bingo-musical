import React, { useEffect, useRef, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { PcModal } from "./PcModal";

interface DialogActionsProps {
  cancelLabel?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const DialogActions: React.FC<DialogActionsProps> = ({
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}) => (
  <div className="flex justify-end gap-2 pt-2">
    {cancelLabel && (
      <Button type="button" onClick={onCancel}>
        {cancelLabel}
      </Button>
    )}
    <Button type="button" variant="primary" onClick={onConfirm}>
      {confirmLabel}
    </Button>
  </div>
);

interface PromptModalProps {
  title: React.ReactNode;
  message?: React.ReactNode;
  defaultValue: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  title,
  message,
  defaultValue,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
}) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <PcModal title={title} onClose={onCancel}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(value);
        }}
      >
        {message && <p className="text-sm">{message}</p>}
        <input
          ref={inputRef}
          type="text"
          className="pc-input w-full"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Name"
        />
        <DialogActions
          cancelLabel={cancelLabel}
          confirmLabel={confirmLabel}
          onCancel={onCancel}
          onConfirm={() => onConfirm(value)}
        />
      </form>
    </PcModal>
  );
};

interface ConfirmModalProps {
  title: React.ReactNode;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
}) => (
  <PcModal title={title} onClose={onCancel}>
    <div className="space-y-3">
      <div className="text-sm">{children}</div>
      <DialogActions
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </div>
  </PcModal>
);

interface AlertModalProps {
  title: React.ReactNode;
  children: React.ReactNode;
  closeLabel?: string;
  onClose: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  title,
  children,
  closeLabel = "OK",
  onClose,
}) => (
  <PcModal title={title} onClose={onClose}>
    <div className="space-y-3">
      <div className="text-sm">{children}</div>
      <div className="flex justify-end pt-2">
        <Button type="button" variant="primary" onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
    </div>
  </PcModal>
);
