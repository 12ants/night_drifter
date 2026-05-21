import { CarConfig, CAR_MODELS } from './cars';

export interface CarState {
  x: number; // longitude
  y: number; // latitude
  z: number; // altitude in meters
  heading: number; // angle in degrees, 0 is North, clockwise
  pitch: number; // tilt front/back
  roll: number; // tilt side/side
  velocityX: number; // East in m/s
  velocityY: number; // North in m/s
  velocityZ: number; // Up in m/s
  angularVelocity: number;
  angularVelocityPitch: number;
  angularVelocityRoll: number;
  slipAmount: number; // High value indicates drifting/sliding
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
  config: CarConfig;
  
  constructor(initialState: Partial<CarState>, configId: string = 'sport') {
    this.config = CAR_MODELS[configId] || CAR_MODELS['sport'];
    this.state = {
      x: initialState.x || 0,
      y: initialState.y || 0,
      z: initialState.z || 0,
      heading: initialState.heading || 0,
      pitch: initialState.pitch || 0,
      roll: initialState.roll || 0,
      velocityX: initialState.velocityX || 0,
      velocityY: initialState.velocityY || 0,
      velocityZ: initialState.velocityZ || 0,
      angularVelocity: initialState.angularVelocity || 0,
      angularVelocityPitch: initialState.angularVelocityPitch || 0,
      angularVelocityRoll: initialState.angularVelocityRoll || 0,
      slipAmount: 0,
    };
  }

  update(input: InputState, dt: number, checkEnvironment?: (x: number, y: number, heading: number) => { collide: boolean, water: boolean, groundZ: number, pitch: number, roll: number }) {
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
      longitudinalForce += this.config.engineForce;
    } 
    if (input.backward) {
      if (forwardSpeed > 1) {
        longitudinalForce -= this.config.brakingForce;
      } else {
        longitudinalForce -= this.config.engineForce * 0.5; // reverse is slower
      }
    }

    // Apply drag and rolling resistance
    if (Math.abs(forwardSpeed) > 0.1) {
      longitudinalForce -= Math.sign(forwardSpeed) * this.config.rollingResistance;
      longitudinalForce -= forwardSpeed * Math.abs(forwardSpeed) * this.config.airDrag;
    } else if (!input.forward && !input.backward) {
      forwardSpeed = 0; // complete stop
    }

    // Apply lateral grip (friction)
    let currentGrip = input.handbrake ? this.config.driftGrip : this.config.lateralGrip;
    let lateralForce = -lateralSpeed * currentGrip;
    
    let turnSpeed = this.config.turnSpeed;
    if (input.handbrake && forwardSpeed > 1) {
       longitudinalForce -= this.config.brakingForce * 0.8;
       turnSpeed = this.config.turnSpeed * 1.5; // more rotation on handbrake
    }

    // Store slip amount for effects (absolute lateral speed)
    this.state.slipAmount = Math.abs(lateralSpeed);

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
      
      targetAngularVelocity = turnAmount * turnSpeed;
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

    let env = checkEnvironment ? checkEnvironment(nextX, nextY, this.state.heading) : { collide: false, water: false, groundZ: 0, pitch: 0, roll: 0 };

    // 3D Jump & Tumble physics
    const gravity = 15.0; // Gravity m/s^2 
    this.state.velocityZ -= gravity * dt;
    let nextZ = this.state.z + this.state.velocityZ * dt;

    let isGrounded = false;
    
    // Check if hitting the ground
    if (nextZ <= env.groundZ) {
      nextZ = env.groundZ;
      if (this.state.velocityZ < -2) {
        // Bounce a little
        this.state.velocityZ *= -0.2; 
      } else {
        // Carry the momentum of the terrain slope based on speed!
        const pitchRad = env.pitch * (Math.PI / 180);
        this.state.velocityZ = forwardSpeed * Math.sin(pitchRad);
        isGrounded = true;
      }
    }

    this.state.z = nextZ;

    if (isGrounded) {
       // Spring towards terrain pitch/roll
       this.state.pitch += (env.pitch - this.state.pitch) * 10 * dt;
       this.state.roll += (env.roll - this.state.roll) * 10 * dt;
       
       this.state.angularVelocityPitch *= 0.8;
       this.state.angularVelocityRoll *= 0.8;
    } else {
       // In the air: keep tumbling if we have angular velocity
       this.state.pitch += this.state.angularVelocityPitch * dt;
       this.state.roll += this.state.angularVelocityRoll * dt;
       
       // Air drag on tumbling
       this.state.angularVelocityPitch *= 0.98;
       this.state.angularVelocityRoll *= 0.98;

       // If you steer in air, it creates some flip torque (arcade physics)
       if (input.forward) this.state.angularVelocityPitch -= 20 * dt; // Front flip 
       if (input.backward) this.state.angularVelocityPitch += 20 * dt; // Back flip
       if (input.left) this.state.angularVelocityRoll -= 20 * dt;  // Barrel roll
       if (input.right) this.state.angularVelocityRoll += 20 * dt;
    }

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
      this.state.angularVelocity *= 0.5;

      if (impactSpeed > 5) {
        // Visual crash toss (tumble over)
        this.state.velocityZ += impactSpeed * 0.3; // Launch up!
        this.state.angularVelocityPitch += (Math.random() - 0.5) * impactSpeed * 10;
        this.state.angularVelocityRoll += (Math.random() - 0.5) * impactSpeed * 10;
      }
    } else {
      this.state.x = nextX;
      this.state.y = nextY;
    }

    // Ejection failsafe: if currently stuck inside a collider (e.g. rotated into wall)
    let currentEnv = checkEnvironment ? checkEnvironment(this.state.x, this.state.y, this.state.heading) : { collide: false, water: false, groundZ: 0, pitch: 0, roll: 0 };
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
