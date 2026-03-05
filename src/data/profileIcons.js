// Profile Icons – Minimalist line-art SVGs
// Each icon is a thin-stroke drawing that appears behind avatar initials

export const profileIcons = {
    violin: {
        label: 'Violine',
        svg: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M32 8v40"/>
      <path d="M28 48h8"/>
      <ellipse cx="32" cy="52" rx="8" ry="4"/>
      <path d="M24 20c0-4 3.5-8 8-8s8 4 8 8"/>
      <path d="M24 20c0 5 3 8 8 12"/>
      <path d="M40 20c0 5-3 8-8 12"/>
      <path d="M26 26c2 2 4 2 6 2s4 0 6-2"/>
      <circle cx="28" cy="36" r="2"/>
      <circle cx="36" cy="36" r="2"/>
      <path d="M38 8l4-2"/>
      <path d="M38 12l4-2"/>
    </svg>`
    },
    horn: {
        label: 'Horn',
        svg: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="20" cy="38" r="12"/>
      <circle cx="20" cy="38" r="6"/>
      <path d="M32 34c8-4 16-8 20-14"/>
      <path d="M32 42c8 0 14-2 18-6"/>
      <path d="M52 20c2-2 2-4 0-6"/>
      <path d="M14 32v-6c0-4 2-6 6-6"/>
      <path d="M10 44l-2 6"/>
      <path d="M6 50h8"/>
    </svg>`
    },
    baton: {
        label: 'Dirigentenstab',
        svg: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="14" y1="54" x2="50" y2="10"/>
      <path d="M50 10l4-4"/>
      <ellipse cx="52" cy="8" rx="3" ry="2" transform="rotate(-45 52 8)"/>
      <path d="M14 54c-2 2-4 2-4 0s0-4 2-4"/>
      <path d="M20 42c-2 4-6 6-10 4"/>
      <path d="M36 22c4-2 8 0 8 4"/>
    </svg>`
    },
    tie: {
        label: 'Krawatte',
        svg: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M26 8h12"/>
      <path d="M26 8l-2 8 8 4 8-4-2-8"/>
      <path d="M24 16l8 36 8-36"/>
      <path d="M28 28l4 2 4-2"/>
      <path d="M29 38l3 1.5 3-1.5"/>
    </svg>`
    },
    piano: {
        label: 'Piano',
        svg: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="8" y="16" width="48" height="32" rx="2"/>
      <line x1="16" y1="16" x2="16" y2="48"/>
      <line x1="24" y1="16" x2="24" y2="48"/>
      <line x1="32" y1="16" x2="32" y2="48"/>
      <line x1="40" y1="16" x2="40" y2="48"/>
      <line x1="48" y1="16" x2="48" y2="48"/>
      <rect x="13" y="16" width="4" height="18" rx="1"/>
      <rect x="21" y="16" width="4" height="18" rx="1"/>
      <rect x="37" y="16" width="4" height="18" rx="1"/>
      <rect x="45" y="16" width="4" height="18" rx="1"/>
    </svg>`
    }
};

// Helper to render avatar HTML with optional background icon
export function renderAvatarHTML(initials, iconKey, size = 'hero') {
    const icon = iconKey ? profileIcons[iconKey] : null;
    const iconSVG = icon ? `<span class="avatar-icon">${icon.svg}</span>` : '';
    return `${iconSVG}<span class="avatar-initials">${initials}</span>`;
}
