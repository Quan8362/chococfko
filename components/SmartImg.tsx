"use client";
import { useState } from "react";
import Image from "next/image";

export default function SmartImg({
  src,
  fallback,
  alt,
  className,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  src: string;
  fallback: string;
  alt: string;
  className?: string;
  /** Pass "100vw" for full-bleed hero images. */
  sizes?: string;
}) {
  const [cur, setCur] = useState(src);
  return (
    <Image
      src={cur}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={() => {
        if (cur !== fallback) setCur(fallback);
      }}
    />
  );
}
