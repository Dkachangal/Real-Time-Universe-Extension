import React, { useRef, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import stars from '../../data-pipeline/starsHYG3.json';
import nonStars from '../../data-pipeline/non-stars.json';
import './App.css';

// 1. IMPORT BILLBOARD HERE!
import { Html, useTexture, Billboard } from '@react-three/drei'; 

// --- DEEP SKY OBJECTS LOGIC ---
const textureMap = {
  "Large Magellanic Cloud": { file: "Cloud.jpg", color: "#d1d5db", label: "LMC" },
  "Pleiades": { file: "Pleiades.png", color: "#7dd3fc", label: "Pleiades" },
  "Helix nebula": { file: "EyeOfGod.png", color: "#22d3ee", label: "Helix Nebula" },
  "Sombrero galaxy": { file: "Sombrero.png", color: "#fef3c7", label: "Sombrero" },
  "Triangulum galaxy": { file: "Triangulum.png", color: "#fb923c", label: "Triangulum" },
  "Pin-wheel nebula": { file: "m31.png", color: "#e5e7eb", label: "Andromeda (M31)" }
};

const DeepSkyObject = ({ data, config }) => {
  const texture = useTexture(`/${config.file}`);

  const magnitudeVec = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
  const radius = 290;
  const position = [
    (data.x / magnitudeVec) * radius,
    (data.y / magnitudeVec) * radius,
    (data.z / magnitudeVec) * radius
  ];

  return (
    <group position={position}>
      {/* 1. The Galaxy Image */}
      <Billboard>
        <mesh scale={[15, 15, 1]}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            transparent={true}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            uniforms={{ tDiffuse: { value: texture } }}
            vertexShader={`
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              uniform sampler2D tDiffuse;
              varying vec2 vUv;
              void main() {
                vec4 texColor = texture2D(tDiffuse, vUv);
                float dist = distance(vUv, vec2(0.5));
                float mask = smoothstep(0.5, 0.25, dist);
                gl_FragColor = vec4(texColor.rgb * mask, texColor.a * mask);
              }
            `}
          />
        </mesh>
      </Billboard>

      {/* 2. The Label */}
      <Html center zIndexRange={[100, 0]}>
        <div style={{
          color: config.color, // Using the hardcoded vibe color
          marginTop: '30px', // Extra padding for larger objects
          fontFamily: 'sans-serif',
          fontSize: '10px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          opacity: 0.9,
          pointerEvents: 'none',
          userSelect: 'none',
          textShadow: '0px 0px 5px rgba(0,0,0,0.8)' // Adds readability against the starfield
        }}>
          {config.label}
        </div>
      </Html>
    </group>
  );
};

const DeepSkyManager = () => {
  const activeObjects = useMemo(() => {
    return nonStars
      .filter(obj => textureMap[obj.name])
      .map(obj => ({
        ...obj,
        config: textureMap[obj.name] 
      }));
  }, []);

  return (
    <>
      {activeObjects.map((obj, i) => (
        <DeepSkyObject key={i} data={obj} config={obj.config} />
      ))}
    </>
  );
};
// --- SHADERS ---
const vertexShader = `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  
  void main() {
    vColor = aColor; 
    vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float intensity = 1.0 - (dist * 2.0);
    intensity = pow(intensity, 1.5); 
    gl_FragColor = vec4(vColor, intensity);
  }
`;

// --- COLOR MATH ---
const getStarColorFloats = (ci) => {
  let bv = Math.max(-0.4, Math.min(ci, 2.0));
  let r, g, b, t;

  if (bv < 0.0) {
    t = (bv + 0.4) / 0.4;
    r = 0.61 + (0.11 * t) + (0.1 * t * t);
    g = 0.70 + (0.07 * t) + (0.1 * t * t);
    b = 1.0;
  } else if (bv < 0.4) {
    t = bv / 0.4;
    r = 0.83 + (0.17 * t);
    g = 0.87 + (0.11 * t);
    b = 1.0;
  } else if (bv < 1.6) {
    t = (bv - 0.4) / 1.2;
    r = 1.0;
    g = 0.98 - (0.16 * t);
    b = 1.0 - (0.47 * t) + (0.1 * t * t);
  } else {
    t = (bv - 1.6) / 0.4;
    r = 1.0;
    g = 0.82 - (0.1 * t * t);
    b = 0.63 - (0.13 * t * t);
  }
  return [r, g, b];
};

const PlanetariumControls = () => {
  const { camera, gl } = useThree();
  const mouse = useRef({ x: 0, y: 0, isDragging: false });
  const rotation = useRef({ yaw: 0, pitch: 0 });

  useEffect(() => {
    const handleMouseDown = () => { mouse.current.isDragging = true; };
    const handleMouseUp = () => { mouse.current.isDragging = false; };
    const handleMouseMove = (e) => {
      if (!mouse.current.isDragging) return;
      rotation.current.yaw += e.movementX * 0.0015;
      rotation.current.pitch += e.movementY * 0.003;
      rotation.current.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.current.pitch));
    };

    const dom = gl.domElement;
    dom.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      dom.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [gl]);

  useFrame(() => {
    camera.position.set(0, 0, 0);
    const euler = new THREE.Euler(rotation.current.pitch, rotation.current.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  });

  return null;
};

const App = () => {
  const { positions, sizes, colors } = useMemo(() => {
    const pos = new Float32Array(stars.length * 3);
    const col = new Float32Array(stars.length * 3);
    const siz = new Float32Array(stars.length);

    stars.forEach((star, index) => {
      const i3 = index * 3;

      const magnitudeVec = Math.sqrt(star.x * star.x + star.y * star.y + star.z * star.z);
      const radius = 290;
      pos[i3] = (star.x / magnitudeVec) * radius;
      pos[i3 + 1] = (star.y / magnitudeVec) * radius;
      pos[i3 + 2] = (star.z / magnitudeVec) * radius;

      const [r, g, b] = getStarColorFloats(star.ci || 0);
      col[i3] = r;
      col[i3 + 1] = g;
      col[i3 + 2] = b;

      const magBase = Math.max(0, 6.5 - star.mag);
      let calcSize = Math.pow(magBase, 1.4) * 0.8 + 1.0;

      if (star.mag <= 1.0) calcSize += 3.0;

      siz[index] = calcSize;
    });

    return { positions: pos, sizes: siz, colors: col };
  }, []);

  const labeledStars = useMemo(() => {
    return stars
      .filter(star => star.mag < 1.5 && star.proper)
      .map(star => {
        const magnitudeVec = Math.sqrt(star.x * star.x + star.y * star.y + star.z * star.z);
        const radius = 290;

        const [r, g, b] = getStarColorFloats(star.ci || 0);
        const cssColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

        return {
          name: star.proper,
          position: [
            (star.x / magnitudeVec) * radius,
            (star.y / magnitudeVec) * radius,
            (star.z / magnitudeVec) * radius
          ],
          color: cssColor 
        };
      });
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [0, 0, 0], fov: 60 }} style={{ width: '100vw', height: '100vh' }}>
        <PlanetariumControls />
        <ambientLight intensity={0.1} color='white' />

        <mesh>
          <sphereGeometry args={[300, 64, 64]} />
          <meshBasicMaterial
            side={THREE.BackSide}
            transparent={true}
            opacity={0.3}
            color="#080b14"
          />
        </mesh>

        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
            <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
          </bufferGeometry>

          <shaderMaterial
            attach="material"
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            transparent={true}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
        
        {labeledStars.map((star, i) => (
          <Html key={i} position={star.position} center zIndexRange={[100, 0]}>
            <div style={{
              color: star.color,
              marginTop: '15px',
              fontFamily: 'sans-serif',
              fontSize: '10px',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              opacity: 0.8,
              pointerEvents: 'none',
              userSelect: 'none'
            }}>
              {star.name}
            </div>
          </Html>
        ))}

        <Suspense fallback={null}>
          <DeepSkyManager/>
        </Suspense>

      </Canvas>
    </div>
  );
};

export default App;