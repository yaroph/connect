import { useState, useRef, useCallback } from "react";

export function use3DTilt(maxTilt = 8) {
  const [tiltStyle, setTiltStyle] = useState({});
  const [glareStyle, setGlareStyle] = useState({});
  const isHoveredRef = useRef(false);

  const onMouseMove = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -maxTilt;
      const rotateY = ((x - centerX) / centerX) * maxTilt;

      const glareX = (x / rect.width) * 100;
      const glareY = (y / rect.height) * 100;

      setTiltStyle({
        transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.015, 1.015, 1.015)`,
        transition: "transform 0.1s ease-out",
        transformStyle: "preserve-3d",
      });

      setGlareStyle({
        background: `radial-gradient(circle at ${glareX.toFixed(1)}% ${glareY.toFixed(1)}%, rgba(0, 240, 255, 0.22) 0%, rgba(255, 214, 0, 0.08) 35%, transparent 65%)`,
        opacity: 1,
      });
    },
    [maxTilt],
  );

  const onMouseEnter = useCallback(() => {
    isHoveredRef.current = true;
  }, []);

  const onMouseLeave = useCallback(() => {
    isHoveredRef.current = false;
    setTiltStyle({
      transform: "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
      transition: "transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1)",
      transformStyle: "preserve-3d",
    });
    setGlareStyle({
      opacity: 0,
      transition: "opacity 0.4s ease-out",
    });
  }, []);

  return {
    tiltProps: {
      onMouseMove,
      onMouseEnter,
      onMouseLeave,
      style: tiltStyle,
    },
    glareStyle,
  };
}
