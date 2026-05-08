import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Zap } from 'lucide-react';

export const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.5, delay: 2.5 }}
      onAnimationComplete={onComplete}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#08090a] overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,242,255,0.1),transparent_70%)]" />
      
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center"
      >
        <div className="relative mb-6">
          <motion.div
            animate={{ 
              filter: ["drop-shadow(0 0 10px rgba(0,242,255,0.2))", "drop-shadow(0 0 25px rgba(0,242,255,0.6))", "drop-shadow(0 0 10px rgba(0,242,255,0.2))"] 
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ShieldAlert className="w-24 h-24 text-neon-blue" strokeWidth={1} />
          </motion.div>
          <Zap className="absolute -top-2 -right-2 w-8 h-8 text-neon-blue fill-neon-blue" />
        </div>
        
        <h1 className="text-4xl font-bold tracking-[0.2em] text-white flex items-center gap-2">
          OFFLINE<span className="text-neon-blue">NAV</span> AI
        </h1>
        
        <div className="mt-8 flex flex-col items-center gap-2">
          <div className="h-[2px] w-48 bg-white/10 overflow-hidden rounded-full">
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: "0%" }}
              transition={{ duration: 2, ease: "easeInOut" }}
              className="h-full w-full bg-neon-blue neon-glow-blue"
            />
          </div>
          <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">
            Initializing Hazard Intelligence Platform
          </span>
        </div>
      </motion.div>
      
      <div className="absolute bottom-12 text-[8px] text-white/20 uppercase tracking-[0.5em] font-mono">
        Resilience Systems v1.0.4 • Core Offline Active
      </div>
    </motion.div>
  );
};
