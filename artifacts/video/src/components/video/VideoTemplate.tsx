import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { GenerativeBackground } from './GenerativeBackground';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { Scene8 } from './video_scenes/Scene8';

const SCENE_DURATIONS = {
  scene1: 4500,
  scene2: 7000,
  scene3: 5500,
  scene4: 7000,
  scene5: 10000,
  scene6: 4500,
  scene7: 14000,
  scene8: 10000,
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({
    durations: SCENE_DURATIONS,
    loop: true
  });

  return (
    <div
      className="w-full h-screen overflow-hidden relative"
      style={{ backgroundColor: 'var(--color-bg-dark)' }}
    >
      {/* Persistent Background Layer */}
      <div className="absolute inset-0 z-0 noise-bg" />
      <GenerativeBackground
        intensity={currentScene === 3 ? 1 : currentScene >= 6 ? 0.6 : 0.2}
        color={currentScene >= 4 ? '59, 130, 246' : '255, 255, 255'}
      />
      
      <motion.div 
        className="absolute inset-0 z-0 dot-grid"
        initial={{ opacity: 0.1 }}
        animate={{ 
          opacity: currentScene >= 4 ? 0.05 : 0.15,
          scale: 1 + (currentScene * 0.05),
          x: currentScene % 2 === 0 ? '-1%' : '1%',
          y: currentScene % 2 === 0 ? '-1%' : '1%'
        }}
        transition={{ duration: 4, ease: "easeInOut" }}
      />
      
      {/* Floating Geometric Shapes */}
      <motion.div 
        className="absolute top-1/4 left-1/4 border border-white/10 z-0 mix-blend-overlay"
        style={{ width: '16vw', height: '16vw' }}
        animate={{
          rotate: currentScene * 45,
          scale: currentScene === 3 || currentScene === 4 ? 0 : 1,
          opacity: currentScene >= 6 ? 0.3 : 0.1,
          borderRadius: currentScene >= 6 ? "50%" : "0%"
        }}
        transition={{ duration: 2, ease: "easeInOut" }}
      />
      <motion.div 
        className="absolute bottom-1/3 right-1/4 border border-blue-500/20 z-0 mix-blend-overlay"
        style={{ width: '32vw', height: '32vw' }}
        animate={{
          rotate: currentScene * -30,
          scale: currentScene === 3 || currentScene === 4 ? 0 : 1.5,
          opacity: currentScene >= 6 ? 0.5 : 0.1,
          borderRadius: currentScene >= 6 ? "10%" : "50%"
        }}
        transition={{ duration: 3, ease: "easeInOut" }}
      />
      
      {/* Dynamic Accent Line */}
      <motion.div 
        className="absolute bottom-10 left-10 h-0.5 z-50 bg-accent"
        initial={{ width: '0%' }}
        animate={{ 
          width: `${((currentScene + 1) / Object.keys(SCENE_DURATIONS).length) * 100}vw`,
          opacity: currentScene === 4 ? 0 : 1
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      <AnimatePresence mode="wait">
        {currentScene === 0 && <Scene1 key="scene1" />}
        {currentScene === 1 && <Scene2 key="scene2" />}
        {currentScene === 2 && <Scene3 key="scene3" />}
        {currentScene === 3 && <Scene4 key="scene4" />}
        {currentScene === 4 && <Scene5 key="scene5" />}
        {currentScene === 5 && <Scene6 key="scene6" />}
        {currentScene === 6 && <Scene7 key="scene7" />}
        {currentScene === 7 && <Scene8 key="scene8" />}
      </AnimatePresence>
    </div>
  );
}
