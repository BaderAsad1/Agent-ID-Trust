import { motion } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DarkCosmosBackground } from './DarkCosmosBackground';
import { AgentIDObject } from './AgentIDObject';
import { ChromaticSplit } from './ChromaticSplit';
import { GlassMorphTransition } from './GlassMorphTransition';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

const SCENE_DURATIONS = {
  scene1: 7000,
  scene2: 12000,
  scene3: 8000,
  scene4: 12000,
  scene5: 10000,
  scene6: 16000,
};

type CosmosPhase = 'cold' | 'warming' | 'warm' | 'hot' | 'cooling';

const PHASE_MAP: Record<number, CosmosPhase> = {
  0: 'cold',
  1: 'warming',
  2: 'warm',
  3: 'hot',
  4: 'hot',
  5: 'cooling',
};

const CREDENTIAL_VISIBLE_SCENES = new Set([1, 2, 3, 4]);

interface CredentialPosition {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

const CREDENTIAL_POSITIONS: Record<number, CredentialPosition> = {
  1: { x: 0, y: 0, scale: 1, opacity: 1 },
  2: { x: 0, y: -20, scale: 0.85, opacity: 0.7 },
  3: { x: -220, y: 0, scale: 0.65, opacity: 1 },
  4: { x: 200, y: -40, scale: 0.55, opacity: 0.6 },
};

const SCENE_CONTENT_ENTER = {
  initial: { scale: 0.96, filter: 'blur(8px)' },
  animate: { scale: 1, filter: 'blur(0px)' },
  transition: { duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

const SCENE_COMPONENTS = [Scene1, Scene2, Scene3, Scene4, Scene5, Scene6];

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({
    durations: SCENE_DURATIONS,
    loop: true,
  });

  const phase = PHASE_MAP[currentScene] || 'cold';
  const showCredential = CREDENTIAL_VISIBLE_SCENES.has(currentScene);
  const credPos = CREDENTIAL_POSITIONS[currentScene] || CREDENTIAL_POSITIONS[1];

  const prevSceneRef = useRef(currentScene);
  const [chromaticTrigger, setChromaticTrigger] = useState(false);
  const [contentKey, setContentKey] = useState(currentScene);

  useEffect(() => {
    if (prevSceneRef.current !== currentScene) {
      setChromaticTrigger(false);
      requestAnimationFrame(() => setChromaticTrigger(true));

      const contentTimer = setTimeout(() => {
        setContentKey(currentScene);
      }, 300);

      prevSceneRef.current = currentScene;
      return () => clearTimeout(contentTimer);
    }
    return undefined;
  }, [currentScene]);

  const [credentialState, setCredentialState] = useState({
    showHandle: false,
    trustScore: 0,
    showProtocols: false,
    showVerified: false,
  });

  const trustAnimRef = useRef<number | null>(null);

  const animateTrustScore = useCallback(() => {
    if (trustAnimRef.current) cancelAnimationFrame(trustAnimRef.current);
    const target = 94;
    const startTime = performance.now();
    const duration = 4000;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      setCredentialState(prev => ({ ...prev, trustScore: current }));
      if (progress < 1) {
        trustAnimRef.current = requestAnimationFrame(tick);
      }
    };
    trustAnimRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (currentScene === 0 || currentScene === 5) {
      if (trustAnimRef.current) cancelAnimationFrame(trustAnimRef.current);
      setCredentialState({ showHandle: false, trustScore: 0, showProtocols: false, showVerified: false });
    }

    if (currentScene === 1) {
      setCredentialState({ showHandle: false, trustScore: 0, showProtocols: false, showVerified: false });

      const handleTimer = setTimeout(() => {
        setCredentialState(prev => ({ ...prev, showHandle: true }));
      }, 2000);

      const trustTimer = setTimeout(() => {
        animateTrustScore();
      }, 3500);

      const protocolTimer = setTimeout(() => {
        setCredentialState(prev => ({ ...prev, showProtocols: true }));
      }, 8000);

      const verifiedTimer = setTimeout(() => {
        setCredentialState(prev => ({ ...prev, showVerified: true }));
      }, 9500);

      return () => {
        clearTimeout(handleTimer);
        clearTimeout(trustTimer);
        clearTimeout(protocolTimer);
        clearTimeout(verifiedTimer);
        if (trustAnimRef.current) cancelAnimationFrame(trustAnimRef.current);
      };
    }

    if (currentScene >= 2 && currentScene <= 4) {
      setCredentialState({ showHandle: true, trustScore: 94, showProtocols: true, showVerified: true });
    }

    return undefined;
  }, [currentScene, animateTrustScore]);

  const ActiveScene = useMemo(() => SCENE_COMPONENTS[contentKey], [contentKey]);

  return (
    <div
      className="w-full h-screen overflow-hidden relative"
      style={{ backgroundColor: '#050711' }}
    >
      <DarkCosmosBackground phase={phase} />

      <ChromaticSplit trigger={chromaticTrigger} />

      <GlassMorphTransition sceneIndex={currentScene} />

      {showCredential && (
        <motion.div
          className="absolute z-30 flex items-center justify-center"
          style={{
            top: '50%',
            left: '50%',
            perspective: '1200px',
          }}
          animate={{
            x: credPos.x,
            y: credPos.y,
            scale: credPos.scale,
            opacity: credPos.opacity,
            translateX: '-50%',
            translateY: '-50%',
          }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            animate={{ rotateY: [0, 2, -2, 0], rotateX: [0, 1, -1, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <AgentIDObject
              showHandle={credentialState.showHandle}
              trustScore={credentialState.trustScore}
              showProtocols={credentialState.showProtocols}
              showVerified={credentialState.showVerified}
              compact={currentScene >= 3}
            />
          </motion.div>
        </motion.div>
      )}

      <motion.div
        key={contentKey}
        className="absolute inset-0 z-20"
        initial={SCENE_CONTENT_ENTER.initial}
        animate={SCENE_CONTENT_ENTER.animate}
        transition={SCENE_CONTENT_ENTER.transition}
      >
        {ActiveScene && <ActiveScene />}
      </motion.div>

      <motion.div
        className="absolute inset-0 z-40 pointer-events-none"
        animate={{
          scale: currentScene === 5 ? 1.02 : 1,
          opacity: currentScene === 5 ? 0.3 : 0,
        }}
        transition={{ duration: 2.5 }}
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(5,7,17,0.8) 100%)',
        }}
      />
    </div>
  );
}
