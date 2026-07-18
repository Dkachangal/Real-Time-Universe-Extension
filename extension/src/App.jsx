import React, { useRef, useEffect, useMemo, Suspense, useContext } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import stars from '../../data-pipeline/starsHYG3.json';
import nonStars from '../../data-pipeline/non-stars.json';
import './App.css';
import { Html, useTexture, Billboard } from '@react-three/drei';

const GLOBAL_CONFIG = {
  LATITUDE: 28.47,  // Greater Noida
  LONGITUDE: 77.50, // Greater Noida
  GYRO: { yaw: 0, pitch: 0, roll: 0 }
};

const TimeContext = React.createContext();

const TimeProvider = ({ children }) => {
  const timeRef = useRef({ utcTime: new Date(), delta: 0 });
  useFrame((state, delta) => {
    timeRef.current.utcTime = new Date(timeRef.current.utcTime.getTime() + delta * 1000);
    timeRef.current.delta = delta;
  });
  return <TimeContext.Provider value={timeRef}>{children}</TimeContext.Provider>;
};

// --- NEW: DYNAMIC SUN COMPONENT ---
const DynamicSun = () => {
  const timeRef = useContext(TimeContext);

  // Helper to calculate orbital position so we can use it in state
  const getSunPos = () => {
    const now = timeRef.current.utcTime;
    const jd = (now.getTime() / 86400000) + 2440587.5;
    const d = jd - 2451545.0; 

    const L = (280.460 + 0.9856474 * d) % 360;
    const g = (357.528 + 0.9856003 * d) % 360;
    const gRad = g * (Math.PI / 180);

    const lambda = L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);
    const lambdaRad = lambda * (Math.PI / 180);

    const epsilon = 23.439 - 0.0000004 * d;
    const epsRad = epsilon * (Math.PI / 180);

    const radius = 290;
    const x = radius * Math.cos(lambdaRad);
    const y = radius * Math.cos(epsRad) * Math.sin(lambdaRad);
    const z = radius * Math.sin(epsRad) * Math.sin(lambdaRad);

    // Return the Cartesian coordinates with our X, Z, -Y swap
    return [x, z, -y];
  };

  // Set the initial position into React state
  const [sunPos, setSunPos] = React.useState(getSunPos());

  useFrame(() => {
    const newPos = getSunPos();
    
    // To prevent React from lagging with 60fps state updates, 
    // we only update the state if the Sun physically moves a meaningful distance.
    // (In a real-time simulation, it moves 1 degree per day, so it stays firmly locked)
    if (
      Math.abs(sunPos[0] - newPos[0]) > 0.1 ||
      Math.abs(sunPos[1] - newPos[1]) > 0.1 ||
      Math.abs(sunPos[2] - newPos[2]) > 0.1
    ) {
      setSunPos(newPos);
    }
  });

  return (
    // Passing the state array directly into the position prop rigidly locks the HTML!
    <group position={sunPos}>
      <Billboard>
        <mesh>
          <planeGeometry args={[30, 30]} />
          <shaderMaterial
            transparent={true}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            vertexShader={`
              varying vec2 vUv; 
              void main() { 
                vUv = uv; 
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); 
              }
            `}
            fragmentShader={`
              varying vec2 vUv;
              void main() {
                float dist = distance(vUv, vec2(0.5));
                if (dist > 0.5) discard; 
                
                float alpha = smoothstep(0.5, 0.0, dist);
                vec3 color = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 0.95, 0.8), smoothstep(0.4, 0.0, dist));
                
                gl_FragColor = vec4(color, alpha);
              }
            `}
          />
        </mesh>
      </Billboard>
      <Html center zIndexRange={[100, 0]}>
        <div style={{ color: '#fcd34d', marginTop: '55px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', pointerEvents: 'none' }}>
          Sun
        </div>
      </Html>
    </group>
  );
};

