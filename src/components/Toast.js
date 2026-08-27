// Kurze Rückmeldung am unteren Bildschirmrand.
//
// Bewusst zentral: Fehlgeschlagene Schreibvorgänge müssen den Nutzer
// erreichen. Vorher landeten sie in console.warn, die Oberfläche meldete
// Erfolg – und die Änderung war beim nächsten Laden verschwunden.

export function showToast(msg, variant = 'info') {
  const toast = document.createElement('div');
  // bewusst ohne .fade-in – siehe Kommentar bei .toast in style.css
  toast.className = `toast toast--${variant}`;
  toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  toast.textContent = msg;
  document.body.appendChild(toast);

  // Fehler stehen länger – man muss sie lesen können
  const hold = variant === 'error' ? 4200 : 2000;
  setTimeout(() => toast.classList.add('toast--hide'), hold);
  setTimeout(() => toast.remove(), hold + 500);
}

export function showError(msg) {
  showToast(msg, 'error');
}

// Führt eine Aktion aus und meldet einen Fehlschlag sichtbar, statt ihn zu
// verschlucken. Gibt true zurück, wenn es geklappt hat.
export async function runWithFeedback(action, { failure, success } = {}) {
  try {
    await action();
    if (success) showToast(success);
    return true;
  } catch (e) {
    console.error(failure || 'Aktion fehlgeschlagen', e);
    showError(`${failure || 'Aktion fehlgeschlagen'} – ${e.message || 'unbekannter Fehler'}`);
    return false;
  }
}
