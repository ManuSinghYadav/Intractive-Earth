import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, useTexture, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import * as SunCalc from 'suncalc';
import tzlookup from 'tz-lookup';
import { X, Sunrise, Sunset, Moon as MoonIcon } from 'lucide-react';
import { geoContains, geoArea } from 'd3-geo';
import { ISSTracker, StarlinkSwarm } from './Satellites';



// Helper to convert lat/lon to 3D position on a sphere
function latLongToVector3(lat: number, lon: number, radius: number) {
  const phi = lat * (Math.PI / 180);
  const theta = lon * (Math.PI / 180);

  const x = radius * Math.cos(phi) * Math.cos(theta);
  const y = radius * Math.sin(phi);
  const z = -radius * Math.cos(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

const LANDMARKS = [
  // North America
  { name: "Statue of Liberty", lat: 40.6892, lon: -74.0445 },
  { name: "Golden Gate Bridge", lat: 37.8199, lon: -122.4783 },
  { name: "Grand Canyon", lat: 36.1069, lon: -112.1129 },
  { name: "Niagara Falls", lat: 43.0962, lon: -79.0377 },
  { name: "CN Tower", lat: 43.6426, lon: -79.3871 },
  { name: "Mount Denali", lat: 63.0692, lon: -151.0070 },
  { name: "Chichen Itza", lat: 20.6843, lon: -88.5678 },
  { name: "Panama Canal", lat: 9.1012, lon: -79.6954 },

  // South America
  { name: "Christ the Redeemer", lat: -22.9519, lon: -43.2105 },
  { name: "Machu Picchu", lat: -13.1631, lon: -72.5450 },
  { name: "Iguazu Falls", lat: -25.6953, lon: -54.4367 },
  { name: "Salar de Uyuni", lat: -20.1338, lon: -67.4891 },
  { name: "Easter Island", lat: -27.1127, lon: -109.3497 },
  { name: "Aconcagua", lat: -32.6532, lon: -70.0109 },

  // Europe
  { name: "Eiffel Tower", lat: 48.8584, lon: 2.2945 },
  { name: "Colosseum", lat: 41.8902, lon: 12.4922 },
  { name: "Acropolis of Athens", lat: 37.9715, lon: 23.7257 },
  { name: "Stonehenge", lat: 51.1789, lon: -1.8262 },
  { name: "Big Ben", lat: 51.5007, lon: -0.1246 },
  { name: "Sagrada Familia", lat: 41.4036, lon: 2.1744 },
  { name: "Leaning Tower of Pisa", lat: 43.7230, lon: 10.3966 },
  { name: "Red Square", lat: 55.7539, lon: 37.6208 },
  { name: "Matterhorn", lat: 45.9763, lon: 7.6586 },
  { name: "Mount Elbrus", lat: 43.3499, lon: 42.4453 },

  // Africa
  { name: "Pyramids of Giza", lat: 29.9792, lon: 31.1342 },
  { name: "Table Mountain", lat: -33.9628, lon: 18.4098 },
  { name: "Mount Kilimanjaro", lat: -3.0674, lon: 37.3556 },
  { name: "Victoria Falls", lat: -17.9243, lon: 25.8572 },

  // Asia
  { name: "Taj Mahal", lat: 27.1751, lon: 78.0421 },
  { name: "Great Wall of China", lat: 40.4319, lon: 116.5704 },
  { name: "Mount Everest", lat: 27.9881, lon: 86.9250 },
  { name: "K2", lat: 35.8800, lon: 76.5151 },
  { name: "Petra", lat: 30.3285, lon: 35.4444 },
  { name: "Burj Khalifa", lat: 25.1972, lon: 55.2744 },
  { name: "Mount Fuji", lat: 35.3606, lon: 138.7274 },
  { name: "Angkor Wat", lat: 13.4125, lon: 103.8670 },
  { name: "Potala Palace", lat: 29.6528, lon: 91.1175 },
  { name: "Borobudur", lat: -7.6079, lon: 110.2038 },
  { name: "Forbidden City", lat: 39.9163, lon: 116.3972 },
  { name: "Marina Bay Sands", lat: 1.2834, lon: 103.8607 },
  { name: "Kaaba (Mecca)", lat: 21.4225, lon: 39.8262 },
  { name: "Dome of the Rock", lat: 31.7780, lon: 35.2354 },

  // Oceania
  { name: "Sydney Opera House", lat: -33.8568, lon: 151.2153 },
  { name: "Great Barrier Reef", lat: -18.2871, lon: 147.6992 },
  { name: "Uluru", lat: -25.3444, lon: 131.0369 },

  // Antarctica
  { name: "South Pole", lat: -90.0000, lon: 0.0000 },
  { name: "Mount Vinson", lat: -78.5254, lon: -85.6171 },
];

function LandmarkMarker({ landmark }: { landmark: any }) {
  const pos = useMemo(() => latLongToVector3(landmark.lat, landmark.lon, 2.005), [landmark]);
  const containerRef = useRef<HTMLDivElement>(null);

  useFrame((state) => {
    if (containerRef.current) {
      // 1. Zoom Opacity (fade in as you zoom closer)
      const dist = state.camera.position.length();
      const zoomOpacity = Math.max(0, Math.min(1, (6 - dist) / 3));

      // 2. Occlusion (hide if on the back side of the Earth)
      // Calculate vector from camera to marker
      const cameraToMarker = pos.clone().sub(state.camera.position);
      // Normal vector of the marker (pointing straight up from Earth's center)
      const normal = pos.clone().normalize();
      
      // If the dot product is positive, the camera is looking at the "back" of the marker
      // We use a small negative threshold (-0.05) to hide it just as it hits the horizon
      const isVisible = cameraToMarker.dot(normal) < -0.05;

      // Apply final visibility
      const finalOpacity = isVisible ? zoomOpacity : 0;
      containerRef.current.style.opacity = finalOpacity.toString();
      containerRef.current.style.pointerEvents = (isVisible && zoomOpacity > 0) ? 'auto' : 'none';
    }
  });

  return (
    <Html position={pos} center zIndexRange={[100, 0]}>
      <div ref={containerRef} className="group relative cursor-pointer flex items-center justify-center transition-opacity duration-200">
        <div className="w-1.5 h-1.5 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,1)] border border-white/50"></div>
        <div className="absolute left-3 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none border border-white/10 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {landmark.name}
        </div>
      </div>
    </Html>
  );
}

// Accurate subsolar point calculation
function getSubsolarPoint(date: Date) {
  const sun = Astronomy.Equator('Sun', date, new Astronomy.Observer(0, 0, 0), true, true);
  const gast = Astronomy.SiderealTime(date);
  let lon = (sun.ra - gast) * 15;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: sun.dec, lon: lon };
}

// Sublunar point using Astronomy
function getSublunarPoint(date: Date) {
  const moon = Astronomy.Equator('Moon', date, new Astronomy.Observer(0, 0, 0), true, true);
  const gast = Astronomy.SiderealTime(date);
  let lon = (moon.ra - gast) * 15;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: moon.dec, lon: lon };
}

