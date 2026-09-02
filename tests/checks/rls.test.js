// Die Zugriffsregeln stehen in .sql-Dateien, die von Hand im Supabase-Dashboard
// ausgeführt werden. Niemand sieht sie im Alltag – und eine Regel zu viel fällt
// erst auf, wenn jemand danach sucht. Deshalb hier festgehalten, was bewusst
// öffentlich ist.
//
// Der anon-Schlüssel steckt in jedem ausgelieferten Bundle; er muss das, sonst
// käme die Seite nicht an ihre Daten. "Öffentlich lesbar" heißt darum wörtlich:
// jeder im Netz kann die Tabelle abfragen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * SQL ohne Kommentare. Beide Formen müssen weg: die Erklärungen über einer
 * Regel nennen oft genau das, was sie abschafft ("Bisher galt USING (true)"),
 * und in friend_requests_migration.sql steht ein ganzer stillgelegter
 * Auslöser in einem Blockkommentar.
 */
function sqlOhneKommentare(datei) {
    return fs.readFileSync(path.join(WURZEL, datei), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map(z => z.replace(/--.*$/, '')).join('\n');
}

const sqlDateien = fs.readdirSync(WURZEL).filter(f => f.endsWith('.sql'));
const allesSql = sqlDateien.map(sqlOhneKommentare).join('\n');
const schema = sqlOhneKommentare('supabase_schema.sql');

// OpernLog ist ein öffentliches Tagebuch: Haus- und Opernseiten zeigen die
// Abende aller, und die Community-Statistik lebt davon. Diese Tabellen sind
// deshalb absichtlich für jeden lesbar. Kommt eine weitere hinzu, soll dieser
// Test fehlschlagen – damit das eine Entscheidung bleibt und keine Nebenwirkung.
const OEFFENTLICH_LESBAR = ['comments', 'follows', 'likes', 'profiles', 'visits'];

function oeffentlichLesbareTabellen(sql) {
    return [...sql.matchAll(/CREATE POLICY\s+"[^"]*"\s+ON\s+(\w+)\s+FOR SELECT\s+USING\s*\(\s*true\s*\)/gi)]
        .map(m => m[1]).sort();
}

test('nur die bewusst öffentlichen Tabellen sind für jeden lesbar', () => {
    assert.deepEqual([...new Set(oeffentlichLesbareTabellen(allesSql))], OEFFENTLICH_LESBAR);
});

test('Einladungscodes sind nicht öffentlich lesbar', () => {
    // Wer die Codes lesen kann, kann sich über accept_invite() zum
    // gegenseitigen Kontakt jedes Nutzers machen, der je einen Link erzeugt hat.
    assert.ok(!oeffentlichLesbareTabellen(allesSql).includes('invites'));
    // Bis zum Zeilenende lesen: auth.uid() enthält selbst eine Klammer, ein
    // [^)]* bräche mittendrin ab.
    const regel = schema.match(/CREATE POLICY\s+"[^"]*"\s+ON\s+invites\s+FOR SELECT\s+USING\s*(.*)/i);
    assert.ok(regel, 'invites braucht eine SELECT-Regel, sonst sieht niemand seine eigenen');
    assert.match(regel[1], /auth\.uid\(\)\s*=\s*created_by/);
});

test('Markierungen "schon gesehen" bleiben privat', () => {
    assert.ok(!oeffentlichLesbareTabellen(allesSql).includes('seen_operas'));
});

test('auf jeder Tabelle ist RLS eingeschaltet', () => {
    // Ohne ENABLE ROW LEVEL SECURITY sind alle Regeln darunter wirkungslos.
    // Über alle Dateien: Tabellen aus späteren Migrationen zählen genauso.
    const tabellen = [...allesSql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)].map(m => m[1]);
    const mitRls = new Set(
        [...allesSql.matchAll(/ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY/gi)].map(m => m[1])
    );
    const ohne = [...new Set(tabellen)].filter(t => !mitRls.has(t));
    assert.deepEqual(ohne, [], `ohne RLS: ${ohne.join(', ')}`);
});

test('jede SECURITY-DEFINER-Funktion setzt search_path', () => {
    // Eine Funktion mit Besitzerrechten, die unqualifizierte Namen über den
    // search_path des Aufrufers auflöst, lässt sich unterschieben.
    const fehlend = [];
    for (const datei of sqlDateien) {
        const sql = sqlOhneKommentare(datei);
        const bloecke = sql.split(/CREATE (?:OR REPLACE )?FUNCTION/i).slice(1);
        bloecke.forEach((block) => {
            const koerper = block.split(/\$\$;/)[0];
            if (!/SECURITY DEFINER/i.test(koerper)) return;
            if (/SET\s+search_path/i.test(koerper)) return;
            fehlend.push(`${datei}: ${koerper.trim().split('(')[0].trim()}`);
        });
    }
    assert.deepEqual(fehlend, [], `ohne SET search_path:\n  ${fehlend.join('\n  ')}`);
});

test('die Anwendung liest invites nirgends – sonst bräche die neue Regel etwas', () => {
    const store = fs.readFileSync(path.join(WURZEL, 'src/store/supabase.js'), 'utf8');
    const zugriffe = [...store.matchAll(/from\('invites'\)\s*\.?\s*(\w+)/g)].map(m => m[1]);
    assert.deepEqual([...new Set(zugriffe)], ['insert']);
});
