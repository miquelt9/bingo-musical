export interface VideoWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TITLEBAR_HEIGHT = 30;
const MIN_WIDTH = 240;
const MIN_CONTENT_HEIGHT = 135;
const VIEWPORT_MARGIN = 8;
const TASKBAR_HEIGHT = 48;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampVideoWindowBounds(bounds: VideoWindowBounds): VideoWindowBounds {
  if (typeof window === "undefined") return bounds;

  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const maxHeight = Math.max(
    TITLEBAR_HEIGHT + MIN_CONTENT_HEIGHT,
    window.innerHeight - TASKBAR_HEIGHT - VIEWPORT_MARGIN * 2
  );
  const width = clamp(bounds.width, MIN_WIDTH, maxWidth);
  const height = clamp(bounds.height, TITLEBAR_HEIGHT + MIN_CONTENT_HEIGHT, maxHeight);
  const x = clamp(bounds.x, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const y = clamp(
    bounds.y,
    VIEWPORT_MARGIN,
    window.innerHeight - TASKBAR_HEIGHT - height - VIEWPORT_MARGIN
  );
  return { x, y, width, height };
}

export function getDefaultVideoWindowBounds(): VideoWindowBounds {
  const width = 320;
  const contentHeight = Math.round((width * 9) / 16);
  const height = TITLEBAR_HEIGHT + contentHeight;

  if (typeof window === "undefined") {
    return { x: 100, y: 100, width, height };
  }

  return clampVideoWindowBounds({
    x: window.innerWidth - width - 32,
    y: window.innerHeight - height - TASKBAR_HEIGHT - 140,
    width,
    height,
  });
}