function MovingStars() {
  const starsRef = useRef<any>(null);
  useFrame(() => {
    if (starsRef.current) {
      starsRef.current.rotation.y += 0.0002;
      starsRef.current.rotation.x += 0.0001;
    }
  });
  return <Stars ref={starsRef} radius={100} depth={50} count={8000} factor={7} saturation={0.5} fade speed={2} />;
}

const auroraVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormalWorld;
  void main() {
    vUv = uv;
    vPosition = position;
    vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const auroraFragmentShader = `
  uniform float time;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormalWorld;

  // 3D Simplex Noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    // Latitude based mask (aurora mostly visible near poles)
    float latMask = smoothstep(0.6, 0.85, abs(vPosition.y / 2.0));
    
    // Night side mask
    float sunDot = dot(vNormalWorld, sunDirection);
    float nightMask = 1.0 - smoothstep(-0.2, 0.1, sunDot);
    
    // Noise generation for aurora shapes
    float n1 = snoise(vec3(vPosition.x * 3.0, vPosition.y * 10.0 - time * 0.5, vPosition.z * 3.0 + time * 0.2));
    float n2 = snoise(vec3(vPosition.x * 5.0 - time * 0.3, vPosition.y * 15.0, vPosition.z * 5.0 + time * 0.4));
    
    float auroraNoise = smoothstep(0.2, 0.8, n1 * 0.5 + n2 * 0.5 + 0.5);
    
    float intensity = latMask * nightMask * auroraNoise;
    
    vec3 auroraColor = vec3(0.1, 0.8, 0.4); // Greenish
    auroraColor = mix(auroraColor, vec3(0.5, 0.2, 0.8), snoise(vPosition * 2.0 + time * 0.1) * 0.5 + 0.5); // Add some purple
    
    gl_FragColor = vec4(auroraColor, intensity * 0.6);
  }
`;

function Aurora({ sunPosition }: { sunPosition: THREE.Vector3 }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  const uniforms = useMemo(() => ({
    time: { value: 0 },
    sunDirection: { value: sunPosition.clone().normalize() }
  }), []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      materialRef.current.uniforms.sunDirection.value.copy(sunPosition).normalize();
    }
  });

  return (
    <mesh>
      <sphereGeometry args={[2.03, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={auroraVertexShader}
        fragmentShader={auroraFragmentShader}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function Earth({ sunPosition, geoJson, selectedFeature, onClick }: { sunPosition: THREE.Vector3, geoJson: any, selectedFeature: any, onClick?: (e: any) => void }) {
  const earthGroupRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (cloudsRef.current) {
      const dist = state.camera.position.length();
      const material = cloudsRef.current.material as THREE.MeshStandardMaterial;
      // Dynamically fade out clouds as the camera zooms in close to the surface
      // Starts fading at distance 2.5, completely transparent at 2.05
      material.opacity = Math.max(0, Math.min(0.4, (dist - 2.05) * 0.8));
    }
  });

  const [colorMap, bumpMap, specularMap, cloudsMap, nightMap] = useTexture([
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    'https://unpkg.com/three-globe/example/img/earth-topology.png',
    'https://unpkg.com/three-globe/example/img/earth-water.png',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
    'https://unpkg.com/three-globe/example/img/earth-night.jpg',
  ]);

  const nightMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        nightMap: { value: nightMap },
        sunDirection: { value: sunPosition.clone().normalize() }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        void main() {
          vUv = uv;
          vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D nightMap;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        void main() {
          vec4 nightColor = texture2D(nightMap, vUv);
          float sunDot = dot(vNormalWorld, sunDirection);
          
          // Sharper twilight zone for a clearer terminator line.
          // sunDot = 0 is the geometric terminator.
          float nightMask = 1.0 - smoothstep(-0.05, 0.02, sunDot); 
          
          // Steeper non-linear fade for a sharper transition
          nightMask = pow(nightMask, 3.0);
          
          // Enhance the brightness of the city lights
          float luminance = dot(nightColor.rgb, vec3(0.299, 0.587, 0.114));
          
          // Warm tint for the city lights to make them look more realistic (sodium/LED mix)
          vec3 cityColor = nightColor.rgb * vec3(1.1, 0.95, 0.8) * 2.0;
          
          // Output color with alpha based on the mask and luminance
          gl_FragColor = vec4(cityColor, luminance * nightMask * 2.5);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, [nightMap, sunPosition]);

  // Update sun direction uniform when sunPosition changes
  useEffect(() => {
    if (nightMaterial) {
      nightMaterial.uniforms.sunDirection.value.copy(sunPosition).normalize();
    }
  }, [sunPosition, nightMaterial]);

  useFrame((state, delta) => {
    // Earth rotates once per day (approx 360 degrees / 24 hours)
    // We'll keep a slow rotation for visual effect, but the sun/moon positions are accurate
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * 0.01; // Clouds move slightly faster
    }
  });

  return (
    <group ref={earthGroupRef}>
      {/* Base Earth */}
      <mesh onClick={onClick}>
        <sphereGeometry args={[2, 128, 128]} />
        <meshStandardMaterial
          map={colorMap}
          bumpMap={bumpMap}
          bumpScale={0.015}
          metalnessMap={specularMap}
          roughness={0.7}
          metalness={0.4}
        />
      </mesh>
      
      {/* Landmarks */}
      {LANDMARKS.map((landmark, i) => (
        <LandmarkMarker key={i} landmark={landmark} />
      ))}

      {/* Night Lights */}
      <mesh material={nightMaterial}>
        <sphereGeometry args={[2.001, 128, 128]} />
      </mesh>

      {/* Country Borders */}
      <CountryBorders geoJson={geoJson} />
      
      {/* Aurora */}
      <Aurora sunPosition={sunPosition} />
      
      {/* Selected Country Border */}
      <SelectedCountryBorder feature={selectedFeature} />

      {/* Clouds */}
      <mesh ref={cloudsRef}>
        <sphereGeometry args={[2.01, 128, 128]} />
        <meshStandardMaterial
          map={cloudsMap}
          transparent={true}
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

function Moon({ position, sunPosition }: { position: THREE.Vector3, sunPosition: THREE.Vector3 }) {
  const moonMap = useTexture('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg');

  const uniforms = useMemo(() => ({
    moonMap: { value: moonMap },
    sunDirection: { value: new THREE.Vector3() }
  }), [moonMap]);

  useFrame(() => {
    // Calculate direction from moon to sun
    const dir = new THREE.Vector3().subVectors(sunPosition, position).normalize();
    uniforms.sunDirection.value.copy(dir);
  });

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.5, 32, 32]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={`
            varying vec2 vUv;
            varying vec3 vNormalWorld;
            void main() {
              vUv = uv;
              vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform sampler2D moonMap;
            uniform vec3 sunDirection;
            varying vec2 vUv;
            varying vec3 vNormalWorld;
            void main() {
              vec4 texColor = texture2D(moonMap, vUv);
              float intensity = max(0.0, dot(vNormalWorld, sunDirection));
              
              // Add a tiny bit of ambient light so the dark side isn't pitch black
              intensity = intensity * 0.95 + 0.05;
              
              gl_FragColor = vec4(texColor.rgb * intensity, 1.0);
            }
          `}
        />
      </mesh>
    </group>
  );
}

function Sun({ position }: { position: THREE.Vector3 }) {
  const sunTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 512, 512);
    }
    return new THREE.CanvasTexture(canvas);
  }, []);

  return (
    <group position={position}>
      <directionalLight intensity={4.5} castShadow />
      
      {/* Sun Body */}
      <mesh>
        <sphereGeometry args={[2, 64, 64]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Sun Glow */}
      <sprite scale={[25, 25, 1]}>
        <spriteMaterial map={sunTexture} color="#ffffff" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
    </group>
  );
}

