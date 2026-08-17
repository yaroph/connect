import { useState, useRef, useCallback, useEffect } from "react";

export function use3DTilt({ maxTilt = 12, enableGyro = true, enableHolo = true } = {}) {
  const [tiltStyle, setTiltStyle] = useState({});
  const [glareStyle, setGlareStyle] = useState({});
  const [holoStyle, setHoloStyle] = useState({});
  const isHoveredRef = useRef(false);

  const applyTilt = useCallback(
    (rotateX, rotateY, glareX, glareY) => {
      // Calculate dynamic iridescent angle based on rotation
      const holoAngle = (rotateX * 5 + rotateY * 5 + 135) % 360;

      setTiltStyle({
        transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`,
        transition: "transform 0.08s ease-out",
        transformStyle: "preserve-3d",
      });

      setGlareStyle({
        background: `radial-gradient(circle at ${glareX.toFixed(1)}% ${glareY.toFixed(1)}%, rgba(255, 255, 255, 0.4) 0%, rgba(0, 240, 255, 0.25) 25%, transparent 60%)`,
        opacity: 1,
        transition: "opacity 0.15s ease-out",
      });

      if (enableHolo) {
        setHoloStyle({
          background: `linear-gradient(${holoAngle}deg, 
            rgba(255, 0, 128, 0.22) 0%, 
            rgba(255, 214, 0, 0.25) 25%, 
            rgba(0, 240, 255, 0.28) 50%, 
            rgba(16, 185, 129, 0.22) 75%, 
            rgba(255, 0, 128, 0.22) 100%)`,
          opacity: Math.min(0.85, (Math.abs(rotateX) + Math.abs(rotateY)) / (maxTilt * 1.5) + 0.15),
          mixBlendMode: "color-dodge",
          transition: "opacity 0.15s ease-out",
        });
      }
    },
    [maxTilt, enableHolo],
  );

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

      applyTilt(rotateX, rotateY, glareX, glareY);
    },
    [maxTilt, applyTilt],
  );

  const onMouseEnter = useCallback(() => {
    isHoveredRef.current = true;
  }, []);

  const onMouseLeave = useCallback(() => {
    isHoveredRef.current = false;
    setTiltStyle({
      transform: "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
      transition: "transform 0.45s cubic-bezier(0.2, 0.9, 0.3, 1)",
      transformStyle: "preserve-3d",
    });
    setGlareStyle({
      opacity: 0,
      transition: "opacity 0.45s ease-out",
    });
    setHoloStyle({
      opacity: 0,
      transition: "opacity 0.45s ease-out",
    });
  }, []);

  // Gyroscope / DeviceOrientation for Mobile & Tablets
  useEffect(() => {
    if (!enableGyro) return;

    let handleOrientation;
    try {
      handleOrientation = (event) => {
        if (isHoveredRef.current) return;
        const gamma = event.gamma || 0; // Left to right [-90, 90]
        const beta = event.beta || 0;   // Front to back [-180, 180]

        // Only react if meaningful movement
        if (Math.abs(gamma) < 0.5 && Math.abs(beta) < 0.5) return;

        // Clamped tilt
        const clampedGamma = Math.max(-25, Math.min(25, gamma));
        const clampedBeta = Math.max(15, Math.min(65, beta)) - 40; // baseline sitting angle

        const rotateY = (clampedGamma / 25) * (maxTilt * 0.85);
        const rotateX = (-clampedBeta / 25) * (maxTilt * 0.85);

        const glareX = 50 + (clampedGamma / 25) * 40;
        const glareY = 50 + (clampedBeta / 25) * 40;

        applyTilt(rotateX, rotateY, glareX, glareY);
      };

      window.addEventListener("deviceorientation", handleOrientation, true);
    } catch (e) {
      // Gyroscope not supported or permissions required
    }

    return () => {
      if (handleOrientation) {
        window.removeEventListener("deviceorientation", handleOrientation, true);
      }
    };
  }, [enableGyro, maxTilt, applyTilt]);

  return {
    tiltProps: {
      onMouseMove,
      onMouseEnter,
      onMouseLeave,
      style: tiltStyle,
    },
    glareStyle,
    holoStyle,
  };
}
