// Standalone schema for the exported region-mode player spec — the document
// produced by buildRegionSpec (spec.ts) — as a single TS interface.
//
// There is ONE schema — this file. The document carries no version field:
// studio and renderers ship against this interface, so there is nothing to
// negotiate. Changing the shape here means updating the renderers with it.
//
// Layout lives under per-viewport entries
// (default | 490 | 300 | vertical); each viewport is regions (top | center |
// bottom) → rows → lane-keyed groups (start | center | end), empty lanes
// omitted. A lane group lists its `items` in order; `fill` repeats the ones
// that stretch (e.g. VideoProgress). Each viewport also carries its
// `collapseInSetting` icon list; theme is shared. The `controls` block declares
// EVERY control used in the document (custom → full definition, built-in → just
// its `icon`), so the document never leaves a glyph implied; it is omitted only
// when nothing is placed at all.

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
  layoutModel: "region";
  theme: {
    primary: string;
    secondary: string;
    iconSize: number; // global default; a control's `size` overrides it
    barHeight: number;
    gap: number;
    backgroundColor: string; // shared fill for ALL background layers
    backgroundOpacity: number; // 0–1, shared
    // Container padding as a PERCENTAGE of the player box, so it scales with the
    // player instead of being a fixed inset at every size.
    paddingX: number; // left+right, % of the container's WIDTH
    paddingY: number; // top+bottom, % of the container's HEIGHT
  };
  // One entry per control id used anywhere in the document. Built-ins carry
  // just `icon`; customs carry their full definition. Always present unless the
  // document places nothing.
  controls?: {
    [id: string]: {
      custom?: boolean;
      kind?: "icon" | "text" | "slider" | "spacer" | "background";
      label?: string;
      // REQUIRED. A Material icon name (the icon's own key, e.g. "play_arrow")
      // — the control's default glyph in every viewport. Emitted for built-ins
      // too: an id like "CaptionSearch" is a behavior contract key and does not
      // derive its glyph ("manage_search"), so stating it here is what lets a
      // renderer resolve the icon without shipping its own id→name table.
      // A viewport may override it per-viewport in styles[id].icon (below).
      icon: string;
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
      // Identity/geometry (viewport-agnostic). Per-icon size + background are NOT
      // here — they are per-VIEWPORT (see viewports[].styles below).
      width?: number; // spacer only — width as a % of the player container's WIDTH
      // Background layers snap to their lane's controls; color/opacity are the
      // shared theme.background* values (never per-control).
      // Omitted until the user edits the placed layer (addBackground sets no
      // padding/radius), so these fallbacks are load-bearing. They match what
      // the studio itself draws — see DEFAULT_BG_PADDING_X / _Y in controls.ts
      // and editor.ts:128.
      paddingX?: number; // background only — px the layer extends beyond its lane left+right (omitted = 2)
      paddingY?: number; // background only — px the layer extends beyond its lane top+bottom (omitted = 4)
      radius?: number; // background only — border-radius px, all corners (omitted = 4)
    };
  };
  viewports: Record<
    "default" | "490" | "300" | "vertical",
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
      // Per-VIEWPORT icon appearance overrides, keyed by control id — so the same
      // built-in icon can differ across viewports. Omitted when none in this
      // viewport. Background color/opacity are the shared theme.background* values.
      styles?: Record<
        string,
        {
          size?: number; // per-control icon size (px), overrides theme.iconSize
          // RESERVED — per-viewport glyph override, same relationship `size` has
          // to theme.iconSize: when present it wins over controls[id].icon for
          // THIS viewport only (e.g. a simpler glyph on a 300px bar). The studio
          // does not write it yet (registry.setIcon is global). Renderers should
          // honour it regardless: a shipped mobile SDK lives on user devices for
          // months, so the `??` has to already be out there before the studio can
          // start authoring it.
          icon?: string;
          background?: {
            padding: number; // px around the icon (both axes)
            radius: number; // border-radius px; ≥ half the box renders a full circle
          };
        }
      >;
    }
  >;
}