function SelectedCountryBorder({ feature }: { feature: any }) {
  const [borderRings, setBorderRings] = useState<THREE.Vector3[][]>([]);

  useEffect(() => {
    if (!feature || !feature.geometry) {
      setBorderRings([]);
      return;
    }
    const rings: THREE.Vector3[][] = [];
    const geom = feature.geometry;
    const coords = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    
    coords.forEach((polygon: any) => {
      polygon.forEach((ring: any) => {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < ring.length; i++) {
          // Render slightly higher than the base borders to avoid z-fighting
          points.push(latLongToVector3(ring[i][1], ring[i][0], 2.004));
        }
        rings.push(points);
      });
    });
    setBorderRings(rings);
  }, [feature]);

  if (!borderRings.length) return null;

  return (
    <group>
      {borderRings.map((ring, i) => {
        const positions = new Float32Array(ring.length * 3);
        for (let j = 0; j < ring.length; j++) {
          positions[j * 3] = ring[j].x;
          positions[j * 3 + 1] = ring[j].y;
          positions[j * 3 + 2] = ring[j].z;
        }
        return (
          <line key={i}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={ring.length}
                array={positions}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#3b82f6" linewidth={2} transparent opacity={0.8} depthTest={false} />
          </line>
        );
      })}
    </group>
  );
}

