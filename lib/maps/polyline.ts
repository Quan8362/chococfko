// ============================================================
// Encoded-polyline decoder (Map UX Phase 8). PURE/testable.
//
// Google Routes API returns route geometry as an encoded polyline (the standard
// Encoded Polyline Algorithm Format). We decode it to [lat,lng] pairs to draw the
// route on the Leaflet map. No dependency, never throws — malformed input yields
// the points decoded so far (empty for garbage).
// ============================================================

export type LatLngTuple = [number, number];

/** Decode an encoded polyline string into [lat,lng] pairs (precision default 5). */
export function decodePolyline(encoded: string | null | undefined, precision = 5): LatLngTuple[] {
  if (!encoded) return [];
  const factor = Math.pow(10, precision);
  const points: LatLngTuple[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = encoded.length;

  while (index < len) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0) return points; // malformed → stop gracefully
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < len);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0) return points;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < len);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / factor, lng / factor]);
  }
  return points;
}

/** Bounding box of a set of points (for fit-bounds without excessive zoom). */
export function polylineBounds(points: LatLngTuple[]): { north: number; south: number; east: number; west: number } | null {
  if (!points.length) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const [lat, lng] of points) {
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lng > east) east = lng;
    if (lng < west) west = lng;
  }
  return { north, south, east, west };
}
