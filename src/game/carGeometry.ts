import { CarConfig, CAR_MODELS } from './cars';

export function getCarPolygon(x: number, y: number, heading: number, configId: string = 'sport') {
  const config = CAR_MODELS[configId] || CAR_MODELS['sport'];
  const length = config.length;
  const width = config.width;
  
  const METERS_PER_DEGREE_LAT = 111320;
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(y * Math.PI / 180);

  // Convert heading to radians (0 = North)
  const angleRad = (90 - heading) * (Math.PI / 180);
  
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Helper to convert local (forward, left) distances to global [lng, lat]
  const localToGlobal = (forwardStart: number, leftStart: number) => {
    const lng = x + (cosA * forwardStart - sinA * leftStart) / metersPerDegreeLng;
    const lat = y + (sinA * forwardStart + cosA * leftStart) / METERS_PER_DEGREE_LAT;
    return [lng, lat];
  };

  // Helper to create a rectangular feature
  const createRect = (
    fCenter: number, lCenter: number,
    fLen: number, lWidth: number,
    height: number, base: number, color: string
  ) => {
    const hl = fLen / 2;
    const hw = lWidth / 2;
    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          localToGlobal(fCenter + hl, lCenter + hw), // FL
          localToGlobal(fCenter + hl, lCenter - hw), // FR
          localToGlobal(fCenter - hl, lCenter - hw), // BR
          localToGlobal(fCenter - hl, lCenter + hw), // BL
          localToGlobal(fCenter + hl, lCenter + hw)  // Close
        ]]
      },
      properties: { height, base, color }
    };
  };

  const features = [];
  const bodyColor = config.colors.body;
  const wheelColor = config.colors.wheel;
  const windowColor = config.colors.window;
  const roofColor = config.colors.roof;

  const isTruck = configId === 'heavy';
  const isOffroad = configId === 'offroad';

  if (isTruck) {
    // Cab
    features.push(createRect(length / 2 - 1.5, 0, 3.0, width, 2.5, 0.4, bodyColor));
    features.push(createRect(length / 2 - 1.5, 0, 2.8, width * 0.9, 2.6, 1.2, windowColor));
    features.push(createRect(length / 2 - 1.5, 0, 2.9, width * 0.95, 3.2, 2.6, roofColor));
    
    // Trailer / Bed
    features.push(createRect(-1.0, 0, length - 3.5, width, 1.8, 0.5, '#666666'));
  } else if (isOffroad) {
    // Body (raised for off-road)
    features.push(createRect(0, 0, length, width, 1.2, 0.5, bodyColor));
    // Windscreen
    const cabinWidth = width * 0.85;
    features.push(createRect(0.5, 0, 0.5, cabinWidth, 1.75, 1.2, windowColor));
    // Roof / Cabin
    features.push(createRect(-0.7, 0, 1.9, cabinWidth, 1.8, 1.3, roofColor));
    // Rear Window (optional off-road utility back)
    features.push(createRect(-1.7, 0, 0.1, cabinWidth, 1.7, 1.3, windowColor));
    // Front Bumper / off-road bar
    features.push(createRect(length / 2 + 0.1, 0, 0.3, width * 0.9, 0.7, 0.4, '#444'));
  } else {
    // Sport
    features.push(createRect(0, 0, length, width, 0.9, 0.15, bodyColor));
    // Cabin
    const cabinWidth = width * 0.8;
    features.push(createRect(-0.2, 0, length * 0.4, cabinWidth, 1.3, 0.9, roofColor));
    // Windscreen
    features.push(createRect(0.7, 0, 0.3, cabinWidth * 0.9, 1.25, 0.9, windowColor));
    // Rear Window
    features.push(createRect(-1.1, 0, 0.3, cabinWidth * 0.9, 1.25, 0.9, windowColor));
    // Spoiler
    features.push(createRect(-length / 2 + 0.2, 0, 0.3, width * 0.9, 1.2, 1.1, roofColor));
  }

  // Wheels
  const wheelOverhang = isTruck ? 0.1 : (isOffroad ? 0.3 : 0.05);
  const wheelL = width / 2 + wheelOverhang;
  const wheelF = length / 2 - (isTruck ? 1.0 : 0.7);
  const wheelB = -length / 2 + (isTruck ? 1.2 : 0.7);
  const wheelLen = isTruck ? 1.2 : (isOffroad ? 1.0 : 0.8);
  const wWidth = isTruck ? 0.6 : (isOffroad ? 0.5 : 0.35);
  const wheelH = isTruck ? 1.2 : (isOffroad ? 1.0 : 0.7);
  const wheelBase = isTruck ? 0.0 : (isOffroad ? 0.0 : 0.0);
  
  features.push(createRect(wheelF, wheelL, wheelLen, wWidth, wheelH, wheelBase, wheelColor));   // FL
  features.push(createRect(wheelF, -wheelL, wheelLen, wWidth, wheelH, wheelBase, wheelColor));  // FR
  features.push(createRect(wheelB, wheelL, wheelLen, wWidth, wheelH, wheelBase, wheelColor));  // BL
  features.push(createRect(wheelB, -wheelL, wheelLen, wWidth, wheelH, wheelBase, wheelColor)); // BR

  if (isTruck) {
    // extra wheels for truck
    const wheelB2 = wheelB - 1.4;
    features.push(createRect(wheelB2, wheelL, wheelLen, wWidth, wheelH, wheelBase, wheelColor));  // BBL
    features.push(createRect(wheelB2, -wheelL, wheelLen, wWidth, wheelH, wheelBase, wheelColor)); // BBR
  }

  return {
    type: 'FeatureCollection',
    features
  };
}
