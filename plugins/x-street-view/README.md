# x-street-view

A Tilia plugin for opening a selected location on the map in Google Street View.

The plugin generates a Street View link for the selected coordinates, using the direction of map dragging to determine the initial viewing direction.

## Installation

```js
createDefaultTiliaApp("map", {
  plugins: ["x-street-view"],
});
```

To add the plugin to an existing application:

```js
await app.use("x-street-view");
```

## Usage

1. Click anywhere on the map to select a location. A "Street View" button will appear beside the selected location.
2. Drag the map to set the viewing direction. An arrow extending from the selected location indicates the current direction, with the button just beyond its tip. The button stays horizontal.
3. Click the "Street View" button to open Google Street View in a new tab or window.

The selected location remains fixed when you pan or zoom the map, and the button follows it. The button may be clipped when it reaches the map edge. Click the map again to clear the selection, then click once more to select a different location.

The viewing direction is based on **the movement of the map center**, rather than the direction of the drag gesture. For example, dragging the map to the right sets the viewing direction to west.

The initial viewing direction is north (0°). Drag the map to change it.

The viewing direction is estimated from the drag gesture and may not always match your intended direction. The actual location and direction displayed in Street View also depend on Google's handling of the request.

## Related Links

- [leaflet-pan-direction](https://github.com/hiroaki/leaflet-pan-direction) — A Leaflet plugin used to detect map dragging direction
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#street-view-action) — URL specification for opening Street View