function CountryBorders({ geoJson }: { geoJson: any }) {
  const [borders, setBorders] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (!geoJson) return;
    const points: THREE.Vector3[] = [];
    geoJson.features.forEach((feature: any) => {
      const geom = feature.geometry;
      if (!geom) return;
      const coords = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
      coords.forEach((polygon: any) => {
        polygon.forEach((ring: any) => {
          for (let i = 0; i < ring.length - 1; i++) {
            const p1 = latLongToVector3(ring[i][1], ring[i][0], 2.002);
            const p2 = latLongToVector3(ring[i+1][1], ring[i+1][0], 2.002);
            points.push(p1, p2);
          }
        });
      });
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    setBorders(geometry);
  }, [geoJson]);

  if (!borders) return null;

  return (
    <lineSegments geometry={borders}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.25} />
    </lineSegments>
  );
}

export default function EarthScene() {
  const [sunPos, setSunPos] = useState(new THREE.Vector3(50, 0, 0));
  const [moonPos, setMoonPos] = useState(new THREE.Vector3(-15, 0, 0));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [news, setNews] = useState<{title: string, url: string}[]>([]);
  const [geoJson, setGeoJson] = useState<any>(null);
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [timeMultiplier, setTimeMultiplier] = useState(1);
  const [showISS, setShowISS] = useState(true);
  const [showStarlink, setShowStarlink] = useState(true);
  const [rotationMode, setRotationMode] = useState<'sun' | 'earth'>('sun');
  const [earthRotation, setEarthRotation] = useState(0);
  const baseTimeRef = useRef(new Date().getTime());
  const realTimeRef = useRef(performance.now());
  const reqRef = useRef<number>();
  const [locationData, setLocationData] = useState<{
    lat: number, 
    lon: number, 
    tz: string, 
    sunrise: Date|null, 
    sunset: Date|null, 
    moonPhase: number,
    country?: string,
    countryCode?: string,
    state?: string,
    district?: string,
    loadingLocation?: boolean
  } | null>(null);

  const handleSpeedChange = (mult: number) => {
    setTimeMultiplier(mult);
    const now = Date.now();
    baseTimeRef.current = now;
    realTimeRef.current = performance.now();
  };

  const handleEarthClick = async (e: any) => {
    e.stopPropagation();
    
    // Play haptic click sound
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
      audio.volume = 0.4;
      audio.play();
    } catch (err) {}

    if (e.uv) {
      const lat = (e.uv.y - 0.5) * 180;
      let lon = (e.uv.x - 0.5) * 360;
      
      // Find clicked country via d3-geo
      let clickedCountryName = '';
      let isIndiaState = false;
      if (geoJson) {
        const clickedFeature = geoJson.features.find((f: any) => geoContains(f, [lon, lat]));
        setSelectedFeature(clickedFeature || null);
        if (clickedFeature && clickedFeature.properties) {
          clickedCountryName = clickedFeature.properties.name || clickedFeature.properties.NAME;
          isIndiaState = clickedFeature.properties.isIndiaState || false;
        }
      }
      
      try {
        const tz = tzlookup(lat, lon);
        const now = new Date();
        const times = SunCalc.getTimes(now, lat, lon);
        const moonIllum = SunCalc.getMoonIllumination(now);
        
        setLocationData({
          lat,
          lon,
          tz,
          sunrise: times.sunrise,
          sunset: times.sunset,
          moonPhase: moonIllum.phase,
          loadingLocation: true,
          country: isIndiaState ? 'India' : clickedCountryName,
          state: isIndiaState ? clickedCountryName : ''
        });

        try {
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
          const data = await res.json();
          
          let district = '';
          const admin = data.localityInfo?.administrative || [];
          const districtObj = admin.find((a: any) => a.name.toLowerCase().includes('district') || (a.description && a.description.toLowerCase().includes('district')));
          if (districtObj) {
            district = districtObj.name;
          } else {
            const level5 = admin.find((a: any) => a.adminLevel === 5 || a.adminLevel === 6);
            if (level5) district = level5.name;
          }

          setLocationData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              loadingLocation: false,
              country: data.countryName || prev.country,
              countryCode: data.countryCode || prev.countryCode,
              state: data.principalSubdivision,
              district: district
            };
          });

          if (data.countryName) {
            try {
              const newsRes = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?query="${encodeURIComponent(data.countryName)}"&mode=artlist&maxrecords=3&format=json`);
              const newsData = await newsRes.json();
              if (newsData && newsData.articles) {
                setNews(newsData.articles.map((a: any) => ({ title: a.title, url: a.url })));
              } else {
                setNews([]);
              }
            } catch (e) {
              console.error("News fetch failed", e);
              setNews([]);
            }
          } else {
            setNews([]);
          }
        } catch (err) {
          console.error("Failed to fetch location details", err);
          setLocationData(prev => prev ? { ...prev, loadingLocation: false } : null);
        }

      } catch (err) {
        console.error("Could not find timezone for location", err);
      }
    }
  };

  const formatTime = (date: Date | null, tz: string) => {
    if (!date || isNaN(date.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  };

  const formatDate = (date: Date, tz: string) => {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  };

  const getMoonPhaseText = (phase: number) => {
    if (phase < 0.03 || phase > 0.97) return 'New Moon';
    if (phase < 0.22) return 'Waxing Crescent';
    if (phase < 0.28) return 'First Quarter';
    if (phase < 0.47) return 'Waxing Gibbous';
    if (phase < 0.53) return 'Full Moon';
    if (phase < 0.72) return 'Waning Gibbous';
    if (phase < 0.78) return 'Last Quarter';
    return 'Waning Crescent';
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [worldRes, indiaRes] = await Promise.all([
          fetch('https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson'),
          fetch('https://raw.githubusercontent.com/datameet/maps/master/Country/india-composite.geojson').catch(() => null)
        ]);

        if (!worldRes.ok) throw new Error('Failed to load world borders');
        const worldData = await worldRes.json();
        let indiaData = null;
        if (indiaRes && indiaRes.ok) {
          indiaData = await indiaRes.json();
        }

        // Remove existing India feature from world data to avoid overlap
        if (worldData.features) {
          worldData.features = worldData.features.filter((f: any) => {
            const name = (f.properties?.name || f.properties?.NAME || '').toLowerCase();
            const id = (f.id || f.properties?.id || f.properties?.ISO_A3 || '').toLowerCase();
            return name !== 'india' && id !== 'ind';
          });

          if (indiaData && indiaData.features) {
            // Add name property to India features so it works with click handler
            indiaData.features.forEach((f: any) => {
              f.properties = f.properties || {};
              // Preserve state name if available, otherwise default to India
              f.properties.name = f.properties.ST_NM || f.properties.state_name || 'India';
              f.properties.isIndiaState = true;
            });
            worldData.features.push(...indiaData.features);
          }

          // Fix winding order for reversed polygons
          worldData.features.forEach((f: any) => {
            if (geoArea(f) > 2 * Math.PI) {
              if (f.geometry.type === 'Polygon') {
                f.geometry.coordinates.forEach((ring: any) => ring.reverse());
              } else if (f.geometry.type === 'MultiPolygon') {
                f.geometry.coordinates.forEach((polygon: any) => {
                  polygon.forEach((ring: any) => ring.reverse());
                });
              }
            }
          });
          setGeoJson(worldData);
        }
      } catch (err) {
        console.error("Failed to load geojson", err);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    realTimeRef.current = performance.now();
  }, [timeMultiplier, rotationMode]);

  useEffect(() => {
    const loop = () => {
      const now = performance.now();
      const delta = now - realTimeRef.current;
      realTimeRef.current = now;
      
      baseTimeRef.current += delta * timeMultiplier;
      const simulatedTime = new Date(baseTimeRef.current);
      setCurrentTime(simulatedTime);

      const sunCoords = getSubsolarPoint(simulatedTime);
      const moonCoords = getSublunarPoint(simulatedTime);

      if (rotationMode === 'sun') {
        setEarthRotation(0);
        setSunPos(latLongToVector3(sunCoords.lat, sunCoords.lon, 50));
        setMoonPos(latLongToVector3(moonCoords.lat, moonCoords.lon, 15));
      } else {
        // Rotate Earth so that the Sun is always at longitude 0
        setEarthRotation(-sunCoords.lon * (Math.PI / 180));
        setSunPos(latLongToVector3(sunCoords.lat, 0, 50));
        // Moon relative to Sun
        setMoonPos(latLongToVector3(moonCoords.lat, moonCoords.lon - sunCoords.lon, 15));
      }

      reqRef.current = requestAnimationFrame(loop);
    };
    reqRef.current = requestAnimationFrame(loop);
    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, [timeMultiplier, rotationMode]);

  return (
    <div className="w-full h-full bg-black relative">
      <Canvas 
        camera={{ position: [5.5, 2, -1], fov: 45, near: 0.01, far: 1000 }}
        gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.5 }}
      >
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.015} />
        <MovingStars />
        
        <React.Suspense fallback={null}>
          <group rotation-y={earthRotation}>
            <Earth sunPosition={sunPos} geoJson={geoJson} selectedFeature={selectedFeature} onClick={handleEarthClick} />
            {showISS && <ISSTracker simulatedTime={currentTime} />}
            {showStarlink && <StarlinkSwarm simulatedTime={currentTime} />}
          </group>
          <Moon position={moonPos} sunPosition={sunPos} />
          <Sun position={sunPos} />
        </React.Suspense>
        
        <OrbitControls 
          enableZoom={true} 
          enablePan={true} 
          enableRotate={true}
          minDistance={2.02}
          maxDistance={50}
          zoomSpeed={0.6}
          enableDamping={true}
          dampingFactor={0.05}
        />
      </Canvas>
      
      {/* Controls Panel */}
      <div className="absolute bottom-6 left-6 z-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white flex flex-col gap-4">
        
        {/* Time Controls */}
        <div>
          <div className="text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Time Controls</div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleSpeedChange(1)}
              className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-white/10 hover:bg-white/20 text-white/80"
            >
              Present
            </button>
            {[1, 60, 3600, 86400].map(mult => (
              <button 
                key={mult}
                onClick={() => handleSpeedChange(mult)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${timeMultiplier === mult ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}`}
              >
                {mult === 1 ? '1x' : mult === 60 ? '1m/s' : mult === 3600 ? '1h/s' : '1d/s'}
              </button>
            ))}
          </div>
          <div className="mt-2 font-mono text-sm text-blue-300">
            UTC: {currentTime.toISOString().replace('T', ' ').substring(0, 19)}
          </div>
        </div>

        {/* View Controls */}
        <div>
          <div className="text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Rotation Mode</div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setRotationMode('sun')} 
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${rotationMode === 'sun' ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}`}
            >
              Rotate Sun
            </button>
            <button 
              onClick={() => setRotationMode('earth')} 
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${rotationMode === 'earth' ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}`}
            >
              Rotate Earth
            </button>
          </div>
        </div>

        {/* Layers */}
        <div>
          <div className="text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Layers</div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowISS(!showISS)} 
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${showISS ? 'bg-green-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}`}
            >
              ISS
            </button>
            <button 
              onClick={() => setShowStarlink(!showStarlink)} 
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${showStarlink ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}`}
            >
              Starlink
            </button>
          </div>
        </div>

      </div>

      {/* Location Popup */}
      {locationData && (
        <div className="absolute top-24 right-6 bg-black/80 backdrop-blur-md border border-white/20 rounded-xl p-5 text-white w-80 shadow-2xl z-10 pointer-events-auto">
          <button onClick={() => setLocationData(null)} className="absolute top-3 right-3 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-semibold mb-1 leading-tight flex items-center gap-2">
            {locationData.countryCode && (
              <img 
                src={`https://flagcdn.com/w40/${locationData.countryCode.toLowerCase()}.png`} 
                alt={locationData.countryCode} 
                className="w-6 h-4 object-cover rounded-sm" 
              />
            )}
            {locationData.loadingLocation ? (
              <span className="animate-pulse">Locating...</span>
            ) : (
              <div className="flex flex-col">
                <span className="text-lg font-bold">
                  {locationData.district || locationData.state || locationData.country || 'Ocean / Uncharted Territory'}
                </span>
                {(locationData.state || locationData.district) && locationData.country && (
                  <span className="text-sm text-gray-400 font-normal">
                    {locationData.country}
                  </span>
                )}
              </div>
            )}
          </h3>
          <div className="text-xs text-gray-400 mb-4">
            {Math.abs(locationData.lat).toFixed(2)}° {locationData.lat >= 0 ? 'N' : 'S'}, {Math.abs(locationData.lon).toFixed(2)}° {locationData.lon >= 0 ? 'E' : 'W'}
          </div>
          
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">Local Time</div>
              <div className="text-xl font-light text-blue-300">
                {formatTime(currentTime, locationData.tz)}
              </div>
              <div className="text-sm text-gray-300">
                {formatDate(currentTime, locationData.tz)}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1"><Sunrise className="w-3 h-3"/> Sunrise</div>
                <div className="text-sm">{formatTime(locationData.sunrise, locationData.tz)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1"><Sunset className="w-3 h-3"/> Sunset</div>
                <div className="text-sm">{formatTime(locationData.sunset, locationData.tz)}</div>
              </div>
            </div>

            {news.length > 0 && (
              <div className="pt-3 border-t border-white/10">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Live News</div>
                <div className="space-y-2">
                  {news.map((item, idx) => (
                    <a key={idx} href={item.url} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-300 hover:text-blue-200 bg-white/5 p-2 rounded border border-white/5 leading-snug transition-colors">
                      {item.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
