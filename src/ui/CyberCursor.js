import React, { useEffect, useRef, useState } from "react";
import "./cyberCursor.css";

export default function CyberCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  const [visible, setVisible] = useState(false);
  const isHoveredRef = useRef(false);
  const isClickingRef = useRef(false);

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

      if (!visible) {
        ringPos.current.x = e.clientX;
        ringPos.current.y = e.clientY;
        setVisible(true);
      }

      // Check if hovering over clickable element
      const target = e.target;
      if (target) {
        const isClickable = Boolean(
          target.closest(
            'button, a, input, select, textarea, [role="button"], .btn, .qcmBtn, .checkboxItem, .cyberBankCard, .navItem, [onclick], label, .toggleSwitch',
          ),
        );
        isHoveredRef.current = isClickable;

        if (dotRef.current) {
          if (isClickable) dotRef.current.classList.add("isHovered");
          else dotRef.current.classList.remove("isHovered");
        }
        if (ringRef.current) {
          if (isClickable) ringRef.current.classList.add("isHovered");
          else ringRef.current.classList.remove("isHovered");
        }
      }
    };

    const onMouseDown = () => {
      isClickingRef.current = true;
      if (dotRef.current) dotRef.current.classList.add("isClicking");
      if (ringRef.current) ringRef.current.classList.add("isClicking");
    };

    const onMouseUp = () => {
      isClickingRef.current = false;
      if (dotRef.current) dotRef.current.classList.remove("isClicking");
      if (ringRef.current) ringRef.current.classList.remove("isClicking");
    };

    const onMouseLeave = () => {
      if (dotRef.current) dotRef.current.style.opacity = "0";
      if (ringRef.current) ringRef.current.style.opacity = "0";
    };

    const onMouseEnter = () => {
      if (dotRef.current) dotRef.current.style.opacity = "1";
      if (ringRef.current) ringRef.current.style.opacity = "1";
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);

    // Smooth lerp loop for the outer HUD ring
    const render = () => {
      if (dotRef.current && ringRef.current) {
        // Direct follow for central dot
        dotRef.current.style.transform = `translate3d(${mousePos.current.x}px, ${mousePos.current.y}px, 0) translate(-50%, -50%)`;

        // Smooth spring follow for outer ring
        const lerpFactor = 0.25;
        ringPos.current.x += (mousePos.current.x - ringPos.current.x) * lerpFactor;
        ringPos.current.y += (mousePos.current.y - ringPos.current.y) * lerpFactor;

        ringRef.current.style.transform = `translate3d(${ringPos.current.x}px, ${ringPos.current.y}px, 0) translate(-50%, -50%)`;
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

  return (
    <div className="cyberCursorContainer" aria-hidden="true">
      {/* Central Laser Dot */}
      <div ref={dotRef} className="cyberCursorDot" />

      {/* Outer Holographic HUD Ring */}
      <div ref={ringRef} className="cyberCursorRing">
        <span className="cyberCursorTick tickN" />
        <span className="cyberCursorTick tickS" />
        <span className="cyberCursorTick tickE" />
        <span className="cyberCursorTick tickW" />
      </div>
    </div>
  );
}
