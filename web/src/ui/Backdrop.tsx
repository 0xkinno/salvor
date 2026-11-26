import { motion, useScroll, useSpring } from "framer-motion";

// Fixed atmosphere behind every page: three slow aurora blobs (lilac, violet, champagne) and a scroll progress bar.
export function Backdrop() {
  const { scrollYProgress } = useScroll();
  const w = useSpring(scrollYProgress, { stiffness: 140, damping: 28 });
  return (
    <>
      <motion.div aria-hidden className="fixed left-0 top-0 z-[70] h-[3px] origin-left bg-gradient-to-r from-violet via-lilac-300 to-gold" style={{ scaleX: w, width: "100%" }} />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, #DACFFB, transparent 68%)" }}
          animate={{ x: [0, 60, -20, 0], y: [0, 40, 70, 0] }} transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute -right-48 top-[18%] h-[620px] w-[620px] rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, #BFAEF6, transparent 66%)" }}
          animate={{ x: [0, -70, 20, 0], y: [0, 60, -30, 0] }} transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute bottom-[-220px] left-[24%] h-[520px] w-[520px] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, #F1DFB4, transparent 66%)" }}
          animate={{ x: [0, 50, -40, 0], y: [0, -50, 20, 0] }} transition={{ duration: 36, repeat: Infinity, ease: "easeInOut" }} />
      </div>
    </>
  );
}
