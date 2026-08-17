import React, { useEffect, useState, useRef } from "react";

export default function AnimatedCounter({ value = 0, duration = 800, prefix = "$ ", decimals = 2, className = "" }) {
  const [displayValue, setDisplayValue] = useState(Number(value) || 0);
  const startValueRef = useRef(Number(value) || 0);
  const targetValueRef = useRef(Number(value) || 0);
  const startTimeRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    const target = Number(value) || 0;
    if (target === targetValueRef.current) return;

    startValueRef.current = displayValue;
    targetValueRef.current = target;
    startTimeRef.current = performance.now();

    const updateCounter = (now) => {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startValueRef.current + (targetValueRef.current - startValueRef.current) * ease;

      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(updateCounter);
      }
    };

    animFrameRef.current = requestAnimationFrame(updateCounter);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [value, duration, displayValue]);

  return (
    <span className={`cyberAnimatedCounter ${className}`}>
      {prefix}
      {displayValue.toFixed(decimals)}
    </span>
  );
}
