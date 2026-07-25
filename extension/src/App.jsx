import React, { useRef, useEffect, useMemo, Suspense, useContext } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import stars from '../../data-pipeline/starsHYG3.json';
import nonStars from '../../data-pipeline/non-stars.json';
import './App.css';
import { Html, useTexture, Billboard } from '@react-three/drei';
import { io } from 'socket.io-client';

const GLOBAL_CONFIG = {
  LATITUDE: 28.47,
  LONGITUDE: 77.50,
  HEADING: 0,
  PITCH: 0,
  ROLL: 0,
  IS_LIVE: false
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

// --- DYNAMIC SUN ...AB HATH MAT LAGA DENA 😭 ---
const DynamicSun = () => {
  const timeRef = useContext(TimeContext);

  const getSunPos = () => {
    const now = timeRef.current.utcTime;
    const jd = (now.getTime() / 86400000) + 2440587.5;   // this is used by sciencetists since jan 1 4713BC called Julian Date
    const d = jd - 2451545.0;   // now i have todays julian date in milliseconds

    const L = (280.460 + 0.9856474 * d) % 360;    // this is the mean longitude, assumed a circular orbit , here
    // the 280.shit is the suns posiiton in epoch (where the sun was starting), and the 0.9... shi is the 
    // amount of degree sun appears to be moved (the revolution shit).
    const g = (357.528 + 0.9856003 * d) % 360;
    const gRad = g * (Math.PI / 180);

    const lambda = L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);  // as the orbit is ellipse and not circle
    const lambdaRad = lambda * (Math.PI / 180);    // as we need the sun's position along the ellyptical plane

    const epsilon = 23.439 - 0.0000004 * d;
    const epsRad = epsilon * (Math.PI / 180);

    const radius = 290;
    const x = radius * Math.cos(lambdaRad);
    const y = radius * Math.cos(epsRad) * Math.sin(lambdaRad);
    const z = radius * Math.sin(epsRad) * Math.sin(lambdaRad);

    return [x, z, -y];
  };
// why import when i am using it rarely duhh...gotta make the app light this time💀
  const [sunPos, setSunPos] = React.useState(getSunPos());

  useFrame(() => {
    const newPos = getSunPos();

    if (
      // so i don't wanna render the sun everytime, so it will move only when there is a difference of strictly more than 0.1 deg in any of the dimenssions
      Math.abs(sunPos[0] - newPos[0]) > 0.1 ||
      Math.abs(sunPos[1] - newPos[1]) > 0.1 ||
      Math.abs(sunPos[2] - newPos[2]) > 0.1
    ) {
      setSunPos(newPos);
    }
  });
// the sun is 2D, so using BILLBOARD so that it constantly faces the camera
// so this modelViewMatrix is used to calculate the position, rotatin, scale in virtual page(3D) and combine it with camera's position to determine which exact shit to glow in the
// 
  return (
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
  const skyDomeRef = useRef();
  const timeRef = useContext(TimeContext);

  useFrame(() => {
    if (!starsGroupRef.current) return;

    const now = timeRef.current.utcTime;
    const jd = (now.getTime() / 86400000) + 2440587.5;
    const d = jd - 2451545.0;
    const gmst = 280.46061837 + 360.98564736629 * d;

    const lst = gmst + GLOBAL_CONFIG.LONGITUDE;
    const rotationY = -((lst + 90) % 360) * (Math.PI / 180);
    starsGroupRef.current.rotation.y = rotationY;

    skyDomeRef.current.rotation.x = -(90 - GLOBAL_CONFIG.LATITUDE) * (Math.PI / 180);
  });

  return (
    <group ref={skyDomeRef}>
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

const bvToRGB = (bv) => {
  if (bv === null || bv === undefined) return [0.9, 0.9, 1.0];

  let t = Math.max(-0.4, Math.min(bv, 2.0));
  let r = 0, g = 0, b = 0;

  if (t < 0.0) {
    r = 0.61 + 0.11 * (t + 0.4) / 0.4;
    g = 0.70 + 0.07 * (t + 0.4) / 0.4;
    b = 1.0;
  } else if (t < 0.4) {
    r = 0.83 + 0.17 * (t / 0.4);
    g = 0.87 + 0.11 * (t / 0.4);
    b = 1.0;
  } else if (t < 1.6) {
    r = 1.0;
    g = 0.98 - 0.16 * (t - 0.4) / 1.2;
    b = t < 1.0 ? 1.0 - 0.37 * (t - 0.4) / 0.6 : 0.63 - 0.63 * (t - 1.0) / 0.6;
  } else {
    r = 1.0;
    g = 0.82 - 0.5 * (t - 1.6) / 0.4;
    b = 0.0;
  }

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
      right: '135px',
      width: '85px',
      height: '85px',
      borderRadius: '50%',
      background: 'rgba(15, 15, 20, 0.65)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8), 0 8px 32px rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 1000,
      overflow: 'hidden'
    }}>

      <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.05)' }} />
      <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.05)' }} />

      <div id="radar-dot" style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: '#38bdf8',
        boxShadow: '0 0 10px #38bdf8, inset 0 0 4px rgba(255,255,255,0.8)',
        transform: 'translate(-50%, -50%)',
        transition: 'opacity 0.2s ease',
        willChange: 'transform'
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
  "m31": { file: "m31.png", color: "#e5e7eb", label: "M31" }
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
  const rot = useRef({ yaw: 0, pitch: 0, roll: 0 });

  useEffect(() => {
    const handleMove = (e) => {
      if (mouse.current.isDragging && !GLOBAL_CONFIG.IS_LIVE) {
        rot.current.yaw += e.movementX * 0.0015;
        rot.current.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rot.current.pitch + e.movementY * 0.0015));
        rot.current.roll = 0;
      }
    };
    window.addEventListener('mousedown', () => mouse.current.isDragging = true);
    window.addEventListener('mouseup', () => mouse.current.isDragging = false);
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  useFrame(() => {
    if (GLOBAL_CONFIG.IS_LIVE) {

      const targetPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, GLOBAL_CONFIG.PITCH));
      rot.current.pitch += (targetPitch - rot.current.pitch) * 0.08;

      const targetYaw = -GLOBAL_CONFIG.HEADING * (Math.PI / 180);

      let deltaYaw = targetYaw - (rot.current.yaw % (Math.PI * 2));

      if (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
      if (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;

      rot.current.yaw += deltaYaw * 0.08;
      rot.current.roll = 0;
    }

    camera.quaternion.setFromEuler(new THREE.Euler(rot.current.pitch, rot.current.yaw, rot.current.roll, 'YXZ'));

    const compassDisc = document.getElementById('compass-disc');
    if (compassDisc) {
      const yawDeg = rot.current.yaw * (180 / Math.PI);
      compassDisc.style.transform = `rotate(${yawDeg}deg)`;
    }

    const radarDot = document.getElementById('radar-dot');
    if (radarDot) {
      const maxRadius = 35;
      const distance = Math.cos(rot.current.pitch) * maxRadius;
      const dotX = Math.sin(-rot.current.yaw) * distance;
      const dotY = -Math.cos(-rot.current.yaw) * distance;
      radarDot.style.transform = `translate(calc(-50% + ${dotX}px), calc(-50% + ${dotY}px))`;
      radarDot.style.opacity = rot.current.pitch < 0 ? 0.3 : 1.0;
    }
  });

  return null;
};

