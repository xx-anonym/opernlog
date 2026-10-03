# Musik

## cavalleria-intermezzo.mp3

Läuft unter der Story des Saisonrückblicks (`src/components/StoryMusik.js`).

- Werk: Pietro Mascagni, *Cavalleria rusticana*, Intermezzo sinfonico
- Aufnahme: Fulda Symphonic Orchestra, Leitung Simon Schindler, Großer Saal der Orangerie Fulda, 10. März 2002
- Quelle: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Pietro_Mascagni_-_Cavalleria_Rusticana_-_Intermezzo_Sinfonico.ogg) (MP3-Fassung von Commons)
- Lizenz: [EFF Open Audio License 1.0](https://web.archive.org/web/20070208085151/http://www.eff.org/IP/Open_licenses/20010421_eff_oal_1.0.html). Diese Datei steht unter derselben Lizenz.
- Bearbeitung (3.10.2026): erste Sekunde abgeschnitten, leicht komprimiert (der leise Anfang war am Handy kaum zu hören), als MP3 mit etwa 100 kbit/s neu kodiert:

```
ffmpeg -ss 1.0 -i original.mp3 -af "acompressor=threshold=-34dB:ratio=2:attack=300:release=1500:makeup=1,volume=10dB,alimiter=limit=0.89:level=false,aresample=44100" -map_metadata -1 -c:a libmp3lame -q:a 6 cavalleria-intermezzo.mp3
```
