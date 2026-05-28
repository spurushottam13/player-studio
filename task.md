## **Objective:**

Implement a drag-and-drop "Player Studio" where users can design a custom video player interface by arranging controls within a grid-based container.

**1. Core Layout and Structure**
The primary workspace is a standard HTML container element (e.g., a `<div>`) with the class `.Player`. It uses a specific CSS Grid layout to define the available drop zones (cells) for the player components. All controls will be injected into a flat DOM tree as direct children of this `.Player` container.

```css
.Player {
  height: 400px;
  width: 600px;
  position: absolute;
  display: grid;
  opacity: 0;
  padding: 10px;
  /* 13 columns, 5 rows defining the drop zones */
  grid-template-columns: 35px 35px 35px 105px auto 35px 35px 35px 35px 35px 35px 35px 35px;
  grid-template-rows: 40px auto 25px 25px 25px;
}

.Player.SHOW-CONTROLS {
  opacity: 1;
}
```

**2. Available Controls**
Each draggable control corresponds to a specific CSS class name (the `gridIdentifier`). The UI should allow the user to select from the following 21 controls:

| #   | gridIdentifier     | Control Name     |
| --- | ------------------ | ---------------- |
| 1   | `AirPlay`          | AirPlay          |
| 2   | `Backward`         | Backward         |
| 3   | `CaptionSearch`    | CaptionSearch    |
| 4   | `Captions`         | Captions         |
| 5   | `Cast`             | Cast             |
| 6   | `Chapters`         | Chapters         |
| 7   | `Forward`          | Forward          |
| 8   | `FullScreen`       | FullScreen       |
| 9   | `Notification`     | Notification     |
| 10  | `PictureInPicture` | PictureInPicture |
| 11  | `PlayNPause`       | PlayNPause       |
| 12  | `Quality`          | Quality          |
| 13  | `SaveVideoOffline` | SaveVideoOffline |
| 14  | `Setting`          | Setting          |
| 15  | `Speed`            | Speed            |
| 16  | `TimeConsumed`     | TimeConsumed     |
| 17  | `TimeLeft`         | TimeLeft         |
| 18  | `TimeDuration`     | TimeDuration     |
| 19  | `TimeAll`          | TimeAll          |
| 20  | `VideoProgress`    | VideoProgress    |
| 21  | `Volume`           | Volume           |

_Iconography Note:_ Use **Lucide Icons** to represent each of these controls.

**3. Drag-and-Drop Implementation Logic**
When a user drags an icon from the available controls and drops it into a cell within the `.Player` container, the application must handle the positioning dynamically:

- **Dynamic Grid Area:** Map the drop zone's grid position (row/column) to the control's `grid-area` property. For example, if the user drops the "AirPlay" icon into row 1, column 12, the `.AirPlay` class should receive `grid-area: 1 / 12 / auto / auto;`.
- **Alignment/Snapping:** Ensure the control sits cleanly inside its assigned grid cell. You can use any valid CSS method (like `display: flex; justify-content: center; align-items: center;`, CSS positioning, or grid alignment properties) to center and snap the icon appropriately.
- **Visibility State:** If a user does not select a specific control to place in the player area, that control's class must default to `display: none;`.

**Example Generated CSS:**

```css
/* Visible Area defined by user drop */
.Player .Player-Visible-Component-Area {
  grid-area: 1 / 1 / 4 / -1;
  margin-inline: -10px;
  margin-top: -10px;
  position: relative;
}

/* Hidden Area */
.Player .Player-Hidden-Component-Area {
  grid-area: 1 / 1 / -1 / -1;
}

/* Dynamically positioned controls based on drop coordinates */
.SaveVideoOffline {
  grid-area: 5 / 12 / auto / auto;
}

.PictureInPicture {
  grid-area: 1 / 11 / auto / auto;
  position: relative;
  align-self: center; /* Example of standard CSS alignment */
}
```
