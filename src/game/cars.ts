export interface CarConfig {
  id: string;
  name: string;
  engineForce: number;
  brakingForce: number;
  airDrag: number;
  rollingResistance: number;
  turnSpeed: number;
  lateralGrip: number;
  driftGrip: number;
  length: number;
  width: number;
  colors: {
    body: string;
    wheel: string;
    window: string;
    roof: string;
  };
}

export const CAR_MODELS: Record<string, CarConfig> = {
  'sport': {
    id: 'sport',
    name: 'Drift Sport',
    engineForce: 25,
    brakingForce: 45,
    airDrag: 0.012,
    rollingResistance: 1.5,
    turnSpeed: 140,
    lateralGrip: 6.0,
    driftGrip: 1.2,
    length: 4.4,
    width: 1.9,
    colors: {
      body: '#00e5ff',
      wheel: '#1a1a1a',
      window: '#111111',
      roof: '#00aacc'
    }
  },
  'offroad': {
    id: 'offroad',
    name: 'Off-Road 4x4',
    engineForce: 18,
    brakingForce: 35,
    airDrag: 0.025,
    rollingResistance: 2.5,
    turnSpeed: 100,
    lateralGrip: 9.0,
    driftGrip: 4.0,
    length: 4.8,
    width: 2.2,
    colors: {
      body: '#ff3366',
      wheel: '#1a1a1a',
      window: '#00e5ff',
      roof: '#333333'
    }
  },
  'heavy': {
    id: 'heavy',
    name: 'Heavy Truck',
    engineForce: 12,
    brakingForce: 25,
    airDrag: 0.04,
    rollingResistance: 3.5,
    turnSpeed: 70,
    lateralGrip: 7.0,
    driftGrip: 3.0,
    length: 7.5,
    width: 2.6,
    colors: {
      body: '#ffcc00',
      wheel: '#222222',
      window: '#333333',
      roof: '#ddaa00'
    }
  }
};
