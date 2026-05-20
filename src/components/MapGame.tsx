import { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CarPhysics, CarState, InputState } from '../game/physics';
import { getCarPolygon } from '../game/carGeometry';
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

const CAMERA_MODES = [
  { id: 'chase', name: 'Chase View', pitch: 65, baseZoom: 18 },
  { id: 'top-down', name: 'Top Down', pitch: 0, baseZoom: 16.5 },
  { id: 'cinematic', name: 'Cinematic', pitch: 45, baseZoom: 15 },
];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraModeIndex, setCameraModeIndex] = useState(0);

  const cameraRef = useRef({
    modeIndex: 0,
    zoomOffset: 0,
    currentPitch: CAMERA_MODES[0].pitch,
    currentZoom: CAMERA_MODES[0].baseZoom
  });

  useEffect(() => {
    cameraRef.current.modeIndex = cameraModeIndex;
  }, [cameraModeIndex]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Zoom out if scrolling down (positive delta), zoom in if scrolling up
      cameraRef.current.zoomOffset -= e.deltaY * 0.002;
      // Clamp offset so zoom doesn't go crazy
      cameraRef.current.zoomOffset = Math.max(-5, Math.min(cameraRef.current.zoomOffset, 5));
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  const currentCoords = LOCATIONS[locationName];

  // Starting position based on selected location
  const initialCarState: CarState = useMemo(() => ({
    x: currentCoords.x,
    y: currentCoords.y,
    heading: 0,
    speed: 0,
    steeringAngle: 0
  }), [locationName]);

  const physicsRef = useRef(new CarPhysics(initialCarState));

  // Reset physics state when initialization changes
  useEffect(() => {
    physicsRef.current = new CarPhysics(initialCarState);
  }, [initialCarState]);
  
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
      style: MAP_STYLES[mapStyleName],
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
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.2 });
      }

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

      // Add Particles Layer
      if (!map.getSource('particles-source')) {
        map.addSource('particles-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        
        map.addLayer({
          id: 'particles-smoke',
          type: 'circle',
          source: 'particles-source',
          filter: ['==', 'type', 'smoke'],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'life'], 0, 12, 1, 3],
            'circle-color': '#d1d5db',
            'circle-opacity': ['interpolate', ['linear'], ['get', 'life'], 0, 0, 1, 0.5],
            'circle-blur': 1,
            'circle-pitch-alignment': 'map'
          }
        });

        map.addLayer({
          id: 'particles-water',
          type: 'circle',
          source: 'particles-source',
          filter: ['==', 'type', 'water'],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'life'], 0, 8, 1, 2],
            'circle-color': '#00e5ff',
            'circle-opacity': ['interpolate', ['linear'], ['get', 'life'], 0, 0, 1, 0.7],
            'circle-blur': 0.5,
            'circle-pitch-alignment': 'map'
          }
        });
      }

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
      
      let particles: {id: number; x: number; y: number; life: number; type: string}[] = [];
      let particleIdCounter = 0;

      const loop = (time: number) => {
        const dt = (time - lastTime) / 1000;
        lastTime = time;

        const physics = physicsRef.current;
        

        const prevX = physics.state.x;
        const prevY = physics.state.y;
        const prevHeading = physics.state.heading;
        
        // Environment check
        const checkEnvironment = (lng: number, lat: number, heading: number) => {
          if (!map) return { collide: false, water: false };
          
          let collide = false;
          let water = false;

          try {
            const polygon = getCarPolygon(lng, lat, heading).geometry.coordinates[0] as [number, number][];
            const pointsToCheck = [
              map.project(polygon[0] as [number, number]),
              map.project(polygon[1] as [number, number]),
              map.project(polygon[2] as [number, number]),
              map.project(polygon[3] as [number, number]),
              map.project([lng, lat]) // Center
            ];

            for (const p of pointsToCheck) {
              const features = map.queryRenderedFeatures(p, {
                layers: ['collision-buildings', 'collision-water']
              });
              
              for (const f of features) {
                if (f.layer.id === 'collision-buildings') collide = true;
                if (f.layer.id === 'collision-water') water = true;
              }
            }
          } catch (e) {
            // Layers may not be styled yet or out of bounds
            return { collide: false, water: false };
          }
          
          return { collide, water };
        };
        
        physics.update(inputRef.current, dt, checkEnvironment);

        if (time - lastStateUpdate > 100) {
          setSpeedMs(physics.speed);
          lastStateUpdate = time;
        }

        // Particle generation
        const speedKmh = physics.speed * 3.6;
        const currentEnv = checkEnvironment(physics.state.x, physics.state.y, physics.state.heading);
        const inWater = currentEnv.water;
        const drifting = inputRef.current.handbrake && speedKmh > 15;

        if (speedKmh > 5 && (inWater || drifting)) {
          // Add particles
          for (let i = 0; i < 2; i++) {
             const angleRad = (90 - physics.state.heading + 180) * (Math.PI / 180);
             const backDist = 0.000015; // behind the car
             const px = physics.state.x + Math.cos(angleRad) * backDist + (Math.random() - 0.5) * 0.00001;
             const py = physics.state.y + Math.sin(angleRad) * backDist + (Math.random() - 0.5) * 0.00001;
             particles.push({
               id: particleIdCounter++,
               x: px,
               y: py,
               life: 1.0,
               type: inWater ? 'water' : 'smoke'
             });
          }
        }

        // Update particles
        let particlesChanged = false;
        if (particles.length > 0 || (inWater || drifting)) {
           particlesChanged = true;
           particles = particles.filter(p => {
             // die quicker in water vs smoke
             p.life -= dt * (p.type === 'water' ? 2.5 : 1.2);
             return p.life > 0;
           });
        }

        const carMoved = prevX !== physics.state.x || prevY !== physics.state.y || prevHeading !== physics.state.heading;

        // Camera interpolation
        const cState = cameraRef.current;
        const targetMode = CAMERA_MODES[cState.modeIndex];
        const targetPitch = targetMode.pitch;
        const targetZoom = targetMode.baseZoom + cState.zoomOffset;
        
        cState.currentPitch += (targetPitch - cState.currentPitch) * 5 * dt;
        cState.currentZoom += (targetZoom - cState.currentZoom) * 5 * dt;

        if (carMoved) {
          // Update car source
          const carSource = map.getSource('car-source') as mapboxgl.GeoJSONSource;
          if (carSource) {
            carSource.setData(getCarPolygon(physics.state.x, physics.state.y, physics.state.heading) as unknown as GeoJSON.FeatureCollection);
          }
        }
        
        // Update camera (always track position, heading, and interpolated zoom/pitch)
        map.setCenter([physics.state.x, physics.state.y]);
        map.setBearing(physics.state.heading);
        map.setZoom(cState.currentZoom);
        map.setPitch(cState.currentPitch);

        if (particlesChanged) {
           const pSource = map.getSource('particles-source') as mapboxgl.GeoJSONSource;
           if (pSource) {
             pSource.setData({
               type: 'FeatureCollection',
               features: particles.map(p => ({
                 type: 'Feature',
                 properties: { type: p.type, life: p.life },
                 geometry: { type: 'Point', coordinates: [p.x, p.y] }
               }))
             } as GeoJSON.FeatureCollection);
           }
        }

        animationFrameId = requestAnimationFrame(loop);
      };
      
      animationFrameId = requestAnimationFrame(loop);

      return () => cancelAnimationFrame(animationFrameId);
    });

    return () => {
      map.remove();
    };
  }, [accessToken, initialCarState, mapStyleName, lightPreset]);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // Ignore hold repeats for things like 'c'
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
        case 'KeyC': setCameraModeIndex(i => (i + 1) % CAMERA_MODES.length); break;
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
      
      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none z-10">
        <div className="flex flex-wrap justify-center gap-4 text-xs opacity-70 font-bold tracking-widest bg-black/50 px-4 py-2 rounded text-white border border-neutral-800">
          <span>[W] GAS</span>
          <span>[S] BRAKE</span>
          <span>[A] LEFT</span>
          <span>[D] RIGHT</span>
          <span>[SPACE] E-BRAKE</span>
          <span>[C] CAMERA ({CAMERA_MODES[cameraModeIndex].name})</span>
          <span>[SCROLL] ZOOM</span>
        </div>
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
