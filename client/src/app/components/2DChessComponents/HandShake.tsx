"use client";
import { useState, useEffect } from "react";

export default function HandshakeOverlay() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="absolute top-0 left-0 w-full p-4 h-full flex items-center justify-center z-30 pointer-events-none">
      <img src="/Handshake.gif" alt="Handshake" />
    </div>
  );
}
