export interface CarState {
  x: number; // longitude
  y: number; // latitude
  heading: number; // angle in degrees, 0 is North, clockwise
  velocityX: number; // East in m/s
  velocityY: number; // North in m/s
  angularVelocity: number;
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
  engineForce = 15; // m/s^2 acceleration (higher for more punch)
  brakingForce = 35; // m/s^2 braking
  airDrag = 0.01; // resistance at high speeds
  rollingResistance = 2.0; // constant friction
  turnSpeed = 120; // max degrees/s rotation torque
  
  // Grip settings
  lateralGrip = 8.0; // lateral friction coefficient
  driftGrip = 1.0; // friction when drifting (handbrake)

  constructor(initialState: Partial<CarState>) {
    this.state = {
      x: initialState.x || 0,
      y: initialState.y || 0,
      heading: initialState.heading || 0,
      velocityX: initialState.velocityX || 0,
      velocityY: initialState.velocityY || 0,
      angularVelocity: initialState.angularVelocity || 0,
    };
  }

  update(input: InputState, dt: number, checkEnvironment?: (x: number, y: number, heading: number) => { collide: boolean, water: boolean }) {
    if (dt > 0.1) dt = 0.1; // clamp dt to prevent physics explosions on lag spikes

    // Convert heading to radians (0 is North)
    const angleRad = (90 - this.state.heading) * (Math.PI / 180);
    const forwardX = Math.cos(angleRad);
    const forwardY = Math.sin(angleRad);
    const rightX = Math.cos(angleRad - Math.PI / 2);
    const rightY = Math.sin(angleRad - Math.PI / 2);

    // Project current velocity onto local axes
    let forwardSpeed = this.state.velocityX * forwardX + this.state.velocityY * forwardY;
    let lateralSpeed = this.state.velocityX * rightX + this.state.velocityY * rightY;

    // Apply engine / brakes
    let longitudinalForce = 0;
    if (input.forward) {
      longitudinalForce += this.engineForce;
    } 
    if (input.backward) {
      // If moving forward, brake. If stopped/reverse, reverse.
      if (forwardSpeed > 1) {
        longitudinalForce -= this.brakingForce;
      } else {
        longitudinalForce -= this.engineForce * 0.5; // reverse is slower
      }
    }

    // Apply drag and rolling resistance
    if (Math.abs(forwardSpeed) > 0.1) {
      longitudinalForce -= Math.sign(forwardSpeed) * this.rollingResistance;
      longitudinalForce -= forwardSpeed * Math.abs(forwardSpeed) * this.airDrag;
    } else if (!input.forward && !input.backward) {
      forwardSpeed = 0; // complete stop
    }

    // Apply lateral grip (friction)
    let currentGrip = input.handbrake ? this.driftGrip : this.lateralGrip;
    let lateralForce = -lateralSpeed * currentGrip;
    
    // If handbraking while moving forward, lose a lot of speed to friction
    if (input.handbrake && forwardSpeed > 1) {
       longitudinalForce -= this.brakingForce * 0.8;
       // Increase turn speed aggressively during drift for arcade feel
       this.turnSpeed = 160; 
    } else {
       this.turnSpeed = 90;
    }

    // Update local velocities
    forwardSpeed += longitudinalForce * dt;
    lateralSpeed += lateralForce * dt;

    // Steering torque
    let targetAngularVelocity = 0;
    if (Math.abs(forwardSpeed) > 1.0) {
      // Turning is stronger when moving
      let turnAmount = input.left ? -1 : input.right ? 1 : 0;
      // Reverse steering logic when reversing
      if (forwardSpeed < 0) turnAmount *= -1;
      
      targetAngularVelocity = turnAmount * this.turnSpeed;
    }
    
    // Smooth angular velocity for weight transfer feel
    this.state.angularVelocity += (targetAngularVelocity - this.state.angularVelocity) * 10 * dt;
    this.state.heading += this.state.angularVelocity * dt;
    this.state.heading = (this.state.heading + 360) % 360;

    // Convert back to global velocities
    const newAngleRad = (90 - this.state.heading) * (Math.PI / 180);
    const newForwardX = Math.cos(newAngleRad);
    const newForwardY = Math.sin(newAngleRad);
    const newRightX = Math.cos(newAngleRad - Math.PI / 2);
    const newRightY = Math.sin(newAngleRad - Math.PI / 2);

    this.state.velocityX = forwardSpeed * newForwardX + lateralSpeed * newRightX;
    this.state.velocityY = forwardSpeed * newForwardY + lateralSpeed * newRightY;

    // Move
    const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(this.state.y * Math.PI / 180);
    
    const nextX = this.state.x + (this.state.velocityX * dt) / metersPerDegreeLng;
    const nextY = this.state.y + (this.state.velocityY * dt) / METERS_PER_DEGREE_LAT;

    let env = checkEnvironment ? checkEnvironment(nextX, nextY, this.state.heading) : { collide: false, water: false };

    // Water effect -> high drag
    if (env.water) {
      this.state.velocityX *= 0.92;
      this.state.velocityY *= 0.92;
      this.state.angularVelocity *= 0.92;
    }

    // Collision check
    if (env.collide) {
      // Crash detected! Limit velocity to bounce
      let impactSpeed = Math.sqrt(this.state.velocityX**2 + this.state.velocityY**2);
      this.state.velocityX *= -0.3;
      this.state.velocityY *= -0.3;
      this.state.angularVelocity = 0; // Prevent crazy spin glitching into walls

      if (impactSpeed > 5) {
        // Visual crash spin only for hard impacts
        this.state.angularVelocity += (Math.random() - 0.5) * impactSpeed * 4;
      }
    } else {
      this.state.x = nextX;
      this.state.y = nextY;
    }

    // Ejection failsafe: if currently stuck inside a collider (e.g. rotated into wall)
    let currentEnv = checkEnvironment ? checkEnvironment(this.state.x, this.state.y, this.state.heading) : { collide: false, water: false };
    if (currentEnv.collide) {
      // Small nudge backwards out of geometry (~11cm)
      const backX = -Math.cos(newAngleRad);
      const backY = -Math.sin(newAngleRad);
      this.state.x += backX * 0.000001;
      this.state.y += backY * 0.000001;
    }
  }

  get speed() {
    return Math.sqrt(this.state.velocityX * this.state.velocityX + this.state.velocityY * this.state.velocityY);
  }
}
