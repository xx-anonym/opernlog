// Utility functions shared across OpernLog

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Use this for ALL user-generated content before inserting into innerHTML.
 */
export function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
