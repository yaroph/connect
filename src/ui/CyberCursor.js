import React, { useEffect, useRef, useState } from "react";
import "./cyberCursor.css";

export default function CyberCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  const [visible, setVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isClicking, setIsClicking] = useState(false);

  const mousePos = useRef({ x: -100, y: -100 });
  const ringPos = useRef({ x: -100, y: -100 });
  const animFrameId = useRef(null);

  useEffect(() => {
    // Only activate on devices with a precision mouse pointer
    if (window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    const onMouseMove = (e) => {
      mousePos.current.x = e.clientX;
      mousePos.current.y = e.clientY;

      if (!visible) setVisible(true);

      // Check if hovering over clickable element
      const target = e.target;
      if (target) {
        const isClickable = Boolean(
          target.closest(
            'button, a, input, select, textarea, [role="button"], .btn, .qcmBtn, .checkboxItem, .cyberBankCard, .navItem, [onclick], label, .toggleSwitch',
          ),
        );
        setIsHovered(isClickable);
      }
    };

    const onMouseDown = () => setIsClicking(true);
    const onMouseUp = () => setIsClicking(false);

    const onMouseLeave = () => setVisible(false);
    const onMouseEnter = () => setVisible(true);

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);

    // Smooth lerp loop for the outer HUD ring
    const render = () => {
      if (dotRef.current && ringRef.current) {
        // Direct follow for central dot
        dotRef.current.style.transform = `translate3d(${mousePos.current.x}px, ${mousePos.current.y}px, 0)`;

        // Smooth spring follow for outer ring
        const lerpFactor = 0.22;
        ringPos.current.x += (mousePos.current.x - ringPos.current.x) * lerpFactor;
        ringPos.current.y += (mousePos.current.y - ringPos.current.y) * lerpFactor;

        ringRef.current.style.transform = `translate3d(${ringPos.current.x}px, ${ringPos.current.y}px, 0)`;
      }

      animFrameId.current = requestAnimationFrame(render);
    };

    animFrameId.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="cyberCursorContainer" aria-hidden="true">
      {/* Central Laser Dot */}
      <div
        ref={dotRef}
        className={`cyberCursorDot ${isHovered ? "isHovered" : ""} ${isClicking ? "isClicking" : ""}`}
      />

      {/* Outer Holographic HUD Ring */}
      <div
        ref={ringRef}
        className={`cyberCursorRing ${isHovered ? "isHovered" : ""} ${isClicking ? "isClicking" : ""}`}
      >
        <span className="cyberCursorTick tickN" />
        <span className="cyberCursorTick tickS" />
        <span className="cyberCursorTick tickE" />
        <span className="cyberCursorTick tickW" />
      </div>
    </div>
  );
}
