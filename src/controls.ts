// Single source of truth for the 21 player controls.
// Each control maps its gridIdentifier (== CSS class) to a Lucide icon and span hints.

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

export interface ControlDef {
  id: GridIdentifier; // == CSS class
  label: string;
  icon: IconNode; // pass to lucide createElement()
  defaultSpan: number; // cells consumed on first drop (most = 1)
  maxSpan: number; // resize cap; Number.POSITIVE_INFINITY = to grid edge
}

const INF = Number.POSITIVE_INFINITY;

// Most controls are single-cell, icon-only, and not resizable (maxSpan: 1).
// The time controls, Volume, and VideoProgress can be extended horizontally.
export const CONTROLS: readonly ControlDef[] = [
  { id: "AirPlay", label: "AirPlay", icon: Airplay, defaultSpan: 1, maxSpan: 1 },
  { id: "Backward", label: "Backward", icon: Rewind, defaultSpan: 1, maxSpan: 1 },
  { id: "CaptionSearch", label: "CaptionSearch", icon: TextSearch, defaultSpan: 1, maxSpan: 1 },
  { id: "Captions", label: "Captions", icon: Captions, defaultSpan: 1, maxSpan: 1 },
  { id: "Cast", label: "Cast", icon: Cast, defaultSpan: 1, maxSpan: 1 },
  { id: "Chapters", label: "Chapters", icon: ListVideo, defaultSpan: 1, maxSpan: 1 },
  { id: "Forward", label: "Forward", icon: FastForward, defaultSpan: 1, maxSpan: 1 },
  { id: "FullScreen", label: "FullScreen", icon: Fullscreen, defaultSpan: 1, maxSpan: 1 },
  { id: "Notification", label: "Notification", icon: Bell, defaultSpan: 1, maxSpan: 1 },
  { id: "PictureInPicture", label: "PictureInPicture", icon: PictureInPicture, defaultSpan: 1, maxSpan: 1 },
  { id: "PlayNPause", label: "PlayNPause", icon: Play, defaultSpan: 1, maxSpan: 1 },
  { id: "Quality", label: "Quality", icon: Gauge, defaultSpan: 1, maxSpan: 1 },
  { id: "SaveVideoOffline", label: "SaveVideoOffline", icon: Download, defaultSpan: 1, maxSpan: 1 },
  { id: "Setting", label: "Setting", icon: Settings, defaultSpan: 1, maxSpan: 1 },
  { id: "Speed", label: "Speed", icon: Timer, defaultSpan: 1, maxSpan: 1 },
  { id: "TimeConsumed", label: "TimeConsumed", icon: Clock, defaultSpan: 2, maxSpan: 4 },
  { id: "TimeLeft", label: "TimeLeft", icon: ClockArrowDown, defaultSpan: 2, maxSpan: 4 },
  { id: "TimeDuration", label: "TimeDuration", icon: Clock3, defaultSpan: 2, maxSpan: 4 },
  { id: "TimeAll", label: "TimeAll", icon: Clock, defaultSpan: 3, maxSpan: 6 },
  // Extendable controls — resizable horizontally across the grid.
  { id: "VideoProgress", label: "VideoProgress", icon: SlidersHorizontal, defaultSpan: 5, maxSpan: INF },
  { id: "Volume", label: "Volume", icon: Volume2, defaultSpan: 3, maxSpan: INF },
] as const;

export const CONTROL_BY_ID: ReadonlyMap<GridIdentifier, ControlDef> = new Map(
  CONTROLS.map((c) => [c.id, c]),
);
