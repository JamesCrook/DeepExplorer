import * as THREE from 'three';

export class Spherical {
  /**
   * Converts a latitude and longitude to a THREE.Vector3 point on a sphere.
   * Uses a Y-up convention matching standard equirectangular earth textures.
   *
   * @param {number} lat - Latitude in degrees (-90 to 90).
   * @param {number} lon - Longitude in degrees (-180 to 180).
   * @param {number} radius - Radius of the sphere.
   * @returns {THREE.Vector3}
   */
  static latLonToPoint(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    return new THREE.Vector3(x, y, z);
  }

  /**
   * Converts a THREE.Vector3 point on a sphere back to latitude and longitude.
   *
   * @param {THREE.Vector3} vec3 - The point on the sphere.
   * @param {number} radius - The radius of the sphere (unused, length of vec3 is used instead or implicit).
   * @returns {{ lat: number, lon: number }} Object containing lat and lon in degrees.
   */
  static pointToLatLon(vec3, radius) {
    const normalized = vec3.clone().normalize();
    const phi = Math.acos(normalized.y);
    const theta = Math.atan2(normalized.z, -normalized.x);

    const lat = 90 - (phi * 180) / Math.PI;
    let lon = (theta * 180) / Math.PI - 180;

    // Normalize longitude to be between -180 and 180
    while (lon < -180) lon += 360;
    while (lon > 180) lon -= 360;

    return { lat, lon };
  }

  /**
   * Generates an array of THREE.Vector3 points representing the shortest
   * great circle path between two lat/lon coordinates.
   *
   * @param {number} lat1 - Starting latitude in degrees.
   * @param {number} lon1 - Starting longitude in degrees.
   * @param {number} lat2 - Ending latitude in degrees.
   * @param {number} lon2 - Ending longitude in degrees.
   * @param {number} radius - Radius of the sphere.
   * @param {number} numPoints - Number of points to generate along the arc.
   * @returns {THREE.Vector3[]} Array of points tracing the great circle arc.
   */
  static greatCircleArc(lat1, lon1, lat2, lon2, radius, numPoints) {
    const startPoint = Spherical.latLonToPoint(lat1, lon1, radius);
    const endPoint = Spherical.latLonToPoint(lat2, lon2, radius);

    const startQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), startPoint.clone().normalize());
    const endQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), endPoint.clone().normalize());

    const points = [];
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const q = new THREE.Quaternion().slerpQuaternions(startQuat, endQuat, t);
      const point = new THREE.Vector3(0, radius, 0).applyQuaternion(q);
      points.push(point);
    }

    return points;
  }
}
