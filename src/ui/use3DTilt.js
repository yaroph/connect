import { useRef, useCallback, useEffect } from "react";

export function use3DTilt({ maxTilt = 10, enableGyro = true, enableHolo = true } = {}) {
  const cardRef = useRef(null);
  const glareRef = useRef(null);
  const holoRef = useRef(null);
  const isHoveredRef = useRef(false);
  const rafId = useRef(null);
  const targetTransform = useRef({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 50, isHovered: false });

  const updateDOM = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;

    const { rotateX, rotateY, glareX, glareY, isHovered } = targetTransform.current;

    if (isHovered) {
      card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
      card.style.transition = "transform 0.08s ease-out";

      if (glareRef.current) {
        glareRef.current.style.background = `radial-gradient(circle at ${glareX.toFixed(1)}% ${glareY.toFixed(1)}%, rgba(255, 255, 255, 0.4) 0%, rgba(0, 240, 255, 0.25) 25%, transparent 60%)`;
        glareRef.current.style.opacity = "1";
      }

      if (holoRef.current && enableHolo) {
        const holoAngle = (rotateX * 5 + rotateY * 5 + 135) % 360;
        holoRef.current.style.background = `linear-gradient(${holoAngle}deg, 
          rgba(255, 0, 128, 0.22) 0%, 
          rgba(255, 214, 0, 0.25) 25%, 
          rgba(0, 240, 255, 0.28) 50%, 
          rgba(16, 185, 129, 0.22) 75%, 
          rgba(255, 0, 128, 0.22) 100%)`;
        holoRef.current.style.opacity = String(Math.min(0.85, (Math.abs(rotateX) + Math.abs(rotateY)) / (maxTilt * 1.5) + 0.15));
      }
    } else {
      card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
      card.style.transition = "transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1)";

      if (glareRef.current) {
        glareRef.current.style.opacity = "0";
        glareRef.current.style.transition = "opacity 0.4s ease-out";
      }

      if (holoRef.current) {
        holoRef.current.style.opacity = "0";
        holoRef.current.style.transition = "opacity 0.4s ease-out";
      }
    }
  }, [enableHolo, maxTilt]);

  const onMouseMove = useCallback(
    (e) => {
      const card = cardRef.current;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -maxTilt;
      const rotateY = ((x - centerX) / centerX) * maxTilt;

      const glareX = (x / rect.width) * 100;
      const glareY = (y / rect.height) * 100;

      targetTransform.current = {
        rotateX,
        rotateY,
        glareX,
        glareY,
        isHovered: true,
      };

      if (!rafId.current) {
        rafId.current = requestAnimationFrame(() => {
          updateDOM();
          rafId.current = null;
        });
      }
    },
    [maxTilt, updateDOM],
  );

  const onMouseEnter = useCallback(() => {
    isHoveredRef.current = true;
  }, []);

  const onMouseLeave = useCallback(() => {
    isHoveredRef.current = false;
    targetTransform.current = {
      rotateX: 0,
      rotateY: 0,
      glareX: 50,
      glareY: 50,
      isHovered: false,
    };
    updateDOM();
  }, [updateDOM]);

  // Mobile gyroscope
  useEffect(() => {
    if (!enableGyro) return;

    let handleOrientation;
    try {
      handleOrientation = (event) => {
        if (isHoveredRef.current) return;
        const gamma = event.gamma || 0;
        const beta = event.beta || 0;

        if (Math.abs(gamma) < 0.5 && Math.abs(beta) < 0.5) return;

        const clampedGamma = Math.max(-25, Math.min(25, gamma));
        const clampedBeta = Math.max(15, Math.min(65, beta)) - 40;

        const rotateY = (clampedGamma / 25) * (maxTilt * 0.85);
        const rotateX = (-clampedBeta / 25) * (maxTilt * 0.85);

        const glareX = 50 + (clampedGamma / 25) * 40;
        const glareY = 50 + (clampedBeta / 25) * 40;

        targetTransform.current = {
          rotateX,
          rotateY,
          glareX,
          glareY,
          isHovered: true,
        };

        if (!rafId.current) {
          rafId.current = requestAnimationFrame(() => {
            updateDOM();
            rafId.current = null;
          });
        }
      };

      window.addEventListener("deviceorientation", handleOrientation, true);
    } catch (e) {
      // Ignored if not supported
    }

    return () => {
      if (handleOrientation) {
        window.removeEventListener("deviceorientation", handleOrientation, true);
      }
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [enableGyro, maxTilt, updateDOM]);

  return {
    cardRef,
    glareRef,
    holoRef,
    tiltProps: {
      onMouseMove,
      onMouseEnter,
      onMouseLeave,
    },
  };
}
