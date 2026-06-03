"use client";
import { useState } from "react";

export default function SmartImg({
  src,
  fallback,
  alt,
  className,
}: {
  src: string;
  fallback: string;
  alt: string;
  className?: string;
}) {
  const [cur, setCur] = useState(src);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cur}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => {
        if (cur !== fallback) setCur(fallback);
      }}
    />
  );
}
