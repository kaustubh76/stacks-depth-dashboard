import { useEffect, useState } from "react";

import AnimatedNumber from "./AnimatedNumber";

/** Counts up from 0 to `value` on mount (and tweens to any later value). Reduced-motion
 * safe via AnimatedNumber. Use for headline figures so they animate in on first view. */
export default function CountUp({
  value,
  format,
  duration = 1.0,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <AnimatedNumber value={v} format={format} duration={duration} />;
}
