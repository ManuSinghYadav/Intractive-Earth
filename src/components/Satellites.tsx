import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import * as satellite from 'satellite.js';

// Helper to convert lat/lon to 3D vector
function latLongToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

export function ISSTracker({ simulatedTime }: { simulatedTime: Date }) {
  const [tle, setTle] = useState<string[] | null>(null);
  const issRef = useRef<THREE.Group>(null);
  
  useEffect(() => {
    fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle')
      .then(r => r.text())
      .then(t => {
        const lines = t.trim().split('\n');
        if (lines.length >= 3) {
          setTle([lines[1].trim(), lines[2].trim()]);
        }
      })
      .catch(console.error);
  }, []);

  const pathPoints = useMemo(() => {
    if (!tle) return null;
    try {
      const satrec = satellite.twoline2satrec(tle[0], tle[1]);
      const points: THREE.Vector3[] = [];
      // Calculate path for one orbit (~90 minutes)
      const now = new Date();
      for (let i = 0; i <= 90; i++) {
        const d = new Date(now.getTime() + i * 60000);
        const positionAndVelocity = satellite.propagate(satrec, d);
        const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;
        if (positionEci && typeof positionEci.x === 'number') {
          const gmst = satellite.gstime(d);
          const positionGd = satellite.eciToGeodetic(positionEci, gmst);
          const lat = satellite.degreesLat(positionGd.latitude);
          const lon = satellite.degreesLong(positionGd.longitude);
          const height = positionGd.height;
          const radius = 2 * (1 + height / 6371);
          points.push(latLongToVector3(lat, lon, radius));
        }
      }
      return new THREE.BufferGeometry().setFromPoints(points);
    } catch (e) {
      console.error("Error computing ISS path", e);
      return null;
    }
  }, [tle]);

  useFrame(() => {
    if (!tle || !issRef.current) return;
    try {
      const satrec = satellite.twoline2satrec(tle[0], tle[1]);
      const positionAndVelocity = satellite.propagate(satrec, simulatedTime);
      const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;
      if (positionEci && typeof positionEci.x === 'number') {
        const gmst = satellite.gstime(simulatedTime);
        const positionGd = satellite.eciToGeodetic(positionEci, gmst);
        const lat = satellite.degreesLat(positionGd.latitude);
        const lon = satellite.degreesLong(positionGd.longitude);
        const height = positionGd.height;
        const radius = 2 * (1 + height / 6371);
        issRef.current.position.copy(latLongToVector3(lat, lon, radius));
      }
    } catch (e) {
      // ignore propagation errors
    }
  });

  if (!tle) return null;

  return (
    <group>
      <group ref={issRef}>
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
      {pathPoints && (
        <line geometry={pathPoints}>
          <lineBasicMaterial color="#4ade80" transparent opacity={0.3} />
        </line>
      )}
    </group>
  );
}

export function StarlinkSwarm({ simulatedTime }: { simulatedTime: Date }) {
  const [tles, setTles] = useState<{tle1: string, tle2: string}[]>([]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle')
      .then(r => r.text())
      .then(t => {
        const lines = t.trim().split('\n');
        const parsed: {tle1: string, tle2: string}[] = [];
        for (let i = 0; i < lines.length; i += 3) {
          if (lines[i+1] && lines[i+2]) {
            parsed.push({ tle1: lines[i+1].trim(), tle2: lines[i+2].trim() });
          }
        }
        setTles(parsed);
      })
      .catch(console.error);
  }, []);

  useFrame(() => {
    if (!meshRef.current || tles.length === 0) return;
    tles.forEach((tle, i) => {
      try {
        const satrec = satellite.twoline2satrec(tle.tle1, tle.tle2);
        const positionAndVelocity = satellite.propagate(satrec, simulatedTime);
        const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;
        if (positionEci && typeof positionEci.x === 'number') {
          const gmst = satellite.gstime(simulatedTime);
          const positionGd = satellite.eciToGeodetic(positionEci, gmst);
          const lat = satellite.degreesLat(positionGd.latitude);
          const lon = satellite.degreesLong(positionGd.longitude);
          const height = positionGd.height;
          const radius = 2 * (1 + height / 6371);
          const pos = latLongToVector3(lat, lon, radius);
          dummy.position.copy(pos);
          dummy.updateMatrix();
          meshRef.current!.setMatrixAt(i, dummy.matrix);
        }
      } catch (e) {
        // ignore propagation errors for decayed satellites
      }
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (tles.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, tles.length]}>
      <sphereGeometry args={[0.005, 8, 8]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
    </instancedMesh>
  );
}