// PLANET SHIT 
// a - avg dis from planet to sun, 1Au is dis from earth to sun
// e - ecentricity - 0 - circle and makes oval with increase
// i - tilt of orbit
// N - where it crosses earths orbit from south to north
// w - angle 
// M0 - starting pos of planet in it's orbit
// rateM - avg speed of planet
const KEPLER_ELEMENTS = {
  Earth:   { N: 0.0,      dN: 0.0,          i: 0.0,    di: 0.0,          w: 282.9404, dw: 4.70935E-5, a: 1.000000, e: 0.016709, de: -1.151E-9, M0: 356.0470, rateM: 0.9856002585 },
  Mercury: { N: 48.3313,  dN: 3.24587E-5,   i: 7.0047, di: 5.00E-8,      w: 29.1241,  dw: 1.01444E-5, a: 0.387098, e: 0.205635, de: 5.59E-10,  M0: 168.6562, rateM: 4.0923344368 },
  Venus:   { N: 76.6807,  dN: 2.46590E-5,   i: 3.3947, di: 2.75E-8,      w: 54.8910,  dw: 1.38374E-5, a: 0.723332, e: 0.006773, de: -1.302E-9, M0: 48.0201,  rateM: 1.6021302244 },
  Mars:    { N: 49.5595,  dN: 2.11081E-5,   i: 1.8497, di: -1.78E-8,     w: 286.5016, dw: 2.92961E-5, a: 1.523679, e: 0.093401, de: 2.516E-9,  M0: 19.3871,  rateM: 0.5240207666 },
  Jupiter: { N: 100.4645, dN: 2.76854E-5,   i: 1.3030, di: -1.557E-7,    w: 273.8668, dw: 1.64505E-5, a: 5.202603, e: 0.048498, de: 4.469E-9,  M0: 20.0202,  rateM: 0.0830852940 },
  Saturn:  { N: 113.6655, dN: 2.38980E-5,   i: 2.4886, di: -1.081E-7,    w: 339.3939, dw: 2.97661E-5, a: 9.554909, e: 0.055546, de: -9.499E-9, M0: 317.0207, rateM: 0.0334442282 }
};

