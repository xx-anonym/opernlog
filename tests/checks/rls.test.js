// Die Zugriffsregeln stehen in .sql-Dateien unter supabase/, die von Hand im
// Supabase-Dashboard ausgeführt werden. Niemand sieht sie im Alltag – und eine
// Regel zu viel fällt erst auf, wenn jemand danach sucht. Deshalb hier
// festgehalten, was bewusst öffentlich ist.
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
 * und in supabase/migrations/friend_requests_migration.sql steht ein ganzer
 * stillgelegter Auslöser in einem Blockkommentar.
 */
function sqlOhneKommentare(datei) {
    return fs.readFileSync(path.join(WURZEL, datei), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map(z => z.replace(/--.*$/, '')).join('\n');
}

// Das Basisschema plus jede Migration darunter. Getrennt aufgeführt, weil das
// Schema keine Migration ist; der Inhalt ist derselbe wie früher, als alle
// .sql-Dateien im Wurzelverzeichnis lagen.
const migrationen = 'supabase/migrations';
const sqlDateien = [
    ...fs.readdirSync(path.join(WURZEL, migrationen))
        .filter(f => f.endsWith('.sql'))
        .map(f => `${migrationen}/${f}`),
    'supabase/schema.sql',
];
const allesSql = sqlDateien.map(sqlOhneKommentare).join('\n');
const schema = sqlOhneKommentare('supabase/schema.sql');

// OpernLog ist ein öffentliches Tagebuch: Haus- und Opernseiten zeigen die
// Abende aller, und die Community-Statistik lebt davon. Diese Tabellen sind
// deshalb absichtlich für jeden lesbar. Kommt eine weitere hinzu, soll dieser
// Test fehlschlagen – damit das eine Entscheidung bleibt und keine Nebenwirkung.
// bild_ausschnitte gehört zum Katalog (der Teil eines Bildes, der zu sehen
// ist) und enthält nichts über Personen; die Katalogtabellen selbst legen
// ihre Regeln in einer Schleife an und stehen deshalb nicht hier.
// seen_operas ist seit dem 30.9.2026 öffentlich: die Sammlungen von Freunden
// zählen ihre Markierungen mit (schon_gesehen_oeffentlich_migration.sql).
const OEFFENTLICH_LESBAR = ['bild_ausschnitte', 'comments', 'follows', 'likes', 'profiles', 'seen_operas', 'visits'];

function oeffentlichLesbareTabellen(sql) {
    return [...sql.matchAll(/CREATE POLICY\s+"[^"]*"\s+ON\s+(\w+)\s+FOR SELECT\s+USING\s*\(\s*true\s*\)/gi)]
        .map(m => m[1]).sort();
}

test('nur die bewusst öffentlichen Tabellen sind für jeden lesbar', () => {
    assert.deepEqual([...new Set(oeffentlichLesbareTabellen(allesSql))], OEFFENTLICH_LESBAR);
});

// Momentaufnahmen, die man freigibt, sehen nur Freunde – nie Dritte und nie
// ohne Anmeldung (Jonas, 1.10.2026). Freunde heißt: gegenseitig gefolgt.
// Einseitig folgen kann jeder von sich aus ("User kann folgen"); das allein
// darf nichts freischalten. Die Dateien fragen dieselbe Regel ab.
test('Momentaufnahmen: freigegebene nur für Freunde, nichts ohne Anmeldung', () => {
    const datei = sqlOhneKommentare('supabase/migrations/andenken_migration.sql');
    const regel = (tabelle, name) => datei.split(';')
        .find(stelle => new RegExp(`CREATE POLICY\\s+"${name}"\\s+ON\\s+${tabelle}\\s`, 'i').test(stelle));
    const lesen = regel('andenken', 'Andenken lesen');
    assert.ok(lesen, 'Regel "Andenken lesen" fehlt');
    assert.match(lesen, /FOR SELECT\s+TO authenticated\s/i);
    assert.match(lesen, /f\.follower_id = andenken\.user_id\s+AND f\.following_id = \(SELECT auth\.uid\(\)\)/i);
    assert.match(lesen, /f\.follower_id = \(SELECT auth\.uid\(\)\)\s+AND f\.following_id = andenken\.user_id/i);
    const ansehen = regel('storage\\.objects', 'Andenken ansehen');
    assert.ok(ansehen, 'Regel "Andenken ansehen" fehlt');
    assert.match(ansehen, /FOR SELECT\s+TO authenticated\s/i);
    assert.match(ansehen, /FROM public\.andenken a/i);
    // Kein Leserecht für anon – auch nicht aus einer anderen Datei.
    assert.doesNotMatch(allesSql, /GRANT[^;]*SELECT[^;]*ON\s+andenken\s+TO[^;]*anon/i);
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

test('auf jeder Tabelle ist RLS eingeschaltet', () => {
    // Ohne ENABLE ROW LEVEL SECURITY sind alle Regeln darunter wirkungslos.
    // Über alle Dateien: Tabellen aus späteren Migrationen zählen genauso.
    //
    // \s+ statt eines festen Leerzeichens: an ausgerichteten Spalten hat
    // dieser Test schon einmal Alarm geschlagen, obwohl RLS eingeschaltet war.
    const tabellen = [...allesSql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)].map(m => m[1]);
    const mitRls = new Set(
        [...allesSql.matchAll(/ALTER TABLE\s+(\w+)\s+ENABLE ROW LEVEL SECURITY/gi)].map(m => m[1])
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

test('keine Regel ruft auth.uid() für jede Zeile neu auf', () => {
    // auth.uid() direkt in einer Regel wertet Postgres je Zeile aus, in
    // (SELECT auth.uid()) gefasst einmal je Abfrage – gleiche Bedeutung,
    // siehe supabase/migrations/rls_leistung_migration.sql. Die älteren
    // Dateien legen ihre Regeln noch in der langsamen Form an; das zählt als
    // erledigt, sobald eine Migration dieselbe Regel per ALTER POLICY umstellt.
    const nackt = /(?<!SELECT\s+)auth\.uid\(\)/i;
    const regeln = sqlDateien.flatMap(datei => sqlOhneKommentare(datei).split(';').map((stelle) => {
        const m = stelle.trim().match(/^(CREATE|ALTER) POLICY\s+"([^"]+)"\s+ON\s+(?:public\.)?(\w+)/i);
        return m && { art: m[1].toUpperCase(), name: `${m[3]}: ${m[2]}`, nackt: nackt.test(stelle), datei };
    })).filter(Boolean);
    const umgestellt = new Set(regeln.filter(r => r.art === 'ALTER' && !r.nackt).map(r => r.name));
    const offen = regeln.filter(r => r.nackt && (r.art === 'ALTER' || !umgestellt.has(r.name)))
        .map(r => `${r.datei}: ${r.name}`);
    assert.deepEqual(offen, [], `auth.uid() ohne SELECT:\n  ${offen.join('\n  ')}`);
});

test('die Anwendung liest invites nirgends – sonst bräche die neue Regel etwas', () => {
    const store = fs.readFileSync(path.join(WURZEL, 'src/store/supabase.js'), 'utf8');
    const zugriffe = [...store.matchAll(/from\('invites'\)\s*\.?\s*(\w+)/g)].map(m => m[1]);
    assert.deepEqual([...new Set(zugriffe)], ['insert']);
});

// Postgres lässt jede neue Funktion von PUBLIC ausführen, also auch ohne
// Anmeldung über /rest/v1/rpc/…. Bei einer Funktion mit Besitzerrechten muss
// deshalb jede Migration sagen, wer sie aufrufen darf – ein REVOKE nur von
// anon wirkt nicht, anon erbt das Recht über PUBLIC. Ohne Anmeldung aufrufbar
// bleiben nur die hier genannten; siehe funktionsrechte_migration.sql.
const OHNE_ANMELDUNG_AUFRUFBAR = ['pending_suggestion_counts'];

function definerFunktionen() {
    const namen = new Set();
    for (const datei of sqlDateien) {
        for (const block of sqlOhneKommentare(datei).split(/CREATE (?:OR REPLACE )?FUNCTION/i).slice(1)) {
            if (!/SECURITY DEFINER/i.test(block.split(/\$\$;/)[0])) continue;
            namen.add(block.trim().split('(')[0].trim().replace(/^public\./i, '').toLowerCase());
        }
    }
    return [...namen].sort();
}

test('jede SECURITY-DEFINER-Funktion nimmt PUBLIC das Ausführen', () => {
    const offen = definerFunktionen().filter(name => !new RegExp(
        String.raw`REVOKE\s+(ALL|EXECUTE)\b[^;]*\bON\s+FUNCTION\s+(public\.)?${name}\s*\([^;]*\bFROM\b[^;]*\bPUBLIC\b`, 'i').test(allesSql));
    assert.deepEqual(offen, [], `ohne REVOKE … FROM PUBLIC:\n  ${offen.join('\n  ')}`);
});

test('ohne Anmeldung aufrufbar sind nur die bewusst offenen Funktionen', () => {
    const fuerAnon = definerFunktionen().filter(name => new RegExp(
        String.raw`GRANT\s+(ALL|EXECUTE)\b[^;]*\bON\s+FUNCTION\s+(public\.)?${name}\s*\([^;]*\bTO\b[^;]*\banon\b`, 'i').test(allesSql));
    assert.deepEqual(fuerAnon, OHNE_ANMELDUNG_AUFRUFBAR);
});

// Ab dem 30. Oktober 2026 gibt Supabase neuen Tabellen in public keine Rechte
// für die Datenschnittstelle mehr von selbst (Mail vom 23.9.2026). Eine
// Tabelle ohne GRANT ist dann für supabase-js unerreichbar – die App bekäme
// "permission denied". Die Tabellen bis heute behalten ihre Rechte. Jede neue
// muss in ihrer Migration sagen, wer darf: GRANT an anon/authenticated, oder
// REVOKE ALL, wenn nur SECURITY-DEFINER-Funktionen an sie heranmüssen.
const TABELLEN_MIT_ALTEN_RECHTEN = ['admins', 'catalog_composers', 'catalog_houses', 'catalog_operas', 'comments', 'follows',
    'friend_requests', 'invites', 'likes', 'lists', 'profiles', 'push_abos', 'push_protokoll', 'seen_operas', 'suggestions', 'visits'];

test('jede neue Tabelle regelt ihre Rechte selbst', () => {
    for (const datei of sqlDateien) {
        const sql = sqlOhneKommentare(datei);
        for (const m of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)/gi)) {
            const tabelle = m[1].toLowerCase();
            if (TABELLEN_MIT_ALTEN_RECHTEN.includes(tabelle)) continue;
            const geregelt = new RegExp(String.raw`GRANT\b[^;]*\bON\s+(TABLE\s+)?(public\.)?${tabelle}\b[^;]*\bTO\b|REVOKE\s+ALL\b[^;]*\bON\s+(TABLE\s+)?(public\.)?${tabelle}\b`, 'i');
            assert.match(sql, geregelt, `${datei}: Tabelle ${tabelle} ohne GRANT oder REVOKE – ab 30.10.2026 für die App sonst unerreichbar`);
        }
    }
});
