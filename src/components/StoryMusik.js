// Musik unter der Story (src/components/Story.js). Welches Stück, steht in
// src/data/musik.js.
//
// Sie beginnt mit dem Antippen, das die Story öffnet – ohne diese Geste
// spielt kein Browser Ton ab –, blendet sanft ein, hält beim Gedrückthalten
// und im Hintergrund an und blendet beim Schließen aus. Ein Knopf schaltet
// sie ab; das merkt sich das Gerät. Am Ende des Stücks ist einfach Stille.
//
// Die Lautstärke läuft über Web Audio (GainNode): auf dem iPhone lässt sich
// die Lautstärke eines <audio> nicht setzen, Ein- und Ausblenden ginge sonst
// nicht. Die Audio-Sitzung ist "ambient", wie bei Instagram: der
// Stummschalter des iPhones gilt, und Musik anderer Apps läuft weiter.

const SCHLUESSEL = 'opernlog_story_ton';
const LAUT = 0.8;

/** Ob der Ton an ist. Ohne Speicher (privates Fenster): an. */
export function tonAn() {
    try { return localStorage.getItem(SCHLUESSEL) !== 'aus'; } catch { return true; }
}

function tonMerken(an) {
    try {
        if (an) localStorage.removeItem(SCHLUESSEL);
        else localStorage.setItem(SCHLUESSEL, 'aus');
    } catch { /* dann eben nur für diesmal */ }
}

/**
 * Muss innerhalb der Nutzergeste aufgerufen werden, die die Story öffnet.
 * @param {HTMLElement} ort  wohin das <audio> kommt (das Story-Fenster)
 * @param {string} datei
 */
export function storyMusik(ort, datei) {
    const audio = document.createElement('audio');
    audio.className = 'story__musik';
    audio.preload = 'auto';
    audio.src = datei;
    ort.appendChild(audio);

    let ctx = null;
    let lautstaerke = null;
    try {
        const Kontext = window.AudioContext || window.webkitAudioContext;
        if (Kontext) {
            ctx = new Kontext();
            lautstaerke = ctx.createGain();
            lautstaerke.gain.value = 0;
            ctx.createMediaElementSource(audio).connect(lautstaerke).connect(ctx.destination);
        }
    } catch (e) {
        // Ohne Web Audio spielt das <audio> direkt, nur ohne Blenden.
        ctx = null;
        lautstaerke = null;
    }

    const sitzung = navigator.audioSession;
    const sitzungVorher = sitzung?.type;
    try { if (sitzung) sitzung.type = 'ambient'; } catch { /* ältere Browser */ }

    let an = tonAn();
    let angehalten = false;
    let pausenTimer = null;

    function blende(ziel, sekunden) {
        if (!lautstaerke) return;
        const jetzt = ctx.currentTime;
        lautstaerke.gain.cancelScheduledValues(jetzt);
        lautstaerke.gain.setValueAtTime(lautstaerke.gain.value, jetzt);
        lautstaerke.gain.linearRampToValueAtTime(ziel, jetzt + sekunden);
    }

    function spielen(sekunden) {
        clearTimeout(pausenTimer);
        if (!an || angehalten || audio.ended) return;
        ctx?.resume().catch(() => {});
        // Lehnt der Browser ab, läuft die Story eben ohne Ton.
        audio.play()?.catch(() => {});
        blende(LAUT, sekunden);
    }

    function stoppen(sekunden) {
        blende(0, sekunden);
        clearTimeout(pausenTimer);
        pausenTimer = setTimeout(() => audio.pause(), lautstaerke ? sekunden * 1000 : 0);
    }

    spielen(2.5);

    return {
        audio,
        get an() { return an; },
        /** Gedrückthalten oder im Hintergrund */
        anhalten(ja) {
            angehalten = ja;
            if (ja) stoppen(0.25);
            else spielen(0.5);
        },
        /** Der Ton-Knopf; gibt zurück, ob der Ton jetzt an ist. */
        umschalten() {
            an = !an;
            tonMerken(an);
            if (an) spielen(0.6);
            else stoppen(0.3);
            return an;
        },
        beenden() {
            // Ein <audio>, das mit dem Fenster aus der Seite fällt, hält der
            // Browser sofort an – die Ausblende wäre nie zu hören. Deshalb
            // zieht es zum Ausblenden kurz in den <body> um.
            document.body.appendChild(audio);
            stoppen(0.8);
            setTimeout(() => {
                audio.remove();
                ctx?.close().catch(() => {});
                try { if (sitzung && sitzungVorher) sitzung.type = sitzungVorher; } catch { /* egal */ }
            }, 900);
        },
    };
}
