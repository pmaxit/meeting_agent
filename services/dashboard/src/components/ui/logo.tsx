"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { withBasePath } from "@/lib/base-path";
import { APP_NAME, BRAND_LOGO } from "@/lib/brand";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

const textSizeClasses = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
};

export function Logo({ className, size = "md", showText = false }: LogoProps) {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = theme === "system" ? systemTheme : theme;
  const logoSrc = withBasePath(
    currentTheme === "dark" ? BRAND_LOGO.light : BRAND_LOGO.dark
  );

  if (!mounted) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className={cn(sizeClasses[size], "animate-pulse rounded-xl bg-muted")} />
        {showText && (
          <span className={cn("font-semibold", textSizeClasses[size])}>{APP_NAME}</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src={logoSrc}
        alt={`${APP_NAME} logo`}
        width={size === "sm" ? 24 : size === "md" ? 32 : 48}
        height={size === "sm" ? 24 : size === "md" ? 32 : 48}
        className={cn(sizeClasses[size], "object-contain")}
        priority
      />
      {showText && (
        <span className={cn("font-semibold tracking-[-0.02em]", textSizeClasses[size])}>
          {APP_NAME}
        </span>
      )}
    </div>
  );
}
