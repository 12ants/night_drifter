import { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CarPhysics, CarState, InputState } from '../game/physics';
import { getCarPolygon } from '../game/carGeometry';
import { CAR_MODELS } from '../game/cars';
import { Settings, X } from 'lucide-react';

const LOCATIONS: Record<string, { x: number; y: number }> = {
  'Stockholm': { x: 18.0686, y: 59.3293 },
  'San Francisco': { x: -122.395, y: 37.795 },
  'Tokyo': { x: 139.6917, y: 35.6895 },
  'London': { x: -0.1278, y: 51.5074 },
  'New York': { x: -73.9851, y: 40.7589 }
};

const MAP_STYLES: Record<string, string> = {
  'Standard 3D': 'mapbox://styles/mapbox/standard',
  'Navigation Night': 'mapbox://styles/mapbox/navigation-night-v1',
  'Dark': 'mapbox://styles/mapbox/dark-v11',
  'Satellite': 'mapbox://styles/mapbox/satellite-streets-v12'
};

const LIGHT_PRESETS = ['dawn', 'day', 'dusk', 'night'];

interface MapGameProps {
  accessToken: string;
}

// Mapbox standard UI setup
export default function MapGame({ accessToken }: MapGameProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map>(null);
  
  const [speedMs, setSpeedMs] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);

  const [locationName, setLocationName] = useState('Stockholm');
  const [mapStyleName, setMapStyleName] = useState('Standard 3D');
  const [lightPreset, setLightPreset] = useState('dusk');
  const [carModelId, setCarModelId] = useState('offroad');
  const [cameraMode, setCameraMode] = useState<'chase' | 'cockpit' | 'freecam'>('chase');
  const [menuOpen, setMenuOpen] = useState(false);

  const currentCoords = LOCATIONS[locationName];

  // Starting position based on selected location
  const initialCarState: CarState = useMemo(() => ({
    x: currentCoords.x,
    y: currentCoords.y,
    heading: 0,
    velocityX: 0,
    velocityY: 0,
    angularVelocity: 0
  }), [locationName]);

  const physicsRef = useRef(new CarPhysics(initialCarState, carModelId));
  const cameraModeRef = useRef(cameraMode);
  const headlightsOnRef = useRef(true);
  
  // Smooth Camera State
  const cameraStateRef = useRef({ 
    lng: initialCarState.x, 
    lat: initialCarState.y, 
    bearing: initialCarState.heading,
    pitch: 80,
    zoom: 20
  });

  // Skid marks state
  const activeSkidsRef = useRef<{ left: number[][], right: number[][] } | null>(null);
  const allSkidsRef = useRef<{ id: number; left: number[][]; right: number[][]; timestamp: number }[]>([]);

  // Light streaks state
  const activeStreaksRef = useRef<{ 
    headL: number[][], headR: number[][], 
    tailL: number[][], tailR: number[][] 
  } | null>(null);
  
  const allStreaksRef = useRef<{ 
    id: number; 
    headL: number[][]; headR: number[][]; 
    tailL: number[][]; tailR: number[][]; 
    timestamp: number 
  }[]>([]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  // Reset physics state when initialization changes
  useEffect(() => {
    physicsRef.current = new CarPhysics(initialCarState, carModelId);
  }, [initialCarState, carModelId]);
  
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

    activeSkidsRef.current = null;
    allSkidsRef.current = [];
    activeStreaksRef.current = null;
    allStreaksRef.current = [];

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES[mapStyleName],
      center: [initialCarState.x, initialCarState.y],
      zoom: 20,
      pitch: 80, // Lower to the ground
      bearing: initialCarState.heading,
      antialias: true
    });
    mapRef.current = map;

    let isUnmounted = false;
    let animationFrameId: number;

    map.on('error', (e) => {
      console.error('Mapbox error:', e);
      if (e.error?.message?.includes('token')) {
        setMapError('Invalid Mapbox token. Map failed to load.');
      }
    });

    map.on('style.load', () => {
      if (isUnmounted) return;
      // Configure realistic lighting / shadows
      if (MAP_STYLES[mapStyleName] === 'mapbox://styles/mapbox/standard') {
        map.setConfigProperty('basemap', 'lightPreset', lightPreset);
        map.setConfigProperty('basemap', 'theme', 'night');
        
        // Mapbox Standard Style configs to hide clutter
        map.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
        map.setConfigProperty('basemap', 'showTransitLabels', false);
        map.setConfigProperty('basemap', 'showPlaceLabels', false);
        map.setConfigProperty('basemap', 'showRoadLabels', false);
      }

      // Add DEM terrain for 3D elevation
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          'type': 'raster-dem',
          'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
          'tileSize': 512,
          'maxzoom': 14
        });
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 0.5 });
      }

      // Add Atmospheric Fog / Haze
      let fogRange: [number, number] = [1.5, 8]; // Lighter by default
      let fogColor = '#c6dbfa';
      let fogHighColor = '#c6dbfa';
      let fogSpaceColor = '#3a7cf0';
      let starIntensity = 0.0;
      
      if (lightPreset === 'night') {
          fogRange = [0.1, 2.5]; // Denser
          fogColor = '#020412';
          fogHighColor = '#0b1026';
          fogSpaceColor = '#020412';
          starIntensity = 0.8;
      } else if (lightPreset === 'dusk') {
          fogRange = [0.5, 3]; // Denser
          fogColor = '#36242c';
          fogHighColor = '#1a0b16';
          fogSpaceColor = '#080312';
          starIntensity = 0.3;
      } else if (lightPreset === 'dawn') {
          fogRange = [1.5, 8];
          fogColor = '#9a818c';
          fogHighColor = '#503554';
          fogSpaceColor = '#191536';
          starIntensity = 0.1;
      }

      map.setFog({
          'range': fogRange as [number, number],
          'color': fogColor,
          'horizon-blend': 0.1,
          'high-color': fogHighColor,
          'space-color': fogSpaceColor,
          'star-intensity': starIntensity
      });

      // Add invisible 2D collision layers
      if (!map.getSource('collision-source')) {
        map.addSource('collision-source', {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-streets-v8'
        });
        map.addLayer({
          id: 'collision-buildings',
          type: 'fill',
          source: 'collision-source',
          'source-layer': 'building',
          paint: { 'fill-opacity': 0 }
        });
        map.addLayer({
          id: 'collision-water',
          type: 'fill',
          source: 'collision-source',
          'source-layer': 'water',
          paint: { 'fill-opacity': 0 }
        });
      }

      // Hide map clutter function (street names, POIs, labels, overlays)
      const hideClutter = () => {
        const layers = map.getStyle()?.layers;
        if (layers) {
          for (const layer of layers) {
            if (!layer || !layer.id) continue;
            const id = layer.id.toLowerCase();
            const sourceLayer = (layer as any).sourceLayer?.toLowerCase() || '';
            
            if (
              layer.type === 'symbol' ||
              id.includes('poi') ||
              id.includes('place') ||
              id.includes('label') ||
              id.includes('road-name') ||
              id.includes('road-label') ||
              id.includes('transit') ||
              id.includes('admin') ||
              id.includes('boundary') ||
              sourceLayer.includes('poi') ||
              sourceLayer.includes('label') ||
              sourceLayer.includes('place') ||
              sourceLayer.includes('transit')
            ) {
              try {
                if (map.getLayoutProperty(layer.id, 'visibility') !== 'none') {
                  map.setLayoutProperty(layer.id, 'visibility', 'none');
                }
              } catch (e) {
                // Ignore errors if layer doesn't support visibility
              }
            }
          }
        }
      };

      hideClutter();
      // Keep hiding dynamically loaded layers (especially for Standard style)
      map.on('styledata', hideClutter);

      // Add Skid Marks Layer
      map.addSource('skid-marks-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'skid-marks-layer',
        type: 'line',
        source: 'skid-marks-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#111',
          'line-width': 4,
          'line-opacity': ['get', 'opacity']
        }
      });

      // Add Light Streaks Layer
      map.addSource('light-streaks-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'light-streaks-layer',
        type: 'line',
        source: 'light-streaks-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
          'line-blur': 2
        }
      });

      // Add Car Layer
      map.addSource('car-source', {
        type: 'geojson',
        data: getCarPolygon(initialCarState.x, initialCarState.y, initialCarState.heading, carModelId) as unknown as GeoJSON.FeatureCollection
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

      const loop = (time: number) => {
        if (isUnmounted) return;
        const dt = (time - lastTime) / 1000;
        lastTime = time;

        const physics = physicsRef.current;
        

        const prevX = physics.state.x;
        const prevY = physics.state.y;
        const prevHeading = physics.state.heading;
        
        // Environment check
        const checkEnvironment = (lng: number, lat: number, heading: number) => {
          let env = { collide: false, water: false, groundZ: 0, pitch: 0, roll: 0 };
          if (!map || isUnmounted) return env;
          
          try {
            const carGeoJSON = getCarPolygon(lng, lat, heading, carModelId, 0, 0, 0); // Need to pass z=0 pitch=0 roll=0 for base polygon
            // First feature is the car body
            const mainBody = carGeoJSON.features[0];
            const polygon = mainBody.geometry.coordinates[0] as [number, number][];
            const pointsToCheck = [
              map.project(polygon[0] as [number, number]), // FL
              map.project(polygon[1] as [number, number]), // FR
              map.project(polygon[2] as [number, number]), // BR
              map.project(polygon[3] as [number, number]), // BL
              map.project([lng, lat]) // Center
            ];

            for (const p of pointsToCheck) {
              const features = map.queryRenderedFeatures(p, {
                layers: ['collision-buildings', 'collision-water']
              });
              
              for (const f of features) {
                if (f.layer.id === 'collision-buildings') env.collide = true;
                if (f.layer.id === 'collision-water') env.water = true;
              }
            }

            // query terrain elevation
            const evC = map.queryTerrainElevation([lng, lat]) || 0;
            const evFL = map.queryTerrainElevation(polygon[0] as [number, number]) || evC;
            const evFR = map.queryTerrainElevation(polygon[1] as [number, number]) || evC;
            const evBR = map.queryTerrainElevation(polygon[2] as [number, number]) || evC;
            const evBL = map.queryTerrainElevation(polygon[3] as [number, number]) || evC;

            env.groundZ = evC;

            // Approximate pitch and roll in degrees based on wheel elevations
            // pitch: front diff vs back diff
            const length = CAR_MODELS[carModelId]?.length || 4;
            const width = CAR_MODELS[carModelId]?.width || 2;
            
            const frontZ = (evFL + evFR) / 2;
            const backZ = (evBL + evBR) / 2;
            const leftZ = (evFL + evBL) / 2;
            const rightZ = (evFR + evBR) / 2;
            
            env.pitch = Math.atan2(frontZ - backZ, length) * (180 / Math.PI); 
            env.roll = Math.atan2(leftZ - rightZ, width) * (180 / Math.PI);

          } catch (e) {
            // Layers may not be styled yet or out of bounds
          }
          
          return env;
        };
        
        physics.update(inputRef.current, dt, checkEnvironment);

        // Skid marks logic
        let runSkidUpdate = false;
        const currentGroundZ = map.isStyleLoaded() ? (map.queryTerrainElevation([physics.state.x, physics.state.y]) || 0) : 0;
        const relativeZ = Math.max(0, physics.state.z - currentGroundZ);
        
        const isDrifting = physics.state.slipAmount > 2.5 && relativeZ < 0.2;
        
        if (isDrifting && map.isStyleLoaded()) {
            const headingRad = -physics.state.heading * (Math.PI / 180);
            const cosA = Math.cos(headingRad);
            const sinA = Math.sin(headingRad);
            const config = CAR_MODELS[carModelId];
            const L = config?.length || 4;
            const W = config?.width || 2;
            const wheelL = W / 2 - 0.1;
            const wheelB = -L / 2 + 0.5;
            
            const METERS_PER_DEGREE_LAT = 111320;
            const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(physics.state.y * Math.PI / 180);

            const getPos = (f: number, l: number) => [
              physics.state.x + (cosA * f - sinA * l) / metersPerDegreeLng,
              physics.state.y + (sinA * f + cosA * l) / METERS_PER_DEGREE_LAT
            ];

            const leftPos = getPos(wheelB, wheelL);
            const rightPos = getPos(wheelB, -wheelL);

            if (activeSkidsRef.current) {
                allSkidsRef.current.push({
                   id: performance.now(),
                   left: [activeSkidsRef.current.left[1] || activeSkidsRef.current.left[0], leftPos],
                   right: [activeSkidsRef.current.right[1] || activeSkidsRef.current.right[0], rightPos],
                   timestamp: performance.now()
                });
            }
            // we will just store the last position in activeSkidsRef as a 1-length array to keep types consistent
            activeSkidsRef.current = { left: [leftPos], right: [rightPos] };
            runSkidUpdate = true;
        } else {
            activeSkidsRef.current = null;
        }

        if (allSkidsRef.current.length > 0) {
            runSkidUpdate = true;
        }

        if (runSkidUpdate && map.isStyleLoaded()) {
            const now = performance.now();
            allSkidsRef.current = allSkidsRef.current.filter(skid => now - skid.timestamp < 3000); // 3 seconds fade
            
            try {
                const skidSource = map.getSource('skid-marks-source') as mapboxgl.GeoJSONSource;
                if (skidSource) {
                    const features: any[] = [];
                    for (const skid of allSkidsRef.current) {
                        if (skid.left.length < 2) continue;
                        let opacity = 0.5 * (1.0 - ((now - skid.timestamp) / 3000));
                        if (opacity < 0) opacity = 0;
                        features.push({
                            type: 'Feature',
                            properties: { opacity },
                            geometry: { type: 'LineString', coordinates: skid.left }
                        });
                        features.push({
                            type: 'Feature',
                            properties: { opacity },
                            geometry: { type: 'LineString', coordinates: skid.right }
                        });
                    }
                    skidSource.setData({ type: 'FeatureCollection', features } as any);
                }
            } catch (e) {}
        }

        // Light streaks logic
        let runStreakUpdate = false;
        const isNight = lightPreset === 'night' || lightPreset === 'dusk';
        // Give trail when moving reasonably fast and slipping, or at very high speeds. Look cool. 
        // For simplicity: sliding, or just high speed
        const speed = Math.sqrt(physics.state.velocityX**2 + physics.state.velocityY**2);
        const isStreaking = isNight && (speed > 10 || isDrifting);

        if (isStreaking && map.isStyleLoaded()) {
            const headingRad = -physics.state.heading * (Math.PI / 180);
            const cosA = Math.cos(headingRad);
            const sinA = Math.sin(headingRad);
            const config = CAR_MODELS[carModelId];
            const L = config?.length || 4;
            const W = config?.width || 2;
            
            const METERS_PER_DEGREE_LAT = 111320;
            const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(physics.state.y * Math.PI / 180);

            const getPos = (f: number, l: number) => [
              physics.state.x + (cosA * f - sinA * l) / metersPerDegreeLng,
              physics.state.y + (sinA * f + cosA * l) / METERS_PER_DEGREE_LAT
            ];
            
            // Adjust to headlight and taillight positions
            const headLPos = getPos(L / 2, Math.max(0.5, W / 2 - 0.2));
            const headRPos = getPos(L / 2, -Math.max(0.5, W / 2 - 0.2));
            const tailLPos = getPos(-L / 2, Math.max(0.5, W / 2 - 0.2));
            const tailRPos = getPos(-L / 2, -Math.max(0.5, W / 2 - 0.2));

            if (activeStreaksRef.current) {
                allStreaksRef.current.push({
                   id: performance.now(),
                   headL: [activeStreaksRef.current.headL[1] || activeStreaksRef.current.headL[0], headLPos],
                   headR: [activeStreaksRef.current.headR[1] || activeStreaksRef.current.headR[0], headRPos],
                   tailL: [activeStreaksRef.current.tailL[1] || activeStreaksRef.current.tailL[0], tailLPos],
                   tailR: [activeStreaksRef.current.tailR[1] || activeStreaksRef.current.tailR[0], tailRPos],
                   timestamp: performance.now()
                });
            }
            activeStreaksRef.current = { 
                headL: [headLPos], headR: [headRPos],
                tailL: [tailLPos], tailR: [tailRPos]
            };
            runStreakUpdate = true;
        } else {
            activeStreaksRef.current = null;
        }

        if (allStreaksRef.current.length > 0) runStreakUpdate = true;

        if (runStreakUpdate && map.isStyleLoaded()) {
            const now = performance.now();
            const streakDuration = 300; // Fast fade out to keep it looking like streaks!
            allStreaksRef.current = allStreaksRef.current.filter(s => now - s.timestamp < streakDuration);
            
            try {
                const streakSource = map.getSource('light-streaks-source') as mapboxgl.GeoJSONSource;
                if (streakSource) {
                    const features: any[] = [];
                    for (const streak of allStreaksRef.current) {
                        let opacity = (1.0 - ((now - streak.timestamp) / streakDuration));
                        if (opacity < 0) opacity = 0;
                        
                        const pushStreak = (coords: number[][], color: string, width: number, op: number) => {
                            if (coords.length < 2 || op <= 0) return;
                            features.push({
                                type: 'Feature',
                                properties: { opacity: op, color, width },
                                geometry: { type: 'LineString', coordinates: coords }
                            });
                        };
                        
                        // Headlights (cyan-ish white)
                        const hlOpacity = opacity * (headlightsOnRef.current ? 1.0 : 0.0);
                        pushStreak(streak.headL, '#aaffff', 8, hlOpacity);
                        pushStreak(streak.headR, '#aaffff', 8, hlOpacity);
                        pushStreak(streak.headL, '#ffffff', 3, hlOpacity);
                        pushStreak(streak.headR, '#ffffff', 3, hlOpacity);
                        
                        // Taillights (red)
                        pushStreak(streak.tailL, '#ff1111', 8, opacity);
                        pushStreak(streak.tailR, '#ff1111', 8, opacity);
                        pushStreak(streak.tailL, '#ffaaaa', 3, opacity);
                        pushStreak(streak.tailR, '#ffaaaa', 3, opacity);
                    }
                    streakSource.setData({ type: 'FeatureCollection', features } as any);
                }
            } catch (e) {}
        }

        if (time - lastStateUpdate > 100) {
          setSpeedMs(physics.speed);
          lastStateUpdate = time;
        }

        const carMoved = prevX !== physics.state.x || prevY !== physics.state.y || prevHeading !== physics.state.heading
                       || physics.state.velocityZ !== 0 || physics.state.pitch !== 0 || physics.state.roll !== 0;

        if (carMoved && map.isStyleLoaded()) {
          try {
            // Update car source
            const carSource = map.getSource('car-source') as mapboxgl.GeoJSONSource;
            if (carSource) {
              const currentGroundZ = map.queryTerrainElevation([physics.state.x, physics.state.y]) || 0;
              const relativeZ = Math.max(0, physics.state.z - currentGroundZ);
              
              carSource.setData(getCarPolygon(
                physics.state.x, 
                physics.state.y, 
                physics.state.heading, 
                carModelId,
                relativeZ,
                physics.state.pitch,
                physics.state.roll
              ) as unknown as GeoJSON.FeatureCollection);
            }

            // Camera follow
            if (cameraModeRef.current !== 'freecam') {
              const cam = cameraStateRef.current;
              const isCockpit = cameraModeRef.current === 'cockpit';
              
              // Target camera values
              const tLng = physics.state.x;
              const tLat = physics.state.y;
              const tBearing = physics.state.heading;
              const tPitch = isCockpit ? 85 : 75;
              const tZoom = isCockpit ? 21.5 : 19.5;
              
              // Smooth lerp (chase cam has slight lag for smoothness, cockpit is tighter)
              const stiffness = isCockpit ? 30 : 10;
              const l = (val: number, target: number, speed: number) => val + (target - val) * Math.min(1, speed * dt);
              
              cam.lng = l(cam.lng, tLng, stiffness);
              cam.lat = l(cam.lat, tLat, stiffness);
              
              // Angle lerp
              let db = tBearing - cam.bearing;
              while (db > 180) db -= 360;
              while (db < -180) db += 360;
              cam.bearing += db * Math.min(1, stiffness * dt);
              
              cam.pitch = l(cam.pitch, tPitch, 5);
              cam.zoom = l(cam.zoom, tZoom, 5);

              map.jumpTo({
                center: [cam.lng, cam.lat],
                bearing: cam.bearing,
                pitch: cam.pitch,
                zoom: cam.zoom
              });
            }
          } catch (e) {
            // style might be updating
          }
        }

        if (!isUnmounted) {
          animationFrameId = requestAnimationFrame(loop);
        }
      };
      
      animationFrameId = requestAnimationFrame(loop);
    });

    return () => {
      isUnmounted = true;
      cancelAnimationFrame(animationFrameId);
      map.remove();
    };
  }, [accessToken, initialCarState, mapStyleName, lightPreset, carModelId]);

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
        case 'KeyC':
          setCameraMode(prev => {
            return prev === 'chase' ? 'cockpit' : prev === 'cockpit' ? 'freecam' : 'chase';
          });
          break;
        case 'KeyL':
          headlightsOnRef.current = !headlightsOnRef.current;
          break;
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
        
        <div className="text-right flex items-start gap-4">
          <div className="text-4xl font-bold tabular-nums text-[#00e5ff] drop-shadow-[0_0_10px_rgba(0,229,255,0.8)]">
            {kmh} <span className="text-lg opacity-80">KM/H</span>
          </div>
          <button 
            onClick={() => setMenuOpen(true)}
            className="p-2 bg-neutral-900/80 border border-[#ff3366]/50 rounded hover:bg-[#ff3366]/20 transition-colors pointer-events-auto"
          >
            <Settings className="w-6 h-6 text-[#ff3366]" />
          </button>
        </div>
      </div>
      
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 text-xs opacity-70 z-10 pointer-events-none font-bold tracking-widest bg-black/50 px-4 py-2 rounded text-white flex-wrap justify-center">
        <span>[W] GAS</span>
        <span>[S] BRAKE</span>
        <span>[A] LEFT</span>
        <span>[D] RIGHT</span>
        <span>[SPACE] E-BRAKE</span>
        <span>[L] LIGHTS</span>
        <span>[C] CAM ({cameraMode.toUpperCase()})</span>
        <span>[AIR] W/S FLIP, A/D ROLL</span>
      </div>

      {/* Settings Menu Modal */}
      {menuOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-neutral-900 border border-[#00e5ff]/30 p-6 rounded-lg max-w-md w-full text-neutral-200">
            <div className="flex justify-between items-center mb-6 border-b border-neutral-800 pb-4">
              <h2 className="text-xl font-bold tracking-widest text-[#00e5ff]">SETTINGS</h2>
              <button onClick={() => setMenuOpen(false)} className="hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold tracking-widest text-neutral-400 mb-2 uppercase">Vehicle</label>
                <select 
                  className="w-full bg-black border border-neutral-700 text-white rounded p-2 focus:border-[#ff3366] outline-none transition-colors font-mono"
                  value={carModelId}
                  onChange={(e) => setCarModelId(e.target.value)}
                >
                  {Object.values(CAR_MODELS).map((model) => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold tracking-widest text-neutral-400 mb-2 uppercase">Location</label>
                <select 
                  className="w-full bg-black border border-neutral-700 text-white rounded p-2 focus:border-[#ff3366] outline-none transition-colors font-mono"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                >
                  {Object.keys(LOCATIONS).map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold tracking-widest text-neutral-400 mb-2 uppercase">Map Style</label>
                <select 
                  className="w-full bg-black border border-neutral-700 text-white rounded p-2 focus:border-[#ff3366] outline-none transition-colors font-mono"
                  value={mapStyleName}
                  onChange={(e) => setMapStyleName(e.target.value)}
                >
                  {Object.keys(MAP_STYLES).map((style) => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
              </div>

              {MAP_STYLES[mapStyleName] === 'mapbox://styles/mapbox/standard' && (
                <div>
                  <label className="block text-xs font-bold tracking-widest text-neutral-400 mb-2 uppercase">Light Preset</label>
                  <select 
                    className="w-full bg-black border border-neutral-700 text-white rounded p-2 focus:border-[#ff3366] outline-none transition-colors font-mono"
                    value={lightPreset}
                    onChange={(e) => setLightPreset(e.target.value)}
                  >
                    {LIGHT_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>{preset.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              )}

              <button 
                onClick={() => setMenuOpen(false)}
                className="w-full bg-[#ff3366]/20 border border-[#ff3366] text-[#ff3366] font-bold tracking-widest uppercase py-3 rounded mt-4 hover:bg-[#ff3366]/30 transition-colors"
              >
                Resume Driving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
