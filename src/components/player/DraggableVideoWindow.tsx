import React, { useCallback, useEffect, useRef } from "react";
import { clampVideoWindowBounds, VideoWindowBounds } from "../../lib/videoWindow";
import { useIsMobile } from "../../hooks/useMediaQuery";

const TITLEBAR_HEIGHT = 30;
const MIN_CONTENT_HEIGHT = 135;

interface HostInlineVideoPanelProps {
  visible: boolean;
  children: React.ReactNode;
}

/** Fixed 16:9 inline video panel for mobile host — no drag or resize. */
export const HostInlineVideoPanel: React.FC<HostInlineVideoPanelProps> = ({
  visible,
  children,
}) => {
  if (!visible) return null;

  return (
    <div className="host-inline-video print:hidden">
      <div className="host-inline-video__inner bg-black">{children}</div>
    </div>
  );
};

interface DraggableVideoWindowProps {
  visible: boolean;
  bounds: VideoWindowBounds;
  onBoundsChange: (bounds: VideoWindowBounds) => void;
  onClose: () => void;
  children: React.ReactNode;
}

export const DraggableVideoWindow: React.FC<DraggableVideoWindowProps> = ({
  visible,
  bounds,
  onBoundsChange,
  onClose,
  children,
}) => {
  const isMobile = useIsMobile();

  const interactionRef = useRef<
    | {
        kind: "drag" | "resize";
        startX: number;
        startY: number;
        origin: VideoWindowBounds;
      }
    | null
  >(null);

  const endInteraction = useCallback(() => {
    interactionRef.current = null;
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const dx = e.clientX - interaction.startX;
      const dy = e.clientY - interaction.startY;

      if (interaction.kind === "drag") {
        onBoundsChange(
          clampVideoWindowBounds({
            ...interaction.origin,
            x: interaction.origin.x + dx,
            y: interaction.origin.y + dy,
          })
        );
        return;
      }

      onBoundsChange(
        clampVideoWindowBounds({
          ...interaction.origin,
          width: interaction.origin.width + dx,
          height: interaction.origin.height + dy,
        })
      );
    },
    [onBoundsChange]
  );

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endInteraction);
    window.addEventListener("pointercancel", endInteraction);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endInteraction);
      window.removeEventListener("pointercancel", endInteraction);
    };
  }, [handlePointerMove, endInteraction]);

  useEffect(() => {
    const handleResize = () => onBoundsChange(clampVideoWindowBounds(bounds));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [bounds, onBoundsChange]);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    interactionRef.current = {
      kind: "drag",
      startX: e.clientX,
      startY: e.clientY,
      origin: bounds,
    };
  };

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    interactionRef.current = {
      kind: "resize",
      startX: e.clientX,
      startY: e.clientY,
      origin: bounds,
    };
  };

  const contentHeight = Math.max(MIN_CONTENT_HEIGHT, bounds.height - TITLEBAR_HEIGHT);

  if (isMobile) return null;

  return (
    <div
      className={`print:hidden pc-window video-window-draggable ${
        visible ? "video-window-draggable--visible" : "video-window-draggable--hidden"
      }`}
      style={
        visible
          ? {
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
            }
          : undefined
      }
    >
      <div
        className="pc-titlebar video-window-draggable__titlebar"
        onPointerDown={startDrag}
      >
        <div className="pc-titlebar-title">YouTube</div>
        <div className="pc-titlebar-controls">
          <button
            type="button"
            className="pc-titlebar-btn"
            onClick={onClose}
            aria-label="Close"
          >
            X
          </button>
        </div>
      </div>
      <div className="video-window-draggable__content bg-black" style={{ height: contentHeight }}>
        {children}
      </div>
      {visible && (
        <div
          className="video-window-resize-handle"
          onPointerDown={startResize}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
