// Ein geteilter Saisonrückblick: opernlog.de/rueckblick/<nutzer>/<anfangsjahr>
// (vercel.json leitet hierher). Seit 18.11.2026, siehe api/_gemeinsam.mjs.
//
// Gerechnet wird wie in der App (buildSeasonReview, src/data/season.js), aus
// allen Abenden der Person – auch den früheren, denn "neue Häuser" hängen
// davon ab.

import { buildSeasonReview, seasonLabel } from '../src/data/season.js';
import { SEITE, UUID, maske, holen, katalogLaden, alsBesuch, sterneZeichen, seite, nichtDa, antwort } from './_gemeinsam.mjs';

const zahl = n => new Intl.NumberFormat('de-DE').format(n);
const mehrzahl = (n, eins, viele) => `${zahl(n)} ${n === 1 ? eins : viele}`;

export function rueckblickSeite({ r, profil, nutzer }) {
    const name = profil?.username || 'Jemand';
    const kurz = [
        mehrzahl(r.visitCount, 'Abend', 'Abende'),
        mehrzahl(r.operaCount, 'Werk', 'Werke'),
        mehrzahl(r.houseCount, 'Haus', 'Häuser'),
    ].join(' · ');
    const zeilen = [
        r.houseCount > 1 && r.topHouse?.house && `<dt>Stammhaus</dt><dd>${maske(r.topHouse.house.name)}</dd>`,
        r.topComposer && `<dt>Komponist</dt><dd>${maske(r.topComposer.wert)}</dd>`,
        r.topConductor && `<dt>Dirigent</dt><dd>${maske(r.topConductor.wert)}</dd>`,
        r.topVoices?.length && `<dt>Meistgehört</dt><dd>${maske(r.topVoices[0].name)}</dd>`,
        r.operaCount > 1 && r.bestVisit?.opera && `<dt>Bester Abend</dt><dd>${maske(r.bestVisit.opera.title)}</dd>`,
        r.ratings?.length && `<dt>Im Schnitt</dt><dd class="sterne">${sterneZeichen(r.avgRating)} <span class="ort">${r.avgRating.toFixed(1).replace('.', ',')}</span></dd>`,
        r.travelKm > 0 && `<dt>Unterwegs</dt><dd>${zahl(r.travelKm)} km zwischen den Häusern</dd>`,
    ].filter(Boolean).join('');
    const liste = (eintraege) => `
      <ul class="liste">
${eintraege.join('\n')}
      </ul>`;
    const werke = r.werkeRang.map(({ opera, anzahl }) =>
        `        <li><a href="/oper/${encodeURIComponent(opera.id)}/">${maske(opera.title)}</a>${opera.composer ? ` <span class="ort">${maske(opera.composer)}</span>` : ''}${anzahl > 1 ? ` <span class="anzahl">${anzahl}×</span>` : ''}</li>`);
    const haeuser = r.haeuserRang.map(({ house, anzahl }) =>
        `        <li><a href="/haus/${encodeURIComponent(house.id)}/">${maske(house.name)}</a>${house.city && !house.name.includes(house.city) ? ` <span class="ort">${maske(house.city)}</span>` : ''}${anzahl > 1 ? ` <span class="anzahl">${anzahl}×</span>` : ''}</li>`);

    return seite({
        titel: `Spielzeit ${r.label} von ${name}: ${kurz} | OpernLog`,
        beschreibung: `Opernsaison ${r.label} von ${name}: ${r.werkeRang.slice(0, 4).map(w => w.opera.title).join(', ')}${r.werkeRang.length > 4 ? ' und mehr' : ''}. Auf OpernLog.`,
        url: `${SEITE}/rueckblick/${nutzer}/${r.startYear}`,
        bild: `${SEITE}/icons/vorschau.png`,
        // Weiter zum Rückblick in der App nur für die Person selbst: einen
        // fremden Rückblick kann die App nicht zeigen. Alle anderen führt der
        // Knopf auf die Startseite.
        app: '/',
        sofort: nutzer,
        ziel: `/#/season/${r.startYear}`,
        knopf: 'OpernLog öffnen',
        inhalt: `
    <article class="rueckblick">
      <p class="unterzeile">Der Saisonrückblick von <strong>${maske(name)}</strong></p>
      <h1>Spielzeit ${maske(r.label)}</h1>
      <p class="unterzeile">${kurz}</p>
      ${zeilen ? `<dl class="fakten">${zeilen}</dl>` : ''}
      <h2>${r.werkeRang.length === 1 ? 'Das Werk' : 'Die Werke'}</h2>${liste(werke)}
      <h2>${r.haeuserRang.length === 1 ? 'Das Haus' : 'Die Häuser'}</h2>${liste(haeuser)}
    </article>`,
    });
}

export async function seiteFuer(nutzer, jahr, { abruf = fetch } = {}) {
    const startJahr = Number(jahr);
    if (!UUID.test(nutzer || '') || !/^\d{4}$/.test(jahr || '')) return antwort(nichtDa('Rückblick'), 404);
    const [zeilen, profile] = await Promise.all([
        holen(`visits?user_id=eq.${nutzer}&select=*`, { abruf }),
        holen(`profiles?id=eq.${nutzer}&select=username`, { abruf }),
        katalogLaden({ abruf }),
    ]);
    const r = buildSeasonReview(zeilen.map(alsBesuch), startJahr);
    if (r.leer) return antwort(nichtDa(`Rückblick ${seasonLabel(startJahr)}`), 404);
    return antwort(rueckblickSeite({ r, profil: profile[0], nutzer }));
}

export default {
    async fetch(request) {
        const p = new URL(request.url).searchParams;
        try {
            return await seiteFuer(p.get('nutzer'), p.get('jahr'));
        } catch (e) {
            console.error('[rueckblick]', e);
            return new Response('Gerade nicht erreichbar.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
    },
};
