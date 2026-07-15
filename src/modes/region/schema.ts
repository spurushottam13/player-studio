// Standalone schema for the exported region-mode player spec — the
// schemaVersion 3.0 document produced by buildRegionSpec (spec.ts) — as a
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
  schemaVersion: "3.0";
  layoutModel: "region";
  theme: {
    primary: string;
    secondary: string;
    iconSize: number;
    barHeight: number;
    gap: number;
  };
  controls?: {
    [id: string]: {
      custom?: boolean;
      kind?: "icon" | "text" | "slider";
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