const StarSphere = ({ children, positions, sizes, colors, labeledStars }) => {
  const starsGroupRef = useRef();
  const timeRef = useContext(TimeContext);

  useFrame(() => {
    if (!starsGroupRef.current) return;

    const now = timeRef.current.utcTime;
    const jd = (now.getTime() / 86400000) + 2440587.5;
    const d = jd - 2451545.0;
    const gmst = 280.46061837 + 360.98564736629 * d;
    const lst = gmst + GLOBAL_CONFIG.LONGITUDE;

    // THE FIX: Added + 90 to align Three.js East with Astronomy South
    const rotationY = -((lst + 90) % 360) * (Math.PI / 180);
    starsGroupRef.current.rotation.y = rotationY;
  });

  return (
    <group rotation={[-(90 - GLOBAL_CONFIG.LATITUDE) * (Math.PI / 180), 0, 0]}>
      <group ref={starsGroupRef}>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
            <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
          </bufferGeometry>
          <shaderMaterial attach="material" vertexShader={vertexShader} fragmentShader={fragmentShader} transparent={true} depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>

        {labeledStars.map((star, i) => (
          <Html key={i} position={star.position} center zIndexRange={[100, 0]}>
            <div style={{ color: star.color, fontSize: '9px', textTransform: 'uppercase', pointerEvents: 'none', marginTop: 25 }}>{star.name}</div>
          </Html>
        ))}
        {children}
      </group>
    </group>
  );
};

// Converts standard B-V Color Index to WebGL RGB floats
const bvToRGB = (bv) => {
  // If the catalog is missing the CI data, default to a standard white star
  if (bv === null || bv === undefined) return [0.9, 0.9, 1.0];

  // Clamp the index to the standard astronomical range (-0.4 to 2.0)
  let t = Math.max(-0.4, Math.min(bv, 2.0));
  let r = 0, g = 0, b = 0;

  if (t < 0.0) {
    // Hot Blue stars
    r = 0.61 + 0.11 * (t + 0.4) / 0.4;
    g = 0.70 + 0.07 * (t + 0.4) / 0.4;
    b = 1.0;
  } else if (t < 0.4) {
    // Blue-White to White stars
    r = 0.83 + 0.17 * (t / 0.4);
    g = 0.87 + 0.11 * (t / 0.4);
    b = 1.0;
  } else if (t < 1.6) {
    // Yellow to Orange stars
    r = 1.0;
    g = 0.98 - 0.16 * (t - 0.4) / 1.2;
    b = t < 1.0 ? 1.0 - 0.37 * (t - 0.4) / 0.6 : 0.63 - 0.63 * (t - 1.0) / 0.6;
  } else {
    // Cool Red dwarfs
    r = 1.0;
    g = 0.82 - 0.5 * (t - 1.6) / 0.4;
    b = 0.0;
  }

  // Ensure strict float bounds for the WebGL shader
  return [
    Math.max(0, Math.min(1, r)),
    Math.max(0, Math.min(1, g)),
    Math.max(0, Math.min(1, b))
  ];
};

const CompassOverlay = () => {
  return (
    <div style={{
      position: 'absolute',
      bottom: '30px',
      right: '30px',
      width: '85px',
      height: '85px',
      borderRadius: '50%',
      background: 'rgba(15, 15, 20, 0.65)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 1000,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.5px'
    }}>
      <div id="compass-disc" style={{
        position: 'relative',
        width: '100%',
        height: '100%',
      }}>
        <span style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', color: '#ef4444' }}>N</span>
        <span style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', color: '#a1a1aa' }}>S</span>
        <span style={{ position: 'absolute', top: '50%', right: '8px', transform: 'translateY(-50%)', color: '#a1a1aa' }}>E</span>
        <span style={{ position: 'absolute', top: '50%', left: '8px', transform: 'translateY(-50%)', color: '#a1a1aa' }}>W</span>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '3px',
          height: '3px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.4)'
        }} />
      </div>
    </div>
  );
};

