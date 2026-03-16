import { motion } from 'framer-motion';

const base = import.meta.env.BASE_URL;

export function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-black z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ clipPath: 'circle(0% at 50% 50%)' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ scale: 1.15, filter: 'blur(3px)' }}
        animate={{ scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 4, ease: 'easeOut' }}
      >
        <img
          src={`${base}images/bank_rejection.png`}
          alt=""
          className="w-full h-full object-cover opacity-30 mix-blend-luminosity"
        />
      </motion.div>

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent z-[1]" />

      <motion.div
        className="absolute inset-0 flex items-center justify-center z-[2]"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.8, delay: 1.2 }}
      >
        <div className="text-[15vw] text-white font-mono flex">
          <span className="w-[8vw] h-[15vw] bg-white animate-blink" />
        </div>
      </motion.div>

      <motion.div
        className="text-[12vw] leading-none font-bold text-white text-center font-display tracking-tighter uppercase whitespace-nowrap animate-shake z-[3]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.2 }}
      >
        PROVE YOU
        <br />
        EXIST.
      </motion.div>
    </motion.div>
  );
}
