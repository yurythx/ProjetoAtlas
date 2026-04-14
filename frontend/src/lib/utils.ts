import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Convert HEX to OKLCH (Simplified approximation or just return formatted string for Tailwind)
// For Tailwind v4 compat with alpha transparency (bg-primary/50), vars usually need to be in a specific format
// However, since we are overriding --primary which is used as color-mix or directly, HEX is usually fine in modern CSS
// BUT if Tailwind expects OKLCH components, we might break things.
// Let's stick to HEX for now as browsers handle it in vars, but opacity modifiers might fail if not handled by Tailwind plugin.
// Best approach for dynamic themes is setting the base color value.

export function hexToRgb(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}` : null;
}

export function getContrastColor(hexColor: string): string {
  // Convert hex to RGB
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);

  // Calculate luminance
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;

  // Return black or white based on luminance
  return (yiq >= 128) ? '#000000' : '#FFFFFF';
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/&/g, '-and-')        // Replace & with 'and'
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')          // Replace multiple - with single -
    .replace(/^-+/, '')              // Trim - from start of text
    .replace(/-+$/, '');             // Trim - from end of text
}

export function fixImageUrl(url: string | null | undefined): string {
  if (!url) return ''
  // Em desenvolvimento, corrige HTTPS local para HTTP para evitar timeouts no Next.js
  if (process.env.NODE_ENV === 'development' && typeof url === 'string' && url.startsWith('https://localhost:8005')) {
    url = url.replace('https://', 'http://')
  }
  if (url.startsWith('/media/media/')) {
    url = url.replace('/media/media/', '/media/')
  }
  return encodeURI(url)
}
