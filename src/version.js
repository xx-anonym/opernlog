// Die Versionsnummer der App – eine Stelle, von der alles andere abschreibt.
//
// Kalenderversion JJJJ.MM.TT. Eine PWA erneuert sich still im Hintergrund;
// wer nach der Version fragt, will fast immer wissen, wie alt sein Stand ist,
// und nicht, ob sich die zweite Ziffer geändert hat. Das Datum beantwortet
// genau diese Frage ohne Umrechnung.
//
// Beim Erhöhen muss CACHE_NAME in sw.js mitwandern. Zusammenlegen geht nicht:
// sw.js läuft als klassischer Worker und kann kein ES-Modul importieren.
// Dass beide übereinstimmen, prüft tests/checks/version.test.js.
export const VERSION = '2026.09.10';
