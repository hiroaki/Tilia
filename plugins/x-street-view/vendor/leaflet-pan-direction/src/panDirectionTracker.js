import { calculateRecentDistanceHeading } from "./headingAlgorithms.js";

const DEFAULT_DISTANCE_WINDOW = 40;

/**
 * Tracks the geographic direction of the most recent user drag-pan.
 *
 * The tracker samples the map-center trajectory during each drag gesture.
 * The default heading represents the final 40 projected pixels of movement.
 */
export class PanDirectionTracker {
  constructor(map) {
    if (!map) {
      throw new TypeError("PanDirectionTracker requires a Leaflet map");
    }

    this._map = map;
    this._enabled = false;
    this._gestureSamples = null;
    this._lastGestureSamples = null;
    this._lastHeading = null;

    this._onDragStart = this._onDragStart.bind(this);
    this._onDrag = this._onDrag.bind(this);
    this._onDragEnd = this._onDragEnd.bind(this);
  }

  /**
   * Starts observing user drag-pan gestures.
   *
   * @returns {this}
   */
  enable() {
    if (this._enabled) {
      return this;
    }

    this._map.on("dragstart", this._onDragStart);
    this._map.on("drag", this._onDrag);
    this._map.on("dragend", this._onDragEnd);

    this._enabled = true;

    return this;
  }

  /**
   * Stops observing user drag-pan gestures.
   *
   * The most recently recorded gesture and heading are retained.
   * An in-progress gesture is discarded.
   *
   * @returns {this}
   */
  disable() {
    if (!this._enabled) {
      return this;
    }

    this._map.off("dragstart", this._onDragStart);
    this._map.off("drag", this._onDrag);
    this._map.off("dragend", this._onDragEnd);

    this._gestureSamples = null;
    this._enabled = false;

    return this;
  }

  /**
   * Returns the heading of the most recent valid user drag-pan.
   *
   * @returns {number|null}
   */
  getLastHeading() {
    return this._lastHeading;
  }

  /**
   * Clears all recorded gesture and heading state.
   *
   * An in-progress gesture is also discarded.
   *
   * @returns {this}
   */
  reset() {
    this._gestureSamples = null;
    this._lastGestureSamples = null;
    this._lastHeading = null;

    return this;
  }

  _onDragStart() {
    this._gestureSamples = [
      this._createSample(),
    ];
  }

  _onDrag() {
    if (this._gestureSamples === null) {
      return;
    }

    this._gestureSamples.push(
      this._createSample(),
    );
  }

  _onDragEnd() {
    if (this._gestureSamples === null) {
      return;
    }

    this._gestureSamples.push(
      this._createSample(),
    );

    const samples = this._gestureSamples;

    this._gestureSamples = null;

    const heading =
      calculateRecentDistanceHeading(
        samples,
        DEFAULT_DISTANCE_WINDOW,
      );

    /*
     * An insignificant gesture must not replace the previous valid
     * gesture or heading.
     */
    if (heading === null) {
      return;
    }

    this._lastGestureSamples = samples;
    this._lastHeading = heading;
  }

  _createSample() {
    const center = this._map.getCenter();
    const zoom = this._map.getZoom();
    const point = this._map.project(center, zoom);

    return {
      latlng: {
        lat: center.lat,
        lng: center.lng,
      },
      point: {
        x: point.x,
        y: point.y,
      },
      time: performance.now(),
    };
  }
}
