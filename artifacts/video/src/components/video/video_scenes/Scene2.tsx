import { motion } from 'framer-motion';

export function Scene2() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: '300px',
          height: '300px',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(79,125,243,0.08) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
