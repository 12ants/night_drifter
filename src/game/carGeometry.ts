export function getCarPolygon(x: number, y: number, heading: number, length: number = 4.5, width: number = 1.8) {
  const METERS_PER_DEGREE_LAT = 111320;
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(y * Math.PI / 180);

  // Convert heading to radians (0 = North)
  const angleRad = (90 - heading) * (Math.PI / 180);
  
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Car center is x, y
  // Forward means +cosA, +sinA in local coordinates?
  // Actually, if heading 0 = North:
  // forward vector: (dx = 0, dy = 1) -> which is cos(90), sin(90)
  
  // Half dimensions
  const hl = length / 2;
  const hw = width / 2;

  // 4 corners in meters relative to center
  // Front left
  const flX = cosA * hl - sinA * hw;
  const flY = sinA * hl + cosA * hw;
  
  // Front right
  const frX = cosA * hl - sinA * (-hw);
  const frY = sinA * hl + cosA * (-hw);

  // Back right
  const brX = cosA * (-hl) - sinA * (-hw);
  const brY = sinA * (-hl) + cosA * (-hw);

  // Back left
  const blX = cosA * (-hl) - sinA * hw;
  const blY = sinA * (-hl) + cosA * hw;

  // Convert to degrees
  const coords = [
    [x + flX / metersPerDegreeLng, y + flY / METERS_PER_DEGREE_LAT],
    [x + frX / metersPerDegreeLng, y + frY / METERS_PER_DEGREE_LAT],
    [x + brX / metersPerDegreeLng, y + brY / METERS_PER_DEGREE_LAT],
    [x + blX / metersPerDegreeLng, y + blY / METERS_PER_DEGREE_LAT],
    [x + flX / metersPerDegreeLng, y + flY / METERS_PER_DEGREE_LAT] // Close polygon
  ];

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    },
    properties: {
      height: 1.5,
      base: 0.1, // slightly off ground
      color: '#ff3366'
    }
  };
}
