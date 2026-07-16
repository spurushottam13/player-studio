// Standalone schema for the exported region-mode player spec — the
// schemaVersion 3.1 document produced by buildRegionSpec (spec.ts) — as a
// single TS interface. Layout lives under per-viewport entries
// (default | 490 | 300 | 200); each viewport is regions (top | center |
// bottom) → rows → lane-keyed groups (start | center | end), empty lanes
// omitted. A lane group lists its `items` in order; `fill` repeats the ones
// that stretch (e.g. VideoProgress). Each viewport also carries its
// `collapseInSetting` icon list; theme is shared. The `controls` block
// declares custom / overridden controls a renderer can't resolve on its own
// (custom → full definition, overridden built-in → just the replacement
// glyph), and is omitted when empty.

// The 17 built-in contract ids (see controls.ts BUILTINS) plus the seeded
// default-bar time readout (registry.DEFAULT_TIME_CONTROL_ID). Other
// user-added custom controls use CUSTOM_* ids outside this enum. Declared as a
// const object + derived type (used exactly like a string enum) because this
// project's tsconfig enables `erasableSyntaxOnly`, which forbids real enums.
export const ControlId = {
  AirPlay: "AirPlay",
  Backward: "Backward",
  CaptionSearch: "CaptionSearch",
  Captions: "Captions",
  Cast: "Cast",
  Chapters: "Chapters",
  Forward: "Forward",
  FullScreen: "FullScreen",
  Notification: "Notification",
  PictureInPicture: "PictureInPicture",
  PlayNPause: "PlayNPause",
  Quality: "Quality",
  SaveVideoOffline: "SaveVideoOffline",
  Setting: "Setting",
  Speed: "Speed",
  VideoProgress: "VideoProgress",
  Volume: "Volume",
  TimeConsumed: "CUSTOM_time_consumed",
} as const;
export type ControlId = (typeof ControlId)[keyof typeof ControlId];

export interface Layouts {
  schemaVersion: "3.1";
  layoutModel: "region";
  theme: {
    primary: string;
    secondary: string;
    iconSize: number; // global default; a control's `size` overrides it
    barHeight: number;
    gap: number;
    backgroundColor: string; // shared fill for ALL background layers
    backgroundOpacity: number; // 0–1, shared
    paddingX: number; // .Player container padding, left+right (px)
    paddingY: number; // .Player container padding, top+bottom (px)
  };
  controls?: {
    [id: string]: {
      custom?: boolean;
      kind?: "icon" | "text" | "slider" | "spacer" | "background";
      label?: string;
      icon: string; // a Lucide icon name
      // Text-control extras:
      textType?:
        | "timeLeft"
        | "timeConsumed"
        | "timeDuration"
        | "timeAll"
        | "currentChapter"
        | "dynamicText"
        | "title";
      separator?: string; // timeAll only
      variable?: string; // dynamicText only — the cdt_ variable name
      showNumber?: boolean; // currentChapter only
      // 3.1 extras:
      size?: number; // icon only — per-control size (px), overrides theme.iconSize
      width?: number; // spacer only — px width
      // Background layers snap to their lane's controls; color/opacity are the
      // shared theme.background* values (never per-control).
      paddingX?: number; // background only — px the layer extends beyond its lane left+right (omitted = 10)
      paddingY?: number; // background only — px the layer extends beyond its lane top+bottom (omitted = 10)
      radius?: number; // background only — border-radius px, all corners (omitted = 4)
      // icon only — a shape drawn directly BEHIND this one icon (e.g. a circle
      // behind Play). Color/opacity are the shared theme.background* values.
      background?: {
        padding: number; // px around the icon (both axes)
        radius: number; // border-radius px; a value ≥ half the box renders a full circle
      };
    };
  };
  viewports: Record<
    "default" | "490" | "300" | "200",
    {
      regions: Record<
        "top" | "center" | "bottom",
        Array<
          Partial<
            Record<
              "start" | "center" | "end",
              { items: ControlId[]; fill?: ControlId[] }
            >
          >
        >
      >;
      collapseInSetting: ControlId[];
    }
  >;
}
