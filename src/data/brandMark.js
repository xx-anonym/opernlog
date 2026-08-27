// OpernLog Brand Mark – comedy & tragedy masks in thin gold line art.
//
// This is the app's single visual signature: it appears in the nav, on the
// auth screens, in the invite flow, in the app icons and on the splash.
// The splash carries its own copy of these paths inline in index.html so the
// first frame can paint before any script runs – if you change the shapes
// here, change them there too.

export const BRAND_MARK_VIEWBOX = '11 13 46 40';

// Fill tones let the front mask occlude the one behind it. They read as dark
// wine on every surface the mark is used on.
const MASK_BACK = '#2a0d15';
const MASK_FRONT = '#1a0710';

export function brandMarkSVG({ className = '', strokeWidth = 1.4 } = {}) {
  return `<svg class="${className}" viewBox="${BRAND_MARK_VIEWBOX}" fill="none"
      stroke="currentColor" stroke-width="${strokeWidth}"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M32 26C32 16 54 16 54 26C54 37 49 44 43 44C37 44 32 37 32 26Z" fill="${MASK_BACK}"/>
      <path d="M40 26.5Q42.5 29.5 45 26.5" stroke-width="${strokeWidth * 0.79}"/>
      <path d="M47.5 26.5Q50 29.5 52.5 26.5" stroke-width="${strokeWidth * 0.79}"/>
      <path d="M41 38Q46 33.5 51 38" stroke-width="${strokeWidth * 0.79}"/>
      <path d="M14 30C14 19 38 19 38 30C38 42 33 50 26 50C19 50 14 42 14 30Z" fill="${MASK_FRONT}"/>
      <path d="M19.5 30.5Q22 27.5 24.5 30.5" stroke-width="${strokeWidth * 0.79}"/>
      <path d="M27.5 30.5Q30 27.5 32.5 30.5" stroke-width="${strokeWidth * 0.79}"/>
      <path d="M19.5 38Q26 44 32.5 38" stroke-width="${strokeWidth * 0.79}"/>
    </svg>`;
}
