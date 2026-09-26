import { cloneGpxSource } from "../../src/gpx/source.js";

function clonePoint(point) {
  return {
    id: point.id,
    lat: point.lat,
    lon: point.lon,
    elevation: point.elevation,
    timestamp: point.timestamp,
  };
}

function cloneSegment(segment) {
  return {
    id: segment.id,
    points: segment.points.map(clonePoint),
  };
}

function cloneTrack(track) {
  return {
    id: track.id,
    originalTrackIndex: track.originalTrackIndex,
    name: track.name,
    segments: track.segments.map(cloneSegment),
  };
}

function createIdFactory() {
  let nextId = 1;
  return (kind) => `${kind}-${nextId++}`;
}

export function createDraftDocument(source) {
  const clonedSource = cloneGpxSource(source);
  const createId = createIdFactory();
  return {
    name: clonedSource.name,
    tracks: clonedSource.tracks.map((track, originalTrackIndex) => ({
      id: createId("track"),
      originalTrackIndex,
      name: track.name,
      segments: track.segments.map((segment) => ({
        id: createId("segment"),
        points: segment.points.map((point) => ({
          id: createId("point"),
          lat: point.lat,
          lon: point.lon,
          elevation: point.elevation,
          timestamp: point.timestamp,
        })),
      })),
    })),
    createId,
  };
}

export function findDraftTrack(draft, trackId) {
  return draft?.tracks.find((track) => track.id === trackId) || null;
}

export function findDraftSegment(draft, trackId, segmentId) {
  return findDraftTrack(draft, trackId)?.segments.find((segment) => segment.id === segmentId) || null;
}

export function findDraftPoint(draft, trackId, segmentId, pointId) {
  return findDraftSegment(draft, trackId, segmentId)?.points.find((point) => point.id === pointId) || null;
}

export function createInsertedDraftPoint(draft, latlng) {
  return {
    id: draft.createId("point"),
    lat: Number(latlng.lat),
    lon: Number(latlng.lng),
    elevation: null,
    timestamp: null,
  };
}

export function toDraftCoordinates(segment) {
  return (segment?.points || []).map((point) => [point.lat, point.lon]);
}

export function toGpxSource(draft, name = draft?.name || "track.gpx") {
  return {
    type: "gpx",
    name,
    tracks: (draft?.tracks || []).map((track) => ({
      ...(track.name === undefined ? {} : { name: track.name }),
      segments: track.segments.map((segment) => ({
        points: segment.points.map(({ lat, lon, elevation, timestamp }) => ({ lat, lon, elevation, timestamp })),
      })),
    })),
    waypoints: [],
  };
}

export function cloneDraftTrack(track) {
  return cloneTrack(track);
}

export function cloneDraftSegment(segment) {
  return cloneSegment(segment);
}

export function cloneDraftPoint(point) {
  return clonePoint(point);
}
