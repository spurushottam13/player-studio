// Single source of truth for the 17 BUILT-IN player controls. Each control maps
// its built-in id (the stable cross-platform contract id) to a Material Icons
// NAME (the icon's own key, e.g. "play_arrow") and a render kind. The kind drives both how the studio renders the control and
// how it is exported in player.json (see spec.md §6).
//
// User-added "custom" controls and per-control icon overrides live at runtime in
// the ControlRegistry (see registry.ts), which seeds itself from BUILTINS here.

import type { IconName } from "./icons";

// The 17 reserved contract ids every platform binds behavior to. All time readouts
// (TimeConsumed / TimeLeft / TimeDuration / TimeAll) are now authored as text
// controls via the "+ Add text" flow (see TextType / registry.addText) — none are
// built-ins. The default layout seeds a Time Consumed text control instead (see
// registry.DEFAULT_TIME_CONTROL_ID).
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
  | "VideoProgress"
  | "Volume";

// Back-compat alias for the built-in contract id.
export type GridIdentifier = BuiltinId;

// Any control id — a reserved built-in OR a user-defined custom id (CUSTOM_*).
// The `(string & {})` keeps autocomplete for the built-ins while allowing customs.
export type ControlId = BuiltinId | (string & {});

// icon       — a single Material glyph (most controls)
// text       — a HH:MM style readout (the Time controls)
// slider     — a horizontal range that fills available width (VideoProgress only)
// spacer     — a blank block that adds horizontal space between controls
// background — a color layer rendered behind a row's controls
export type ControlKind = "icon" | "text" | "slider" | "spacer" | "background";

const KINDS = new Set<string>(["icon", "text", "slider", "spacer", "background"]);
export function isControlKind(v: unknown): v is ControlKind {
  return typeof v === "string" && KINDS.has(v);
}

// The flavours of user-addable TEXT control (the "+ Add text" flow). The four
// time readouts always show 00:00 (timeAll joins two with a separator); the rest
// carry their own preview. All render as kind === "text".
export type TextType =
  | "timeLeft"
  | "timeConsumed"
  | "timeDuration"
  | "timeAll"
  | "currentChapter"
  | "dynamicText"
  | "title";

export interface ControlDef {
  id: ControlId; // the cross-platform contract id (or a CUSTOM_* id)
  label: string;
  icon: IconName; // a Material icon name (its catalog key), resolved via renderIcon()
  kind: ControlKind;
  custom?: boolean; // true for user-added controls
  text?: string; // display string for kind === "text"
  // Text-control extras (set by the "+ Add text" flow; see registry.addText):
  textType?: TextType; // which text flavour a custom text control is
  separator?: string; // TimeAll only — glue between the two readouts (default " / ")
  variable?: string; // Dynamic Text only — the cdt_ variable name passed to the SDK
  showNumber?: boolean; // Current Chapter only — append the "02/14" number status
  // Spacer / background extras:
  width?: number; // spacer: width as a PERCENTAGE of the player container width
  color?: string; // background only — fill hex, e.g. "#000000"
  opacity?: number; // background only — 0–1
  paddingX?: number; // background only — px the layer extends beyond the row left+right
  paddingY?: number; // background only — px the layer extends beyond the row top+bottom
  radius?: number; // background only — border-radius px (all corners)
  // Grid mode only: cells consumed on first drop, and the horizontal resize cap
  // (Number.POSITIVE_INFINITY = to the grid edge). Ignored by region/free modes.
  defaultSpan: number;
  maxSpan: number;
}

// Sizing/appearance defaults shared by the renderer, registry, and inspectors.
export const DEFAULT_ICON_SIZE = 20;
export const ICON_SIZE_MIN = 12;
export const ICON_SIZE_MAX = 48;

// Per-icon background: a shape rendered directly behind a single icon (e.g. a
// circle behind Play). Distinct from the "background" CONTROL element that
// snaps to a whole lane — this one hugs just its icon's box. Color/opacity come
// from the shared theme (theme.bgColor / bgOpacity); only shape is per-icon.
export interface IconBg {
  padding: number; // px around the icon, both axes (keeps the box square → circle)
  radius: number; // border-radius px, rendered as min(radius, 50%) so a high value = circle
}
export const DEFAULT_ICON_BG_PADDING = 6;
export const DEFAULT_ICON_BG_RADIUS = 24;
export const ICON_BG_PADDING_MAX = 24;
export const ICON_BG_RADIUS_MAX = 40;
// Spacer width is a PERCENTAGE of the player container's width, so a spacer keeps
// its proportion across viewports (and on any device the player renders at).
export const DEFAULT_SPACER_WIDTH = 4; // %
export const SPACER_WIDTH_MIN = 1; // %
export const SPACER_WIDTH_MAX = 90; // %
export const SPACER_WIDTH_STEP = 0.5; // % per slider/resize step
export const BG_WIDTH_MIN = 40;
export const DEFAULT_BG_COLOR = "#000000";
export const DEFAULT_BG_OPACITY = 0.5;
// A background hugs its lane's controls plus this much padding by default.
export const DEFAULT_BG_PADDING_X = 2; // left + right
export const DEFAULT_BG_PADDING_Y = 4; // top + bottom
export const BG_PADDING_MAX = 40;
export const DEFAULT_BG_RADIUS = 4;
export const BG_RADIUS_MAX = 24;
// Padding of the whole .Player container (global, both axes), user-adjustable.
// Also a PERCENTAGE: X of the container's width, Y of its height — so the inset
// scales with the player instead of eating a narrow bar at 300px wide.
export const DEFAULT_PLAYER_PADDING_X = 1.5; // % of container width
export const DEFAULT_PLAYER_PADDING_Y = 1; // % of container height
export const PLAYER_PADDING_MAX = 10; // %
export const PLAYER_PADDING_STEP = 0.5; // % per slider step

