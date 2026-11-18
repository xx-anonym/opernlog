// Ein geteilter Abend: opernlog.de/abend/<id> (vercel.json leitet hierher).
// Seit 18.11.2026, siehe api/_gemeinsam.mjs.

import { operas } from '../src/data/operas.js';
import { operaHouses } from '../src/data/operaHouses.js';
import { besetzungLesen } from '../src/data/besetzung.js';
import { abendDatum } from '../src/components/Teilbild.js';
import { SEITE, UUID, maske, holen, katalogLaden, sterneZeichen, bildTeil, seite, nichtDa, antwort } from './_gemeinsam.mjs';

export function abendSeite({ besuch, profil, werk, haus }) {
    const name = profil?.username || 'Jemand';
    const titelWerk = werk?.title || 'Ein Abend in der Oper';
    const datum = abendDatum(besuch.date);
    const sterne = Number(besuch.rating) > 0 ? sterneZeichen(besuch.rating) : '';
    const review = String(besuch.review ?? '').trim();
    const dirigent = String(besuch.conductor ?? '').trim();
    const regie = String(besuch.director ?? '').trim();
    const besetzung = besetzungLesen(String(besuch.cast_list ?? ''));

    const hausText = haus ? `${haus.name}${haus.city && !haus.name.includes(haus.city) ? `, ${haus.city}` : ''}` : '';
    const titel = [titelWerk, hausText].filter(Boolean).join(' – ') + (sterne ? ` · ${sterne}` : '');
    const beschreibung = review
        ? `„${review.length > 180 ? `${review.slice(0, 177).trimEnd()}…` : review}“ – ${name} auf OpernLog`
        : `${name} war${datum ? ` am ${datum}` : ''} in ${titelWerk}${haus ? ` (${hausText})` : ''}. Auf OpernLog.`;

    const zeilen = [
        haus && `<dt>Haus</dt><dd><a href="/haus/${encodeURIComponent(haus.id)}/">${maske(haus.name)}</a>${haus.city && !haus.name.includes(haus.city) ? `, ${maske(haus.city)}` : ''}</dd>`,
        datum && `<dt>Datum</dt><dd>${maske(datum)}</dd>`,
        sterne && `<dt>Bewertung</dt><dd class="sterne" aria-label="${maske(String(besuch.rating).replace('.', ','))} von 5 Sternen">${sterne}</dd>`,
        dirigent && `<dt>Dirigent</dt><dd>${maske(dirigent)}</dd>`,
        regie && `<dt>Regie</dt><dd>${maske(regie)}</dd>`,
    ].filter(Boolean).join('');
    const besetzungTeil = besetzung.length ? `
      <h2>Besetzung</h2>
      <ul class="liste">
${besetzung.map(p => `        <li>${maske(p.name)}${p.rolle ? ` <span class="ort">${maske(p.rolle)}</span>` : ''}</li>`).join('\n')}
      </ul>` : '';

    return seite({
        titel: `${titel} | OpernLog`,
        beschreibung,
        url: `${SEITE}/abend/${besuch.id}`,
        bild: werk?.image,
        app: `/#/visit/${besuch.id}`,
        sofort: 'immer',
        inhalt: `
    <article class="abend">
      <p class="unterzeile">Ein Abend von <strong>${maske(name)}</strong></p>
      <h1>${werk ? `<a class="still" href="/oper/${encodeURIComponent(werk.id)}/">${maske(werk.title)}</a>` : maske(titelWerk)}</h1>
      ${werk?.composer ? `<p class="unterzeile">von ${maske(werk.composer)}</p>` : ''}
      ${review ? `<blockquote class="review">${maske(review)}</blockquote>` : ''}
      ${zeilen ? `<dl class="fakten">${zeilen}</dl>` : ''}${besetzungTeil}${bildTeil(werk?.image, titelWerk)}
    </article>`,
    });
}

export async function seiteFuer(id, { abruf = fetch } = {}) {
    if (!UUID.test(id || '')) return antwort(nichtDa('Abend'), 404);
    const [besuch] = await holen(`visits?id=eq.${id}&select=*`, { abruf });
    if (!besuch) return antwort(nichtDa('Abend'), 404);
    const [profile] = await Promise.all([
        holen(`profiles?id=eq.${besuch.user_id}&select=username`, { abruf }),
        katalogLaden({ abruf }),
    ]);
    const profil = profile[0];
    const werk = operas.find(o => o.id === besuch.opera_id);
    const haus = operaHouses.find(h => h.id === besuch.house_id);
    return antwort(abendSeite({ besuch, profil, werk, haus }));
}

export default {
    async fetch(request) {
        const id = new URL(request.url).searchParams.get('id');
        try {
            return await seiteFuer(id);
        } catch (e) {
            console.error('[abend]', e);
            return new Response('Gerade nicht erreichbar.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
    },
};
