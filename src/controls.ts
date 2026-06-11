// Single source of truth for the 21 player controls.
// Each control maps its gridIdentifier (the stable cross-platform id) to a Lucide
// icon and a render kind. The kind drives both how the studio renders the control
// and how it is exported in player.json (see spec.md §6).

import {
  Airplay,
  Rewind,
  TextSearch,
  Captions,
  Cast,
  ListVideo,
  FastForward,
  Fullscreen,
  Bell,
  PictureInPicture,
  Play,
  Gauge,
  Download,
  Settings,
  Timer,
  Clock,
  ClockArrowDown,
  Clock3,
  SlidersHorizontal,
  Volume2,
} from "lucide";
import type { IconNode } from "lucide";

export type GridIdentifier =
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

// icon   — a single Lucide glyph (most controls)
// text   — a HH:MM style readout (the Time controls)
// slider — a horizontal range that fills available width (progress / volume)
export type ControlKind = "icon" | "text" | "slider";

export interface ControlDef {
  id: GridIdentifier; // the cross-platform contract id
  label: string;
  icon: IconNode; // pass to lucide createElement()
  kind: ControlKind;
  text?: string; // display string for kind === "text"
  // Grid mode only: cells consumed on first drop, and the horizontal resize cap
  // (Number.POSITIVE_INFINITY = to the grid edge). Ignored by region/free modes.
  defaultSpan: number;
  maxSpan: number;
}

const INF = Number.POSITIVE_INFINITY;

export const CONTROLS: readonly ControlDef[] = [
  { id: "AirPlay", label: "AirPlay", icon: Airplay, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Backward", label: "Backward", icon: Rewind, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "CaptionSearch", label: "CaptionSearch", icon: TextSearch, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Captions", label: "Captions", icon: Captions, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Cast", label: "Cast", icon: Cast, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Chapters", label: "Chapters", icon: ListVideo, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Forward", label: "Forward", icon: FastForward, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "FullScreen", label: "FullScreen", icon: Fullscreen, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Notification", label: "Notification", icon: Bell, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "PictureInPicture", label: "PictureInPicture", icon: PictureInPicture, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "PlayNPause", label: "PlayNPause", icon: Play, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Quality", label: "Quality", icon: Gauge, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "SaveVideoOffline", label: "SaveVideoOffline", icon: Download, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Setting", label: "Setting", icon: Settings, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Speed", label: "Speed", icon: Timer, kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "TimeConsumed", label: "TimeConsumed", icon: Clock, kind: "text", text: "00:00", defaultSpan: 2, maxSpan: 4 },
  { id: "TimeLeft", label: "TimeLeft", icon: ClockArrowDown, kind: "text", text: "00:00", defaultSpan: 2, maxSpan: 4 },
  { id: "TimeDuration", label: "TimeDuration", icon: Clock3, kind: "text", text: "00:00", defaultSpan: 2, maxSpan: 4 },
  { id: "TimeAll", label: "TimeAll", icon: Clock, kind: "text", text: "00:00 / 00:00", defaultSpan: 3, maxSpan: 6 },
  // Sliders — render at flex width; export with align "fill" (region) / fraction (free).
  { id: "VideoProgress", label: "VideoProgress", icon: SlidersHorizontal, kind: "slider", defaultSpan: 5, maxSpan: INF },
  { id: "Volume", label: "Volume", icon: Volume2, kind: "slider", defaultSpan: 3, maxSpan: INF },
] as const;

export const CONTROL_BY_ID: ReadonlyMap<GridIdentifier, ControlDef> = new Map(
  CONTROLS.map((c) => [c.id, c]),
);

export function isFill(id: GridIdentifier): boolean {
  return CONTROL_BY_ID.get(id)?.kind === "slider";
}
