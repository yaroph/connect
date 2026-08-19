import React, { useEffect, useRef, useState } from "react";
import "./cyberCursor.css";

export default function CyberCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  const [visible, setVisible] = useState(false);

  const mousePos = useRef({ x: -200, y: -200 });
  const ringPos = useRef({ x: -200, y: -200 });
  const isMoving = useRef(false);
  const animFrameId = useRef(null);
  const hoverThrottleTimer = useRef(null);

  useEffect(() => {
    // Only activate on devices with a mouse
    if (window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    const checkHover = (target) => {
      if (!target || !dotRef.current || !ringRef.current) return;
      const isClickable = Boolean(
        target.closest(
          'button, a, input, select, textarea, [role="button"], .btn, .qcmBtn, .checkboxItem, .cyberBankCard, .navItem, [onclick], label, .toggleSwitch',
        ),
      );

      if (isClickable) {
        dotRef.current.classList.add("isHovered");
        ringRef.current.classList.add("isHovered");
      } else {
        dotRef.current.classList.remove("isHovered");
        ringRef.current.classList.remove("isHovered");
      }
    };

    const onMouseMove = (e) => {
      mousePos.current.x = e.clientX;
      mousePos.current.y = e.clientY;

      if (!visible) {
        ringPos.current.x = e.clientX;
        ringPos.current.y = e.clientY;
        setVisible(true);
      }

      isMoving.current = true;

      // Throttle hover detection to avoid layout thrashing
      if (!hoverThrottleTimer.current) {
        hoverThrottleTimer.current = setTimeout(() => {
          checkHover(e.target);
          hoverThrottleTimer.current = null;
        }, 32);
      }
    };

    const onMouseDown = () => {
      if (dotRef.current) dotRef.current.classList.add("isClicking");
      if (ringRef.current) ringRef.current.classList.add("isClicking");
    };

    const onMouseUp = () => {
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
    window.addEventListener("mousedown", onMouseDown, { passive: true });
    window.addEventListener("mouseup", onMouseUp, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);

    const render = () => {
      if (dotRef.current && ringRef.current) {
        dotRef.current.style.transform = `translate3d(${mousePos.current.x}px, ${mousePos.current.y}px, 0)`;

        const dx = mousePos.current.x - ringPos.current.x;
        const dy = mousePos.current.y - ringPos.current.y;

        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          ringPos.current.x += dx * 0.35;
          ringPos.current.y += dy * 0.35;
          ringRef.current.style.transform = `translate3d(${ringPos.current.x}px, ${ringPos.current.y}px, 0)`;
        }
      }

      animFrameId.current = requestAnimationFrame(render);
    };

    animFrameId.current = requestAnimationFrame(render);

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      } else {
        animFrameId.current = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      if (hoverThrottleTimer.current) clearTimeout(hoverThrottleTimer.current);
    };
  }, [visible]);

  return (
    <div className="cyberCursorContainer" aria-hidden="true">
      {/* Reticle Outer Circle with Rotation */}
      <div
        ref={ringRef}
        className="cyberCursorRingWrapper"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div className="cyberCursorRing">
          <div className="cyberCursorTick tickTop" />
          <div className="cyberCursorTick tickRight" />
          <div className="cyberCursorTick tickBottom" />
          <div className="cyberCursorTick tickLeft" />
          <div className="cyberCursorCorner cornerTL" />
          <div className="cyberCursorCorner cornerTR" />
          <div className="cyberCursorCorner cornerBL" />
          <div className="cyberCursorCorner cornerBR" />
        </div>
      </div>

      {/* Central Laser Dot with Direct Follow */}
      <div
        ref={dotRef}
        className="cyberCursorDotWrapper"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div className="cyberCursorDot" />
      </div>
    </div>
  );
}
