import type { CSSProperties } from "react";

interface PlexMarkProps {
  /** Height in px — width scales proportionally (≈ 13/20 aspect ratio). */
  height?: number;
  style?: CSSProperties;
}

/** The yellow diamond mark from the Plex logo (the X-mark amber diamond). */
export default function PlexMark({ height = 20, style }: PlexMarkProps) {
  const width = Math.round(height * (13 / 20));
  return (
    <svg viewBox="104 13 28 42" width={width} height={height} aria-hidden="true" style={style}>
      <polygon fill="#e5a00d" points="117.9,33.9 104.1,13.5 118.3,13.5 132,33.9 118.3,54.2 104.1,54.2" />
    </svg>
  );
}