const INF = Number.POSITIVE_INFINITY;

export const BUILTINS: readonly ControlDef[] = [
  { id: "AirPlay", label: "AirPlay", icon: "airplay", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Backward", label: "Backward", icon: "fast_rewind", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "CaptionSearch", label: "CaptionSearch", icon: "manage_search", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Captions", label: "Captions", icon: "closed_caption", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Cast", label: "Cast", icon: "cast", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Chapters", label: "Chapters", icon: "playlist_play", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Forward", label: "Forward", icon: "fast_forward", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "FullScreen", label: "FullScreen", icon: "fullscreen", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Notification", label: "Notification", icon: "notifications", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "PictureInPicture", label: "PictureInPicture", icon: "picture_in_picture_alt", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "PlayNPause", label: "PlayNPause", icon: "play_arrow", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Quality", label: "Quality", icon: "high_quality", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "SaveVideoOffline", label: "SaveVideoOffline", icon: "download_for_offline", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Setting", label: "Setting", icon: "settings", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Speed", label: "Speed", icon: "speed", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  { id: "Volume", label: "Volume", icon: "volume_up", kind: "icon", defaultSpan: 1, maxSpan: 1 },
  // Slider — renders at flex width; region export flags it in the lane's `fill` list.
  { id: "VideoProgress", label: "VideoProgress", icon: "linear_scale", kind: "slider", defaultSpan: 5, maxSpan: INF },
] as const;

export const BUILTIN_BY_ID: ReadonlyMap<ControlId, ControlDef> = new Map(
  BUILTINS.map((c) => [c.id, c]),
);

// ---- Text controls ("+ Add text") ---------------------------------------
// Static description of each text flavour: its default label, the palette-chip
// glyph, and the sample string shown in the picker. `input` names the extra field
// the picker collects before the control can be added (none for most).
export interface TextTypeMeta {
  type: TextType;
  label: string;
  icon: IconName;
  preview: string; // sample text shown in the picker (and canvas for fixed types)
  input?: "separator" | "variable" | "switch"; // extra user input this flavour needs
}

export const DEFAULT_SEPARATOR = " / ";
// Current Chapter renders the chapter title (dynamic at runtime); the studio stands
// in with this placeholder, optionally trailed by the "02/14" number status.
export const CHAPTER_TEXT = "Chapter Name";
export const CHAPTER_NUMBER = "02/14";

export const TEXT_TYPES: readonly TextTypeMeta[] = [
  { type: "timeLeft", label: "Time Left", icon: "hourglass_bottom", preview: "00:00" },
  { type: "timeConsumed", label: "Time Consumed", icon: "schedule", preview: "00:00" },
  { type: "timeDuration", label: "Time Duration", icon: "timer", preview: "00:00" },
  { type: "timeAll", label: "Time All", icon: "av_timer", preview: "00:00 / 00:00", input: "separator" },
  { type: "currentChapter", label: "Current Chapter", icon: "playlist_play", preview: CHAPTER_TEXT, input: "switch" },
  { type: "dynamicText", label: "Dynamic Text", icon: "data_object", preview: "cdt_text", input: "variable" },
  { type: "title", label: "Title", icon: "title", preview: "Video Title" },
] as const;

export const TEXT_TYPE_BY_TYPE: ReadonlyMap<TextType, TextTypeMeta> = new Map(
  TEXT_TYPES.map((t) => [t.type, t]),
);

export function isTextType(v: unknown): v is TextType {
  return typeof v === "string" && TEXT_TYPE_BY_TYPE.has(v as TextType);
}

// The string a text control shows on the canvas. Time readouts are always 00:00
// (TimeAll joins two with its separator); Current Chapter is the chapter title, with
// the "02/14" number status appended only when showNumber is on; Dynamic Text stands
// in with its cdt_ variable name until the SDK fills it.
export function textOf(
  type: TextType,
  opts: { separator?: string; variable?: string; showNumber?: boolean } = {},
): string {
  switch (type) {
    case "timeAll":
      return `00:00${opts.separator ?? DEFAULT_SEPARATOR}00:00`;
    case "currentChapter":
      return opts.showNumber ? `${CHAPTER_TEXT} ${CHAPTER_NUMBER}` : CHAPTER_TEXT;
    case "dynamicText":
      return opts.variable || "cdt_text";
    default:
      return TEXT_TYPE_BY_TYPE.get(type)?.preview ?? "00:00";
  }
}
