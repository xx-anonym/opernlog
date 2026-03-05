// Profile Icons – Minimalist line-art SVGs
// Each icon is a thin-stroke drawing that appears behind avatar initials

export const profileIcons = {
  violin: {
    label: 'Violine',
    svg: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Scroll -->
      <path d="M30 8c-2 0-3 1-3 3s2 3 3 2"/>
      <!-- Neck -->
      <line x1="30" y1="11" x2="30" y2="24"/>
      <!-- Pegs -->
      <line x1="27" y1="13" x2="33" y2="13"/>
      <line x1="27" y1="16" x2="33" y2="16"/>
      <!-- Body -->
      <path d="M22 24c-5 2-8 6-8 10 0 3 1 5 3 6"/>
      <path d="M38 24c5 2 8 6 8 10 0 3-1 5-3 6"/>
      <!-- Body waist -->
      <path d="M22 24c3 3 3 7 0 10"/>
      <path d="M38 24c-3 3-3 7 0 10"/>
      <!-- Bottom curve -->
      <path d="M17 40c0 6 5 10 13 10s13-4 13-10"/>
      <!-- F-holes -->
      <path d="M25 30c0 3 1 5 0 8"/>
      <path d="M35 30c0 3-1 5 0 8"/>
      <!-- Bridge -->
      <line x1="26" y1="38" x2="34" y2="38"/>
      <!-- Tailpiece -->
      <line x1="30" y1="42" x2="30" y2="48"/>
      <!-- Chin rest -->
      <path d="M33 48c2 0 4 1 4 3"/>
      <!-- Strings -->
      <line x1="28" y1="16" x2="28" y2="42" stroke-width="0.5"/>
      <line x1="30" y1="16" x2="30" y2="42" stroke-width="0.5"/>
      <line x1="32" y1="16" x2="32" y2="42" stroke-width="0.5"/>
    </svg>`
  },
  horn: {
    label: 'Horn',
    svg: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Main circular tube of French horn -->
      <circle cx="30" cy="32" r="14"/>
      <!-- Inner tube loop -->
      <circle cx="30" cy="32" r="8"/>
      <!-- Bell (flared opening on right) -->
      <path d="M44 32c2 0 4-3 6-3 2 0 3 2 3 5s-1 5-3 5c-2 0-4-3-6-3"/>
      <!-- Mouthpiece pipe going up-left -->
      <path d="M22 20c-4-4-6-6-6-10"/>
      <!-- Mouthpiece -->
      <path d="M16 10c-1-2 0-3 1-3s2 1 1 3"/>
      <!-- Valves on top -->
      <line x1="26" y1="18" x2="26" y2="14"/>
      <line x1="30" y1="18" x2="30" y2="14"/>
      <line x1="34" y1="18" x2="34" y2="14"/>
      <circle cx="26" cy="13" r="1"/>
      <circle cx="30" cy="13" r="1"/>
      <circle cx="34" cy="13" r="1"/>
    </svg>`
  },
  baton: {
    label: 'Dirigentenstab',
    svg: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Main baton stick -->
      <line x1="12" y1="52" x2="52" y2="12"/>
      <!-- Cork grip/handle at bottom -->
      <ellipse cx="14" cy="50" rx="4" ry="2.5" transform="rotate(-45 14 50)"/>
      <!-- Tip at top -->
      <circle cx="52" cy="12" r="1.5" fill="currentColor"/>
      <!-- Motion lines suggesting conducting movement -->
      <path d="M36 20c6 4 10 2 14-2" stroke-width="0.8" opacity="0.5"/>
      <path d="M32 26c6 4 12 2 16-2" stroke-width="0.8" opacity="0.4"/>
      <path d="M28 32c6 4 14 2 18-2" stroke-width="0.8" opacity="0.3"/>
    </svg>`
  },
  fliege: {
    label: 'Fliege',
    svg: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Left wing of bow tie -->
      <path d="M8 24c0-2 2-4 4-4h6l-2 12-4 0c-2 0-4-2-4-4z"/>
      <path d="M8 40c0 2 2 4 4 4h6l-2-12-4 0c-2 0-4 2-4 4z"/>
      <!-- Right wing of bow tie -->
      <path d="M56 24c0-2-2-4-4-4h-6l2 12 4 0c2 0 4-2 4-4z"/>
      <path d="M56 40c0 2-2 4-4 4h-6l2-12 4 0c2 0 4 2 4 4z"/>
      <!-- Left triangle -->
      <path d="M18 20l14 12-14 12z"/>
      <!-- Right triangle -->
      <path d="M46 20l-14 12 14 12z"/>
      <!-- Center knot -->
      <rect x="29" y="28" width="6" height="8" rx="1.5"/>
    </svg>`
  },
  piano: {
    label: 'Piano',
    svg: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Grand piano body outline (top view / side silhouette) -->
      <!-- Lid -->
      <path d="M10 20h44c2 0 3 1 3 3v4H7v-4c0-2 1-3 3-3z"/>
      <!-- Main body -->
      <rect x="7" y="27" width="50" height="20" rx="1"/>
      <!-- White keys -->
      <line x1="14" y1="27" x2="14" y2="47"/>
      <line x1="21" y1="27" x2="21" y2="47"/>
      <line x1="28" y1="27" x2="28" y2="47"/>
      <line x1="35" y1="27" x2="35" y2="47"/>
      <line x1="42" y1="27" x2="42" y2="47"/>
      <line x1="49" y1="27" x2="49" y2="47"/>
      <!-- Black keys -->
      <rect x="11" y="27" width="4" height="12" rx="0.5" fill="currentColor" stroke="none"/>
      <rect x="18" y="27" width="4" height="12" rx="0.5" fill="currentColor" stroke="none"/>
      <rect x="31" y="27" width="4" height="12" rx="0.5" fill="currentColor" stroke="none"/>
      <rect x="38" y="27" width="4" height="12" rx="0.5" fill="currentColor" stroke="none"/>
      <rect x="45" y="27" width="4" height="12" rx="0.5" fill="currentColor" stroke="none"/>
      <!-- Legs -->
      <line x1="12" y1="47" x2="12" y2="54"/>
      <line x1="52" y1="47" x2="52" y2="54"/>
      <!-- Pedals -->
      <line x1="29" y1="54" x2="35" y2="54"/>
      <line x1="30" y1="47" x2="30" y2="54" stroke-width="0.8"/>
      <line x1="32" y1="47" x2="32" y2="54" stroke-width="0.8"/>
      <line x1="34" y1="47" x2="34" y2="54" stroke-width="0.8"/>
    </svg>`
  }
};

// Helper to render avatar HTML with optional background icon
export function renderAvatarHTML(initials, iconKey, size = 'hero') {
  const icon = iconKey ? profileIcons[iconKey] : null;
  const iconSVG = icon ? `<span class="avatar-icon">${icon.svg}</span>` : '';
  return `${iconSVG}<span class="avatar-initials">${initials}</span>`;
}
