// Single source of truth for the 21 BUILT-IN player controls. Each control maps
// its built-in id (the stable cross-platform contract id) to a Lucide icon NAME
// and a render kind. The kind drives both how the studio renders the control and
// how it is exported in player.json (see spec.md §6).
//
// User-added "custom" controls and per-control icon overrides live at runtime in
// the ControlRegistry (see registry.ts), which seeds itself from BUILTINS here.

import type { IconName } from "./icons";

// The 21 reserved contract ids every platform binds behavior to.
export type BuiltinId =
  | "AirPlay"
  | "Backward"
  | "CaptionSearch"
  | "Captions"
  | "Cast"
  | "Chapters"
  | "Forward"
  | "FullScreen"
  | "Notification"
  | "PictureInPicture"
  | "PlayNPause"
  | "Quality"
  | "SaveVideoOffline"
  | "Setting"
  | "Speed"
  | "TimeConsumed"
  | "TimeLeft"
  | "TimeDuration"
  | "TimeAll"
  | "VideoProgress"
  | "Volume";

// Back-compat alias for the built-in contract id.
export type GridIdentifier = BuiltinId;

// Any control id — a reserved built-in OR a user-defined custom id (CUSTOM_*).
// The `(string & {})` keeps autocomplete for the built-ins while allowing customs.
export type ControlId = BuiltinId | (string & {});

// icon   — a single Lucide glyph (most controls)
// text   — a HH:MM style readout (the Time controls)
// slider — a horizontal range that fills available width (progress / volume)
export type ControlKind = "icon" | "text" | "slider";

export interface ControlDef {
  id: ControlId; // the cross-platform contract id (or a CUSTOM_* id)
  label: string;
  icon: IconName; // a Lucide icon name, resolved via renderIcon()
  kind: ControlKind;
  custom?: boolean; // true for user-added controls
  text?: string; // display string for kind === "text"
  // Grid mode only: cells consumed on first drop, and the horizontal resize cap
  // (Number.POSITIVE_INFINITY = to the grid edge). Ignored by region/free modes.
  defaultSpan: number;
  maxSpan: number;
}

const INF = Number.POSITIVE_INFINITY;

export const BUILTINS: readonly ControlDef[] = [
  { id: "AirPlay", label: "AirPlay", icon: "Airplay", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Backward", label: "Backward", icon: "Rewind", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "CaptionSearch", label: "CaptionSearch", icon: "TextSearch", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Captions", label: "Captions", icon: "Captions", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Cast", label: "Cast", icon: "Cast", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Chapters", label: "Chapters", icon: "ListVideo", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Forward", label: "Forward", icon: "FastForward", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "FullScreen", label: "FullScreen", icon: "Fullscreen", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Notification", label: "Notification", icon: "Bell", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "PictureInPicture", label: "PictureInPicture", icon: "PictureInPicture", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "PlayNPause", label: "PlayNPause", icon: "Play", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Quality", label: "Quality", icon: "Gauge", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "SaveVideoOffline", label: "SaveVideoOffline", icon: "Download", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Setting", label: "Setting", icon: "Settings", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Speed", label: "Speed", icon: "Timer", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "TimeConsumed", label: "TimeConsumed", icon: "Clock", kind: "text", text: "00:00", defaultSpan: 2, maxSpan: 4 },
  { id: "TimeLeft", label: "TimeLeft", icon: "ClockArrowDown", kind: "text", text: "00:00", defaultSpan: 2, maxSpan: 4 },
  { id: "TimeDuration", label: "TimeDuration", icon: "Clock3", kind: "text", text: "00:00", defaultSpan: 2, maxSpan: 4 },
  { id: "TimeAll", label: "TimeAll", icon: "Clock", kind: "text", text: "00:00 / 00:00", defaultSpan: 3, maxSpan: 6 },
  // Sliders — render at flex width; export with align "fill" (region) / fraction (free).
  { id: "VideoProgress", label: "VideoProgress", icon: "SlidersHorizontal", kind: "slider", defaultSpan: 5, maxSpan: INF },
  { id: "Volume", label: "Volume", icon: "Volume2", kind: "slider", defaultSpan: 3, maxSpan: INF },
] as const;

export const BUILTIN_BY_ID: ReadonlyMap<ControlId, ControlDef> = new Map(
  BUILTINS.map((c) => [c.id, c]),
);
