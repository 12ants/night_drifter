export interface CarState {
  x: number; // longitude
  y: number; // latitude
  heading: number; // angle in degrees, 0 is North, clockwise
  speed: number;
  steeringAngle: number;
}

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

const METERS_PER_DEGREE_LAT = 111320;

export class CarPhysics {
  state: CarState;
  
  // Physics constants
  maxSpeed = 40; // m/s (approx 144 km/h)
  acceleration = 10; // m/s^2
  braking = 20; // m/s^2
  friction = 2; // m/s^2 (rolling resistance)
  turnSpeed = 60; // degrees/s at optimal speed
  
  constructor(initialState: CarState) {
    this.state = { ...initialState };
  }

  update(input: InputState, dt: number) { // dt in seconds
    // Acceleration / Braking
    if (input.forward) {
      this.state.speed += this.acceleration * dt;
    } else if (input.backward) {
      this.state.speed -= this.braking * dt;
    } else {
      // Apply friction
      if (this.state.speed > 0) {
        this.state.speed -= this.friction * dt;
        if (this.state.speed < 0) this.state.speed = 0;
      } else if (this.state.speed < 0) {
        this.state.speed += this.friction * dt;
        if (this.state.speed > 0) this.state.speed = 0;
      }
    }

    // Handbrake
    if (input.handbrake) {
      if (this.state.speed > 0) this.state.speed = Math.max(0, this.state.speed - this.braking * 1.5 * dt);
      if (this.state.speed < 0) this.state.speed = Math.min(0, this.state.speed + this.braking * 1.5 * dt);
    }

    // Clamp speed
    if (this.state.speed > this.maxSpeed) this.state.speed = this.maxSpeed;
    if (this.state.speed < -this.maxSpeed / 2) this.state.speed = -this.maxSpeed / 2;

    // Steering
    // Turn radius is tighter at low speeds, wider at high speeds
    // But for arcade feel, just a simple rotation when moving
    let turnFactor = this.state.speed / (this.maxSpeed * 0.5); // optimal turning at half max speed
    if (turnFactor > 1) turnFactor = 1 - (turnFactor - 1) * 0.5; // less steering at very high speeds
    if (this.state.speed < 0) turnFactor = -this.state.speed / (this.maxSpeed * 0.5); // reverse steering logic

    // Basic arcade turning
    let turnAmount = 0;
    if (Math.abs(this.state.speed) > 0.5) {
      turnAmount = this.turnSpeed * dt;
      if (input.left) {
        this.state.heading -= turnAmount;
      }
      if (input.right) {
        this.state.heading += turnAmount;
      }
    }
    
    // Normalize heading to 0-360
    this.state.heading = (this.state.heading + 360) % 360;

    // Movement
    if (this.state.speed !== 0) {
      const distance = this.state.speed * dt; // meters
      
      // Convert heading to radians for math (0 is North)
      // Math.sin/cos expect 0 to be East, counter-clockwise.
      // So North is 90 degrees.
      const angleRad = (90 - this.state.heading) * (Math.PI / 180);
      
      const dxMeters = Math.cos(angleRad) * distance;
      const dyMeters = Math.sin(angleRad) * distance;
      
      const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(this.state.y * Math.PI / 180);
      
      this.state.x += dxMeters / metersPerDegreeLng;
      this.state.y += dyMeters / METERS_PER_DEGREE_LAT;
    }
  }
}