const SkyRadarOverlay = () => {
  return (
    <div style={{
      position: 'absolute',
      bottom: '30px',
      right: '135px', // Sits perfectly to the left of your 85px compass
      width: '85px',
      height: '85px',
      borderRadius: '50%',
      background: 'rgba(15, 15, 20, 0.65)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      // Inner shadow gives it a 3D spherical "bowl" look
      boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8), 0 8px 32px rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 1000,
      overflow: 'hidden'
    }}>
      
      {/* Subtle Crosshairs for the Zenith (Center) */}
      <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.05)' }} />
      <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.05)' }} />

      {/* The Dynamic Inner Ball */}
      <div id="radar-dot" style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: '#38bdf8', // Premium cyan accent
        boxShadow: '0 0 10px #38bdf8, inset 0 0 4px rgba(255,255,255,0.8)',
        transform: 'translate(-50%, -50%)',
        transition: 'opacity 0.2s ease', // Only transition opacity, not transform!
        willChange: 'transform' // Hardware acceleration for buttery movement
      }} />
    </div>
  );
};

const textureMap = {
  "Large Magellanic Cloud": { file: "Cloud.jpg", color: "#d1d5db", label: "LMC" },
  "Pleiades": { file: "Pleiades.png", color: "#7dd3fc", label: "Pleiades" },
  "Helix nebula": { file: "EyeOfGod.png", color: "#22d3ee", label: "Helix Nebula" },
  "Sombrero galaxy": { file: "Sombrero.png", color: "#fef3c7", label: "Sombrero" },
  "Triangulum galaxy": { file: "Triangulum.png", color: "#fb923c", label: "Triangulum" },
  "m31": { file: "m31.png", color: "#e5e7eb", label: "M31" } // Fixed!
};

