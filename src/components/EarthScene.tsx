import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, useTexture, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import * as SunCalc from 'suncalc';
import tzlookup from 'tz-lookup';
import { X, Sunrise, Sunset, Moon as MoonIcon } from 'lucide-react';
import { geoContains, geoArea } from 'd3-geo';

const sunVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunFragmentShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vPosition;

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
    // Generate multiple layers of noise for surface activity
    float n1 = snoise(vPosition * 1.5 + time * 0.2);
    float n2 = snoise(vPosition * 3.0 - time * 0.3);
    float n3 = snoise(vPosition * 6.0 + time * 0.5);
    
    // Combine noise layers
    float noise = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2);
    
    // Map noise to colors
    vec3 colorDark = vec3(0.8, 0.2, 0.0);    // Deep red/orange
    vec3 colorMid = vec3(1.0, 0.6, 0.1);     // Bright orange
    vec3 colorLight = vec3(1.0, 0.95, 0.8);  // White hot
    
    vec3 finalColor = mix(colorDark, colorMid, smoothstep(-0.5, 0.2, noise));
    finalColor = mix(finalColor, colorLight, smoothstep(0.2, 0.8, noise));
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const coronaVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const coronaFragmentShader = `
  uniform float time;
  varying vec2 vUv;
  
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
    vec2 center = vec2(0.5, 0.5);
    vec2 pos = vUv - center;
    float dist = length(pos);
    
    // Angle for radial noise
    float angle = atan(pos.y, pos.x);
    
    // Volumetric flares using 3D noise
    // Map polar coordinates to a cylinder in 3D space, moving through time
    vec3 noisePos1 = vec3(cos(angle) * 4.0, sin(angle) * 4.0, dist * 10.0 - time * 1.5);
    vec3 noisePos2 = vec3(cos(angle) * 8.0, sin(angle) * 8.0, dist * 20.0 - time * 2.5);
    
    float n1 = snoise(noisePos1) * 0.5 + 0.5;
    float n2 = snoise(noisePos2) * 0.5 + 0.5;
    
    // Combine noise for flare shapes
    float flareNoise = n1 * 0.7 + n2 * 0.3;
    
    // Create distinct, erupting flare spikes
    float flares = pow(max(0.0, flareNoise - 0.2), 3.0) * 0.4;
    
    // Add some low-frequency pulsing
    float pulse = sin(time * 0.5) * 0.01 + 0.01;
    
    // Base corona radius
    float radius = 0.15 + flares + pulse;
    
    // Smooth falloff
    float intensity = 1.0 - smoothstep(radius, 0.45, dist);
    intensity = pow(intensity, 2.0); // Sharper falloff
    
    // Color gradient from white-hot core to orange edge
    vec3 coreColor = vec3(1.0, 0.9, 0.7);
    vec3 edgeColor = vec3(1.0, 0.3, 0.0);
    vec3 finalColor = mix(edgeColor, coreColor, intensity);
    
    // Fade out completely at the edges
    float alpha = intensity * smoothstep(0.5, 0.2, dist);
    
    // Add extra brightness and heat to the flares
    finalColor += vec3(1.0, 0.6, 0.1) * flares * 3.0 * alpha;
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

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
  const start = new Date(date.getUTCFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (date.getUTCHours() - 12) / 24);

  const eqTime = 229.18 * (
      0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma)
  );

  const decl = 0.006918 -
      0.399912 * Math.cos(gamma) +
      0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) +
      0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) +
      0.00148 * Math.sin(3 * gamma);

  const lat = decl * (180 / Math.PI);
  const timeOffset = eqTime;
  const tst = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + timeOffset;
  let ha = (tst / 4) - 180;
  let lon = -ha;
  
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  return { lat, lon };
}

// Sublunar point using SunCalc
function getSublunarPoint(date: Date) {
  let lat = 0;
  let lon = 0;
  let maxAlt = -Infinity;
  
  for(let i=-90; i<=90; i+=30) {
      for(let j=-180; j<=180; j+=30) {
          const alt = SunCalc.getMoonPosition(date, i, j).altitude;
          if(alt > maxAlt) {
              maxAlt = alt;
              lat = i;
              lon = j;
          }
      }
  }
  
  let step = 10;
  for(let iter=0; iter<8; iter++) {
      let bestLat = lat;
      let bestLon = lon;
      for(let i = lat - step; i <= lat + step; i += step/2) {
          for(let j = lon - step; j <= lon + step; j += step/2) {
              const testLat = Math.max(-90, Math.min(90, i));
              let testLon = j;
              if (testLon > 180) testLon -= 360;
              if (testLon < -180) testLon += 360;
              
              const alt = SunCalc.getMoonPosition(date, testLat, testLon).altitude;
              if(alt > maxAlt) {
                  maxAlt = alt;
                  bestLat = testLat;
                  bestLon = testLon;
              }
          }
      }
      lat = bestLat;
      lon = bestLon;
      step /= 2;
  }
  return { lat, lon };
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

function ISSTracker() {
  const [issPos, setIssPos] = useState<THREE.Vector3 | null>(null);

  useEffect(() => {
    const fetchISS = async () => {
      try {
        const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
        const data = await res.json();
        // Earth radius is 2. ISS is ~400km above Earth (Earth radius ~6371km).
        // Scale: 2 * (1 + 400/6371) = 2 * 1.0627 = 2.125
        const pos = latLongToVector3(data.latitude, data.longitude, 2.125);
        setIssPos(pos);
      } catch (e) {
        console.error("Failed to fetch ISS data", e);
      }
    };
    fetchISS();
    const interval = setInterval(fetchISS, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!issPos) return null;

  return (
    <group position={issPos}>
      <mesh>
        <boxGeometry args={[0.04, 0.04, 0.04]} />
        <meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={2} />
      </mesh>
      <Html center>
        <div className="flex items-center gap-1 bg-black/80 text-green-400 text-[10px] px-1.5 py-0.5 rounded border border-green-500/50 whitespace-nowrap">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
          ISS
        </div>
      </Html>
    </group>
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

function Moon({ position }: { position: THREE.Vector3 }) {
  const moonMap = useTexture('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg');

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial map={moonMap} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

function Sun({ position }: { position: THREE.Vector3 }) {
  const sunMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const coronaMaterialRef = useRef<THREE.ShaderMaterial>(null);

  const sunUniforms = useMemo(() => ({
    time: { value: 0 }
  }), []);

  const coronaUniforms = useMemo(() => ({
    time: { value: 0 }
  }), []);

  useFrame((state) => {
    if (sunMaterialRef.current) {
      sunMaterialRef.current.uniforms.time.value = state.clock.elapsedTime;
    }
    if (coronaMaterialRef.current) {
      coronaMaterialRef.current.uniforms.time.value = state.clock.elapsedTime;
    }
  });

  const sunTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.1, 'rgba(255, 255, 255, 0.8)');
      gradient.addColorStop(0.3, 'rgba(255, 200, 50, 0.4)');
      gradient.addColorStop(0.6, 'rgba(255, 100, 0, 0.1)');
      gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
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
        <shaderMaterial
          ref={sunMaterialRef}
          uniforms={sunUniforms}
          vertexShader={sunVertexShader}
          fragmentShader={sunFragmentShader}
        />
      </mesh>

      {/* Dynamic Corona / Flares */}
      <sprite scale={[14, 14, 1]}>
        <shaderMaterial
          ref={coronaMaterialRef}
          uniforms={coronaUniforms}
          vertexShader={coronaVertexShader}
          fragmentShader={coronaFragmentShader}
          transparent={true}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* Outer Glow */}
      <sprite scale={[35, 35, 1]}>
        <spriteMaterial map={sunTexture} blending={THREE.AdditiveBlending} depthWrite={false} transparent />
      </sprite>
    </group>
  );
}

function SelectedCountryBorder({ feature }: { feature: any }) {
  const [borderPoints, setBorderPoints] = useState<THREE.Vector3[]>([]);

  useEffect(() => {
    if (!feature || !feature.geometry) {
      setBorderPoints([]);
      return;
    }
    const points: THREE.Vector3[] = [];
    const geom = feature.geometry;
    const coords = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    
    coords.forEach((polygon: any) => {
      polygon.forEach((ring: any) => {
        for (let i = 0; i < ring.length - 1; i++) {
          // Render slightly higher than the base borders to avoid z-fighting
          const p1 = latLongToVector3(ring[i][1], ring[i][0], 2.004);
          const p2 = latLongToVector3(ring[i+1][1], ring[i+1][0], 2.004);
          points.push(p1, p2);
        }
      });
    });
    setBorderPoints(points);
  }, [feature]);

  if (!borderPoints.length) return null;

  return (
    <Line 
      points={borderPoints} 
      segments 
      color="#3b82f6" 
      lineWidth={3} 
      transparent 
      opacity={1} 
      depthTest={false} 
    />
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
  const [locationData, setLocationData] = useState<{
    lat: number, 
    lon: number, 
    tz: string, 
    sunrise: Date|null, 
    sunset: Date|null, 
    moonPhase: number,
    country?: string,
    state?: string,
    city?: string,
    loadingLocation?: boolean
  } | null>(null);

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
      if (geoJson) {
        const clickedFeature = geoJson.features.find((f: any) => geoContains(f, [lon, lat]));
        setSelectedFeature(clickedFeature || null);
        if (clickedFeature && clickedFeature.properties) {
          clickedCountryName = clickedFeature.properties.name || clickedFeature.properties.NAME;
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
          country: clickedCountryName // Set initial country name from GeoJSON
        });

        try {
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
          const data = await res.json();
          
          setLocationData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              loadingLocation: false,
              country: data.countryName,
              state: data.principalSubdivision,
              city: data.city || data.locality
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
    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
      .then(res => res.json())
      .then(data => {
        // Fix winding order for reversed polygons (like Bermuda)
        data.features.forEach((f: any) => {
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
        setGeoJson(data);
      })
      .catch(err => console.error("Failed to load geojson", err));

    const updatePositions = () => {
      const now = new Date();
      setCurrentTime(now);

      // Calculate Sun position (scaled out to distance 50)
      const sunCoords = getSubsolarPoint(now);
      setSunPos(latLongToVector3(sunCoords.lat, sunCoords.lon, 50));

      // Calculate Moon position (scaled out to distance 15)
      const moonCoords = getSublunarPoint(now);
      setMoonPos(latLongToVector3(moonCoords.lat, moonCoords.lon, 15));
    };

    // Update immediately
    updatePositions();

    // Update every minute to keep it live
    const interval = setInterval(updatePositions, 60000);
    return () => clearInterval(interval);
  }, []);

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
          <Earth sunPosition={sunPos} geoJson={geoJson} selectedFeature={selectedFeature} onClick={handleEarthClick} />
          <Moon position={moonPos} />
          <Sun position={sunPos} />
          <ISSTracker />
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
      
      {/* Live Time Indicator */}
      <div className="absolute bottom-6 left-6 bg-black/50 backdrop-blur-md border border-white/10 rounded-lg px-4 py-2 text-white font-mono text-sm pointer-events-none">
        Live UTC: {currentTime.toISOString().replace('T', ' ').substring(0, 19)}
      </div>

      {/* Location Popup */}
      {locationData && (
        <div className="absolute top-24 right-6 bg-black/80 backdrop-blur-md border border-white/20 rounded-xl p-5 text-white w-80 shadow-2xl z-10 pointer-events-auto">
          <button onClick={() => setLocationData(null)} className="absolute top-3 right-3 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-semibold mb-1 leading-tight">
            {locationData.loadingLocation ? (
              <span className="animate-pulse">Locating...</span>
            ) : (
              locationData.city || locationData.state || locationData.country 
                ? [locationData.city, locationData.state, locationData.country].filter(Boolean).join(', ')
                : 'Ocean / Uncharted Territory'
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