const computeHeliocentric = (elements, d) => {
  const rad = Math.PI / 180;
  const N = elements.N + (elements.dN * d);
  const i = elements.i + (elements.di * d);
  const w = elements.w + (elements.dw * d);
  const a = elements.a; 
  const e = elements.e + (elements.de * d);
  const M = elements.M0 + (elements.rateM * d);
  let M_rad = (M % 360) * rad;

  if (M_rad < 0) M_rad += 2 * Math.PI; 

  let E_rad = M_rad + e * Math.sin(M_rad) * (1.0 + e * Math.cos(M_rad));
  let delta = 1;
  let tmp = 0;
  
  while (Math.abs(delta) > 1e-6 && tmp < 5) {
    delta = E_rad - e * Math.sin(E_rad) - M_rad;
    E_rad = E_rad - delta / (1 - e * Math.cos(E_rad));
    tmp++;
  }
  
  const xv = a * (Math.cos(E_rad) - e);
  const yv = a * (Math.sqrt(1.0 - e * e) * Math.sin(E_rad));
  
  // MUJHE MAT HATANA RE...x y coordinate ko "ANGLE" me badalta hu re
  const v = Math.atan2(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  
  // juts converting one shit into another . ITS WORKKING>>>>>>>>>
  const xh = r * (Math.cos(N * rad) * Math.cos(v + w * rad) - Math.sin(N * rad) * Math.sin(v + w * rad) * Math.cos(i * rad));
  const yh = r * (Math.sin(N * rad) * Math.cos(v + w * rad) + Math.cos(N * rad) * Math.sin(v + w * rad) * Math.cos(i * rad));
  const zh = r * (Math.sin(v + w * rad) * Math.sin(i * rad));
  
  return { x: xh, y: yh, z: zh };
};

//  SATURN RINGS AKA PYAAZ 😭
const SaturnRings = ({ size }) => {
  const ringTexture = useTexture("/saturnRings.png");
  return (
    // Rotate 90 DEG
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      {/* inner radius is planets equator, and outside  is also outer */}
      <ringGeometry args={[size * 1.3, size * 2.4, 64]} />
      {/* if saturn is on top, rings must be seen, this is not unity ... */}
      <meshBasicMaterial map={ringTexture} transparent={true} side={THREE.DoubleSide} opacity={0.9} />
    </mesh>
  );
};

//  MOVING PLANETS (DYNAMIC PLANET FUNCTINO)
const DynamicPlanet = ({ name, textureUrl, size = 3 }) => {
  const timeRef = useContext(TimeContext);
  const texture = useTexture(textureUrl);

  const getPlanetPos = () => {
    const now = timeRef.current.utcTime;
    const d = (now.getTime() / 86400000) + 2440587.5 - 2451545.0;

    const earthHelio = computeHeliocentric(KEPLER_ELEMENTS.Earth, d);
    const planetHelio = computeHeliocentric(KEPLER_ELEMENTS[name], d);

    // getting har ek planet ki location.
    const geoX = planetHelio.x - earthHelio.x;
    const geoY = planetHelio.y - earthHelio.y;
    const geoZ = planetHelio.z - earthHelio.z;

    // tilting the planets as per earth's axis.
    const ecl = 23.439281 * (Math.PI / 180);
    const eqX = geoX;
    const eqY = geoY * Math.cos(ecl) - geoZ * Math.sin(ecl);
    const eqZ = geoY * Math.sin(ecl) + geoZ * Math.cos(ecl);

    // ṣtick the small balls on the larger one 💀
    const dist = Math.sqrt(eqX * eqX + eqY * eqY + eqZ * eqZ);
    const finalX = (eqX / dist) * 290;
    const finalY = (eqY / dist) * 290;
    const finalZ = (eqZ / dist) * 290;

    return [finalX, finalZ, -finalY];
  };

  const [pos, setPos] = React.useState(getPlanetPos());

  useFrame(() => {
    const newPos = getPlanetPos();
    if (
      Math.abs(pos[0] - newPos[0]) > 0.1 ||
      Math.abs(pos[1] - newPos[1]) > 0.1 ||
      Math.abs(pos[2] - newPos[2]) > 0.1
    ) {
      setPos(newPos);
    }
  });

  return (
    <group position={pos}>
      {/* Add a slight tilt to Saturn so the ring surface is visible, otherwise keep it at 0 */}
      <group rotation={[name === 'Saturn' ? 0.4 : 0, 0, 0]}>
        <mesh>
          <sphereGeometry args={[size, 32, 32]} />
          <meshBasicMaterial map={texture} />
        </mesh>
        
        {/* Conditionally render the rings only if this specific planet is Saturn */}
        {name === 'Saturn' && <SaturnRings size={size} />}
      </group>
      
      <Html center zIndexRange={[100, 0]}>
        <div style={{ color: '#ffffff', marginTop: '55px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', pointerEvents: 'none' }}>
          {name}
        </div>
      </Html>
    </group>
  );
};
const GlassSearchBar = () => {
  // juts using bgdropFilter blur...easy
  return (
    <div style={{
      position: 'absolute',
      bottom: '18%',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '40%',
      minWidth: '400px',
      maxWidth: '600px',
      zIndex: 1000,
    }}>
      <form action="https://www.google.com/search" method="GET" style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(15, 15, 20, 0.45)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        padding: '16px 24px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
      }}>
        {/* making the search icon --- just a circle and a tilted line. */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#65628c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>

        <input
          type="text" 
          name="q" 
          placeholder="Search the web..." 
          autoComplete="off"
          autoFocus
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#ffffff',
            fontSize: '17px',
            marginLeft: '16px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            letterSpacing: '0.5px'
          }} 
        />
      </form>
    </div>
  );
};
const App = () => {
  useEffect(() => {
    const socket = io('http://10.133.69.114:3000');

    socket.on('mobile_data_stream', (data) => {
      GLOBAL_CONFIG.LATITUDE = data.latitude;
      GLOBAL_CONFIG.LONGITUDE = data.longitude;
      GLOBAL_CONFIG.HEADING = data.heading;
      GLOBAL_CONFIG.PITCH = data.pitch;
      GLOBAL_CONFIG.ROLL = data.yaw;
      GLOBAL_CONFIG.IS_LIVE = true;
    });

    socket.on('disconnect', () => {
      GLOBAL_CONFIG.IS_LIVE = false;
    });

    return () => socket.disconnect();
  }, []);
  const { positions, sizes, colors } = useMemo(() => {

    const realStars = stars.filter(s => s.proper !== "Sun");

    const pos = new Float32Array(realStars.length * 3);
    const col = new Float32Array(realStars.length * 3);
    const siz = new Float32Array(realStars.length);

    realStars.forEach((s, i) => {
      const magV = Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2);


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
      position: [(s.x / magV) * 290, (s.z / magV) * 290, (-s.y / magV) * 290],
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

            <DynamicSun />
            <Suspense fallback={null}>
              <DynamicPlanet name="Venus" textureUrl="/`venus.jpg" size={4.5} />
              <DynamicPlanet name="Mars" textureUrl="/mars.jpg" size={3.5} />
              <DynamicPlanet name="Jupiter" textureUrl="/jupiter.jpg" size={7} />
              <DynamicPlanet name="Saturn" textureUrl="/saturn.jpg" size={6} />
            </Suspense>
          </StarSphere>
        </TimeProvider>
      </Canvas>
      <CompassOverlay />
      <SkyRadarOverlay />
      <GlassSearchBar />
    </div>
  );
};

export default App;