## Player Studio Implementation

This guide outlines the structure and implementation logic for the drag-and-drop Player Studio, where users can arrange player controls within a grid-based container.

---

### 1. Grid Container Setup

The player container uses a specific CSS Grid layout to define the available drop zones for the components.

```css
.Player {
  height: 400px;
  width: 600px;
  position: absolute;
  display: grid;
  opacity: 0;
  padding: 10px;
  grid-template-columns: 35px 35px 35px 105px auto 35px 35px 35px 35px 35px 35px 35px 35px;
  grid-template-rows: 40px auto 25px 25px 25px;
}

.Player.SHOW-CONTROLS {
  opacity: 1;
}
```

---

### 2. Available Controls

Each draggable control corresponds to a specific CSS class name (the `gridIdentifier`) used to define its position in the grid.

| #   | Grid Identifier     | Control Name     |
| --- | ------------------- | ---------------- |
| 1   | `.AirPlay`          | AirPlay          |
| 2   | `.Backward`         | Backward         |
| 3   | `.CaptionSearch`    | CaptionSearch    |
| 4   | `.Captions`         | Captions         |
| 5   | `.Cast`             | Cast             |
| 6   | `.Chapters`         | Chapters         |
| 7   | `.Forward`          | Forward          |
| 8   | `.FullScreen`       | FullScreen       |
| 9   | `.Notification`     | Notification     |
| 10  | `.PictureInPicture` | PictureInPicture |
| 11  | `.PlayNPause`       | PlayNPause       |
| 12  | `.Quality`          | Quality          |
| 13  | `.SaveVideoOffline` | SaveVideoOffline |
| 14  | `.Setting`          | Setting          |
| 15  | `.Speed`            | Speed            |
| 16  | `.TimeConsumed`     | TimeConsumed     |
| 17  | `.TimeLeft`         | TimeLeft         |
| 18  | `.TimeDuration`     | TimeDuration     |
| 19  | `.TimeAll`          | TimeAll          |
| 20  | `.VideoProgress`    | VideoProgress    |
| 21  | `.Volume`           | Volume           |

---

### 3. Implementation Logic: CSS Generation

When a user drags and drops a control, you must map the grid position (row/column) to the `grid-area` property.

**Example Component Styles:**

```css
/* Base Container Styles */
.Component-Container {
  display: block;
  height: 100%;
  width: 100%;
}

.Player .Player-Visible-Component-Area {
  grid-area: 1 / 1 / 4 / -1;
  margin-inline: -10px;
  margin-top: -10px;
  position: relative;
}

.Player .Player-Hidden-Component-Area {
  grid-area: 1 / 1 / -1 / -1;
}

/* Example Positioned Controls */
.SaveVideoOffline {
  grid-area: 5 / 12 / auto / auto;
}

.PictureInPicture {
  grid-area: 1 / 11 / auto / auto;
  position: relative;
  align-self: center;
}

.Cast {
  grid-area: 1 / 13 / auto / auto;
}

.AirPlay {
  grid-area: 1 / 12 / auto / auto;
  display: flex;
  justify-content: center;
  align-items: center;
}
```

explation of sample css:

- `.Player` is container element which will host the all child controls element into flat dom tree, with grid-area defined under this class
- controls with grid-identifer, which will have this class like .Airplay for airplay controls will have the class the .AirPlay and grid-area of where user have dropped the icon
- have used display flex & justify-content and align-items to center the controls.

- so UI will allow to choose the controls from avaiable controls and drag them into the .Player area within cell lock. once dragging is done, it will have that grid-area in .Player container
- you can use lucid-icon for each controls
- if user does not select the controls then it will have display: none
