import { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CarPhysics, CarState, InputState } from '../game/physics';
import { getCarPolygon } from '../game/carGeometry';

interface MapGameProps {
  accessToken: string;
}

// Mapbox standard UI setup
export default function MapGame({ accessToken }: MapGameProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map>(null);
  
  const [speedMs, setSpeedMs] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);

  // Default starting position: San Francisco near Embarcadero: -122.395, 37.795
  const initialCarState: CarState = useMemo(() => ({
    x: -122.395,
    y: 37.795,
    heading: 0, // initially North
    speed: 0,
    steeringAngle: 0
  }), []);

  const physicsRef = useRef(new CarPhysics(initialCarState));
  
  const inputRef = useRef<InputState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false
  });

  useEffect(() => {
    if (!mapContainer.current) return;
    
    if (accessToken.startsWith('sk.')) {
      setMapError('Please use a Public Access Token starting with "pk.", not a secret token starting with "sk."');
      return;
    }
    
    setMapError(null);
    mapboxgl.accessToken = accessToken;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1', // Better map style with default buildings
      center: [initialCarState.x, initialCarState.y],
      zoom: 18,
      pitch: 65, // Low camera angle
      bearing: initialCarState.heading,
      antialias: true
    });
    mapRef.current = map;

    map.on('error', (e) => {
      console.error('Mapbox error:', e);
      if (e.error?.message?.includes('token')) {
        setMapError('Invalid Mapbox token. Map failed to load.');
      }
    });

    map.on('style.load', () => {
      // Add 3D buildings
      const layers = map.getStyle()?.layers;
      let labelLayerId: string | undefined;
      if (layers) {
        for (const layer of layers) {
          if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
            labelLayerId = layer.id;
            break;
          }
        }
      }

      // 3D Buildings Layer
      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 15,
          paint: {
            'fill-extrusion-color': '#2a2a2a', // Retro minimalist block color
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'height']
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.8
          }
        },
        labelLayerId
      );

      // Add Car Layer
      map.addSource('car-source', {
        type: 'geojson',
        data: getCarPolygon(initialCarState.x, initialCarState.y, initialCarState.heading) as GeoJSON.Feature
      });

      map.addLayer({
        id: 'car-layer',
        type: 'fill-extrusion',
        source: 'car-source',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 1
        }
      });

      // Loop variables
      let lastTime = performance.now();
      let lastStateUpdate = performance.now();
      let animationFrameId: number;

      const loop = (time: number) => {
        const dt = (time - lastTime) / 1000;
        lastTime = time;

        const physics = physicsRef.current;
        

        const prevX = physics.state.x;
        const prevY = physics.state.y;
        const prevHeading = physics.state.heading;
        
        physics.update(inputRef.current, dt);

        if (time - lastStateUpdate > 100) {
          setSpeedMs(physics.state.speed);
          lastStateUpdate = time;
        }

        const carMoved = prevX !== physics.state.x || prevY !== physics.state.y || prevHeading !== physics.state.heading;

        if (carMoved) {
          // Update car source
          const carSource = map.getSource('car-source') as mapboxgl.GeoJSONSource;
          if (carSource) {
            carSource.setData(getCarPolygon(physics.state.x, physics.state.y, physics.state.heading) as unknown as GeoJSON.FeatureCollection);
          }

          // Camera follow
          map.setCenter([physics.state.x, physics.state.y]);
          map.setBearing(physics.state.heading);
        }

        animationFrameId = requestAnimationFrame(loop);
      };
      
      animationFrameId = requestAnimationFrame(loop);

      return () => cancelAnimationFrame(animationFrameId);
    });

    return () => {
      map.remove();
    };
  }, [accessToken, initialCarState]);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = inputRef.current;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW': state.forward = true; break;
        case 'ArrowDown':
        case 'KeyS': state.backward = true; break;
        case 'ArrowLeft':
        case 'KeyA': state.left = true; break;
        case 'ArrowRight':
        case 'KeyD': state.right = true; break;
        case 'Space': state.handbrake = true; break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const state = inputRef.current;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW': state.forward = false; break;
        case 'ArrowDown':
        case 'KeyS': state.backward = false; break;
        case 'ArrowLeft':
        case 'KeyA': state.left = false; break;
        case 'ArrowRight':
        case 'KeyD': state.right = false; break;
        case 'Space': state.handbrake = false; break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const kmh = Math.abs(speedMs * 3.6).toFixed(0);

  return (
    <div className="relative w-full h-full bg-black font-mono overflow-hidden">
      <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }} />
      
      {mapError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-8 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-red-500/50 p-6 rounded-lg max-w-lg text-center text-red-400">
            <h2 className="text-xl font-bold mb-2">Map Loading Error</h2>
            <p>{mapError}</p>
          </div>
        </div>
      )}

      {/* Retro UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none drop-shadow-md text-white">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-[#ff3366] drop-shadow-[0_0_8px_rgba(255,51,102,0.8)]">NIGHT DRIFTER</h1>
          <p className="text-xs uppercase tracking-widest opacity-70 mt-1">OpenStreetMap Edition</p>
        </div>
        
        <div className="text-right">
          <div className="text-4xl font-bold tabular-nums text-[#00e5ff] drop-shadow-[0_0_10px_rgba(0,229,255,0.8)]">
            {kmh} <span className="text-lg opacity-80">KM/H</span>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 text-xs opacity-70 z-10 pointer-events-none font-bold tracking-widest bg-black/50 px-4 py-2 rounded text-white">
        <span>[W] GAS</span>
        <span>[S] BRAKE</span>
        <span>[A] LEFT</span>
        <span>[D] RIGHT</span>
        <span>[SPACE] E-BRAKE</span>
      </div>
    </div>
  );
}
