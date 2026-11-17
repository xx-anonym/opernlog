// Kurze Rückmeldung am unteren Bildschirmrand.
//
// Bewusst zentral: Fehlgeschlagene Schreibvorgänge müssen den Nutzer
// erreichen. Vorher landeten sie in console.warn, die Oberfläche meldete
// Erfolg – und die Änderung war beim nächsten Laden verschwunden.

import { supportMailLink } from '../utils.js';

export function showToast(msg, variant = 'info', { melden = false } = {}) {
  const toast = document.createElement('div');
  // bewusst ohne .fade-in – siehe Kommentar bei .toast in style.css
  toast.className = `toast toast--${variant}`;
  toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  toast.textContent = msg;
  // "Melden" öffnet eine Mail an support@ mit dieser Meldung, Version und
  // Gerät (seit 17.11.2026). Dann steht der Toast länger, damit man ihn
  // überhaupt erwischt.
  if (melden) {
    const link = document.createElement('a');
    link.className = 'toast__melden';
    link.href = supportMailLink({ fehler: msg });
    link.textContent = 'Melden';
    toast.append(' ', link);
  }
  document.body.appendChild(toast);

  // Fehler stehen länger – man muss sie lesen können
  const hold = melden ? 8000 : variant === 'error' ? 4200 : 2000;
  setTimeout(() => toast.classList.add('toast--hide'), hold);
  setTimeout(() => toast.remove(), hold + 500);
}

/**
 * @param {object} [o]
 * @param {boolean} [o.melden]  "Melden" anbieten. Aus bei Meldungen, die kein
 *   Fehler der App sind – kein Netz, kein Standort, Browser blockiert.
 */
export function showError(msg, { melden = true } = {}) {
  showToast(msg, 'error', { melden });
}

// Führt eine Aktion aus und meldet einen Fehlschlag sichtbar, statt ihn zu
// verschlucken. Gibt true zurück, wenn es geklappt hat.
export async function runWithFeedback(action, { failure, success } = {}) {
  try {
    await action();
    if (success) showToast(success);
    return true;
  } catch (e) {
    // Die technische Meldung bleibt in der Konsole, im Toast steht die
    // verständliche Entsprechung (siehe userMessage in supabase.js).
    console.error(failure || 'Aktion fehlgeschlagen', e);
    const detail = e.userMessage || e.message || 'unbekannter Fehler';
    showError(`${failure || 'Aktion fehlgeschlagen'} – ${detail}`);
    return false;
  }
}