const DeepSkyObject = ({ data, config }) => {
  const texture = useTexture(`/${config.file}`);
  const magV = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);


  const pos = [
    (data.x / magV) * 290,
    (data.y / magV) * 290,
    (-data.z / magV) * 290
  ];

  return (
    <group position={pos}>
      <Billboard>
        <mesh scale={[15, 15, 1]}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            transparent={true}
            blending={THREE.AdditiveBlending}
            uniforms={{ tDiffuse: { value: texture } }}
            vertexShader={`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
            fragmentShader={`uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 texColor = texture2D(tDiffuse, vUv); float dist = distance(vUv, vec2(0.5)); float mask = smoothstep(0.5, 0.25, dist); gl_FragColor = vec4(texColor.rgb * mask, texColor.a * mask); }`}
          />
        </mesh>
      </Billboard>
      <Html center zIndexRange={[100, 0]}>
        <div style={{ color: config.color, marginTop: '30px', fontSize: '9px', textTransform: 'uppercase', pointerEvents: 'none' }}>
          {config.label}
        </div>
      </Html>
    </group>
  );
};

const DeepSkyManager = () => {
  const active = useMemo(() => nonStars.filter(obj => textureMap[obj.name]).map(obj => ({ ...obj, config: textureMap[obj.name] })), []);
  return <>{active.map((obj, i) => <DeepSkyObject key={i} data={obj} config={obj.config} />)}</>;
};

const vertexShader = `attribute float aSize; attribute vec3 aColor; varying vec3 vColor; void main() { vColor = aColor; vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; gl_PointSize = aSize; }`;
const fragmentShader = `varying vec3 vColor; void main() { vec2 coord = gl_PointCoord - vec2(0.5); float dist = length(coord); if (dist > 0.5) discard; float intensity = 1.0 - (dist * 2.0); intensity = pow(intensity, 1.5); gl_FragColor = vec4(vColor, intensity); }`;

const PlanetariumControls = () => {
  const { camera } = useThree();
  const mouse = useRef({ isDragging: false });
  const rot = useRef({ yaw: 0, pitch: 0 });

  useEffect(() => {
    const handleMove = (e) => {
      if (mouse.current.isDragging) {
        rot.current.yaw += e.movementX * 0.0015;
        rot.current.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rot.current.pitch + e.movementY * 0.0015));
      }
    };
    window.addEventListener('mousedown', () => mouse.current.isDragging = true);
    window.addEventListener('mouseup', () => mouse.current.isDragging = false);
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  useFrame(() => {
    // 1. Update Camera
    camera.quaternion.setFromEuler(new THREE.Euler(rot.current.pitch, rot.current.yaw, 0, 'YXZ'));
    
    // 2. Sync Compass
    const compassDisc = document.getElementById('compass-disc');
    if (compassDisc) {
      const yawDeg = rot.current.yaw * (180 / Math.PI);
      compassDisc.style.transform = `rotate(${yawDeg}deg)`;
    }

    // 3. Sync Sky Radar (Trackball)
    const radarDot = document.getElementById('radar-dot');
    if (radarDot) {
      // Max pixel distance the inner ball can travel from the center
      const maxRadius = 35; 
      
      // Map Pitch to distance from center (cos(90deg) = 0 center, cos(0deg) = 1 edge)
      const distance = Math.cos(rot.current.pitch) * maxRadius;
      
      // Project Yaw to X/Y coordinates
      const dotX = Math.sin(-rot.current.yaw) * distance;
      const dotY = -Math.cos(-rot.current.yaw) * distance;
      
      radarDot.style.transform = `translate(calc(-50% + ${dotX}px), calc(-50% + ${dotY}px))`;
      
      // Optional premium touch: Dim the glowing ball slightly if looking below the horizon
      radarDot.style.opacity = rot.current.pitch < 0 ? 0.3 : 1.0;
    }
  });

  return null;
};

const App = () => {
  const { positions, sizes, colors } = useMemo(() => {
    // Determine how many actual stars we have after filtering the Sun
    const realStars = stars.filter(s => s.proper !== "Sun");

    const pos = new Float32Array(realStars.length * 3);
    const col = new Float32Array(realStars.length * 3);
    const siz = new Float32Array(realStars.length);

    realStars.forEach((s, i) => {
      const magV = Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2);

      // AXIS SWAP: Z becomes Y, Y becomes -Z
      pos[i * 3] = (s.x / magV) * 290;
      pos[i * 3 + 1] = (s.z / magV) * 290;
      pos[i * 3 + 2] = (-s.y / magV) * 290;

      const [r, g, b] = bvToRGB(s.ci);
      col[i * 3] = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;
      siz[i] = (Math.pow(Math.max(0, 6.5 - s.mag), 1.4) * 0.8 + 1.0) * 1.5;
    });
    return { positions: pos, sizes: siz, colors: col };
  }, []);

  const labeledStars = useMemo(() => stars.filter(s => s.mag < 1.5 && s.proper && s.proper !== "Sun").map(s => {
    const magV = Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2);
    const [r, g, b] = bvToRGB(s.ci);
    const cssColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    return {
      name: s.proper,
      position: [(s.x / magV) * 290, (s.z / magV) * 290, (-s.y / magV) * 290], // AXIS SWAP
      color: cssColor
    };
  }), []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas camera={{ position: [0, 0, 0], fov: 60 }}>
        <TimeProvider>
          <PlanetariumControls />
          <ambientLight intensity={0.1} />
          <mesh>
            <sphereGeometry args={[300, 64, 64]} />
            <meshBasicMaterial side={THREE.BackSide} transparent={true} opacity={0.3} color="#080b14" />
          </mesh>
          <StarSphere positions={positions} sizes={sizes} colors={colors} labeledStars={labeledStars}>
            <Suspense fallback={null}><DeepSkyManager /></Suspense>
            {/* The Dynamic Sun is now injected into the rotating StarSphere */}
            <DynamicSun />
          </StarSphere>
        </TimeProvider>
      </Canvas>
      <CompassOverlay />
      <SkyRadarOverlay />
    </div>
  );
};

export default App;