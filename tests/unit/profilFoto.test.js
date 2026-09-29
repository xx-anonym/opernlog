// Profilfotos: eine Wikimedia-Adresse in profiles.avatar_icon statt eines Instruments.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderAvatarHTML, profilFoto, FOTO_BREITE, WIKIMEDIA_BREITEN } from '../../src/data/profileIcons.js';
import { BILD_BREITE } from '../../src/data/katalogRegeln.js';

const ORIGINAL = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Maria_Callas.jpg';
const VORSCHAU = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Maria_Callas.jpg/250px-Maria_Callas.jpg';

test('eine Wikimedia-Adresse wird zum Foto, in kleiner Vorschaufassung', () => {
    assert.equal(profilFoto(ORIGINAL), VORSCHAU);
    assert.equal(profilFoto(VORSCHAU.replace('250px', '500px')), VORSCHAU);
    const html = renderAvatarHTML('MC', ORIGINAL);
    assert.match(html, /<img class="avatar-foto" src="https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/a\/ab\/Maria_Callas\.jpg\/250px-Maria_Callas\.jpg"/);
    // Das Monogramm bleibt darunter stehen, falls das Bild nicht lädt.
    assert.match(html, /<span class="avatar-initials">MC<\/span>/);
});

test('andere Hosts, http und Unfug ergeben kein Foto', () => {
    for (const wert of ['https://example.org/bild.jpg', 'http://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg',
        'javascript:alert(1)', 'violin-foto', '', null, undefined, 42]) {
        assert.equal(profilFoto(wert), null, String(wert));
        assert.doesNotMatch(renderAvatarHTML('AB', wert), /<img/, String(wert));
    }
});

test('Anführungszeichen in der Adresse brechen nicht aus dem src-Attribut aus', () => {
    const html = renderAvatarHTML('AB', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg" onerror="alert(1)');
    assert.doesNotMatch(html, /" onerror=/);
});

test('Instrumente funktionieren wie bisher', () => {
    const html = renderAvatarHTML('AB', 'violin');
    assert.match(html, /class="avatar-icon"/);
    assert.doesNotMatch(html, /<img/);
});

test('die Vorschaubreiten sind solche, die Wikimedia auch ausliefert', () => {
    // Andere Breiten beantwortet Wikimedia mit HTTP 400 – im Browser eine
    // Kachel mit Fragezeichen statt des Bildes.
    assert.ok(WIKIMEDIA_BREITEN.includes(FOTO_BREITE), `Profilfoto: ${FOTO_BREITE}`);
    assert.ok(WIKIMEDIA_BREITEN.includes(BILD_BREITE), `Katalog: ${BILD_BREITE}`);
});

test('Anhänge aus Commons (?utm_source=…) fallen weg', () => {
    assert.equal(profilFoto(ORIGINAL + '?utm_source=commons.wikimedia.org&utm_content=original$0'), VORSCHAU);
});
