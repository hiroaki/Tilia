export class Layer {
  constructor(point, options = {}) { this.point = point; this.options = options; this.listeners = new globalThis.Map(); }
  addTo(map) { this.map = map; map.layers.add(this); return this; }
  remove() { this.map?.layers.delete(this); this.fire("remove"); }
  on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return this; }
  off(type, fn) { this.listeners.get(type)?.delete(fn); return this; }
  fire(type, event = {}) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event); }
}
export class Popup extends Layer { setLatLng(point) { this.point = point; return this; } setContent(content) { this.content = content; return this; } getElement() { return this.content; } }
export class Control { constructor(options) { this.options = options; } addTo(map) { this.container = this.onAdd(map); map.container.appendChild(this.container); return this; } remove() { this.container?.remove(); } }
export class DivIcon { constructor(options) { this.options = options; } createIcon() { return document.createElement("div"); } }
export const Marker = Layer, CircleMarker = Layer, Polyline = Layer, TileLayer = Layer, Map = class {};
export const DomUtil = { create: (tag, className) => { const node = document.createElement(tag); node.className = className; return node; } };
export const DomEvent = { disableClickPropagation() {}, disableScrollPropagation() {}, on() {}, stopPropagation() {}, preventDefault() {} };
