// Opernhäuser – Datenkatalog
export const operaHouses = [
    // ── Bayern ────────────────────────────────────────────
    { id: 'bayerische-staatsoper', name: 'Bayerische Staatsoper', city: 'München', state: 'Bayern', capacity: 2101, founded: 1818, description: 'Eines der größten und renommiertesten Opernhäuser der Welt, gelegen am Max-Joseph-Platz im Herzen Münchens.', color: '#1a3a5c' },
    { id: 'gaertnerplatztheater', name: 'Staatstheater am Gärtnerplatz', city: 'München', state: 'Bayern', capacity: 937, founded: 1865, description: 'Münchens zweites Opernhaus – bekannt für Operette, Musical und leichtere Opernkost.', color: '#5c3a1a' },
    { id: 'festspielhaus-bayreuth', name: 'Bayreuther Festspielhaus', city: 'Bayreuth', state: 'Bayern', capacity: 1925, founded: 1876, description: 'Richard Wagners eigenes Festspielhaus auf dem Grünen Hügel – Pilgerort für Wagnerianer weltweit.', color: '#2c1810' },
    { id: 'staatstheater-nuernberg', name: 'Staatstheater Nürnberg', city: 'Nürnberg', state: 'Bayern', capacity: 1003, founded: 1905, description: 'Traditionsreiches Mehrspartenhaus in der fränkischen Metropole.', color: '#3d1f1f' },
    { id: 'theater-augsburg', name: 'Staatstheater Augsburg', city: 'Augsburg', state: 'Bayern', capacity: 955, founded: 1877, description: 'Seit 2018 Staatstheater, mit frischem Spielplan in der Fuggerstadt.', color: '#3d3d1f' },
    { id: 'theater-regensburg', name: 'Theater Regensburg', city: 'Regensburg', state: 'Bayern', capacity: 518, founded: 1804, description: 'Charmantes Opernhaus in der UNESCO-Welterbestadt.', color: '#3d3d2d' },
    { id: 'landestheater-coburg', name: 'Landestheater Coburg', city: 'Coburg', state: 'Bayern', capacity: 550, founded: 1827, description: 'Traditionsreiches Haus in der ehemaligen Residenzstadt mit starkem Ensemble.', color: '#3d1f1f' },
    { id: 'theater-passau', name: 'Landestheater Niederbayern', city: 'Passau / Landshut', state: 'Bayern', capacity: 450, founded: 1952, description: 'Reisendes Landestheater mit Spielstätten in Passau, Landshut und Straubing.', color: '#4a3520' },

    // ── Berlin ────────────────────────────────────────────
    { id: 'staatsoper-berlin', name: 'Staatsoper Unter den Linden', city: 'Berlin', state: 'Berlin', capacity: 1356, founded: 1742, description: 'Die älteste und traditionsreichste Opernbühne Berlins am Boulevard Unter den Linden.', color: '#2c1810' },
    { id: 'deutsche-oper-berlin', name: 'Deutsche Oper Berlin', city: 'Berlin', state: 'Berlin', capacity: 1865, founded: 1912, description: 'Das größte Opernhaus Berlins in Charlottenburg, bekannt für moderne Inszenierungen.', color: '#1c2833' },
    { id: 'komische-oper-berlin', name: 'Komische Oper Berlin', city: 'Berlin', state: 'Berlin', capacity: 1190, founded: 1947, description: 'Bekannt für innovatives Musiktheater und Inszenierungen, die Oper zugänglich machen.', color: '#4a1942' },

    // ── Baden-Württemberg ─────────────────────────────────
    { id: 'staatstheater-stuttgart', name: 'Staatsoper Stuttgart', city: 'Stuttgart', state: 'Baden-Württemberg', capacity: 1404, founded: 1912, description: 'Renommiertes Opernhaus mit starkem Ensemble und innovativem Spielplan.', color: '#1a2742' },
    { id: 'badisches-staatstheater', name: 'Badisches Staatstheater', city: 'Karlsruhe', state: 'Baden-Württemberg', capacity: 1002, founded: 1810, description: 'Großes Mehrspartentheater am Ettlinger Tor in Karlsruhe.', color: '#1f1f2d' },
    { id: 'theater-freiburg', name: 'Theater Freiburg', city: 'Freiburg', state: 'Baden-Württemberg', capacity: 920, founded: 1910, description: 'Innovatives Mehrspartenhaus im Breisgau mit mutigen Inszenierungen.', color: '#2d1f3d' },
    { id: 'theater-heidelberg', name: 'Theater Heidelberg', city: 'Heidelberg', state: 'Baden-Württemberg', capacity: 520, founded: 1853, description: 'Mehrspartentheater in der Universitätsstadt mit ambitioniertem Opernprogramm.', color: '#3d2815' },
    { id: 'theater-ulm', name: 'Theater Ulm', city: 'Ulm', state: 'Baden-Württemberg', capacity: 612, founded: 1641, description: 'Eines der ältesten kommunalen Theater Deutschlands an der Donau.', color: '#1f3d25' },
    { id: 'nationaltheater-mannheim', name: 'Nationaltheater Mannheim', city: 'Mannheim', state: 'Baden-Württemberg', capacity: 1200, founded: 1779, description: 'Eines der ältesten kommunalen Theater Deutschlands, gegründet von Kurfürst Karl Theodor.', color: '#3d2d1f' },

    // ── Brandenburg ───────────────────────────────────────
    { id: 'staatstheater-cottbus', name: 'Staatstheater Cottbus', city: 'Cottbus', state: 'Brandenburg', capacity: 600, founded: 1908, description: 'Das einzige Staatstheater Brandenburgs mit Jugendstil-Theatergebäude.', color: '#2d1f25' },

    // ── Bremen ────────────────────────────────────────────
    { id: 'theater-bremen', name: 'Theater Bremen', city: 'Bremen', state: 'Bremen', capacity: 800, founded: 1843, description: 'Vielseitiges Haus mit innovativem Musiktheater an der Weser.', color: '#1f3d2d' },
    { id: 'theater-bremerhaven', name: 'Stadttheater Bremerhaven', city: 'Bremerhaven', state: 'Bremen', capacity: 460, founded: 1911, description: 'Das nördlichste Stadttheater des Bundeslandes Bremen an der Wesermündung.', color: '#1f2d35' },

    // ── Hamburg ────────────────────────────────────────────
    { id: 'hamburgische-staatsoper', name: 'Hamburgische Staatsoper', city: 'Hamburg', state: 'Hamburg', capacity: 1690, founded: 1678, description: 'Eine der ältesten öffentlichen Opernbühnen Deutschlands mit erstklassigem Ballett.', color: '#154360' },

    // ── Hessen ────────────────────────────────────────────
    { id: 'oper-frankfurt', name: 'Oper Frankfurt', city: 'Frankfurt am Main', state: 'Hessen', capacity: 1369, founded: 1880, description: 'Mehrfach als „Opernhaus des Jahres" ausgezeichnet, bekannt für Regietheater.', color: '#1b2631' },
    { id: 'wuerttembergische-staatstheater', name: 'Staatstheater Wiesbaden', city: 'Wiesbaden', state: 'Hessen', capacity: 1041, founded: 1894, description: 'Das Hessische Staatstheater in der Landeshauptstadt, bekannt für die Internationalen Maifestspiele.', color: '#1f3d3d' },
    { id: 'staatstheater-kassel', name: 'Staatstheater Kassel', city: 'Kassel', state: 'Hessen', capacity: 953, founded: 1959, description: 'Mehrspartenhaus in der documenta-Stadt mit starker Operntradition.', color: '#3d1f3d' },
    { id: 'staatstheater-darmstadt', name: 'Staatstheater Darmstadt', city: 'Darmstadt', state: 'Hessen', capacity: 956, founded: 1819, description: 'Hessisches Staatstheater in der Wissenschaftsstadt mit starkem Musiktheater.', color: '#2d351f' },
    { id: 'theater-giessen', name: 'Stadttheater Gießen', city: 'Gießen', state: 'Hessen', capacity: 600, founded: 1907, description: 'Lebendiges Mehrspartenhaus in der Universitätsstadt.', color: '#1f352d' },

    // ── Mecklenburg-Vorpommern ─────────────────────────────
    { id: 'mecklenburgisches-staatstheater', name: 'Mecklenburgisches Staatstheater', city: 'Schwerin', state: 'Mecklenburg-Vorpommern', capacity: 650, founded: 1836, description: 'Eines der schönsten Theaterbauten Norddeutschlands direkt am Schweriner See.', color: '#3d2d2d' },
    { id: 'theater-rostock', name: 'Volkstheater Rostock', city: 'Rostock', state: 'Mecklenburg-Vorpommern', capacity: 730, founded: 1895, description: 'Großes Theater an der Ostsee mit breitem musikalischem Angebot.', color: '#1f2d3d' },
    { id: 'theater-vorpommern', name: 'Theater Vorpommern', city: 'Stralsund / Greifswald', state: 'Mecklenburg-Vorpommern', capacity: 550, founded: 1994, description: 'Fusionstheater mit Spielstätten in Stralsund, Greifswald und Putbus.', color: '#2d3525' },

    // ── Niedersachsen ─────────────────────────────────────
    { id: 'niedersaechsische-staatsoper', name: 'Staatsoper Hannover', city: 'Hannover', state: 'Niedersachsen', capacity: 1100, founded: 1852, description: 'Das Opernhaus am Opernplatz in Hannover, Heimat exzellenter Ensembleleistungen.', color: '#1f2d3d' },
    { id: 'oldenburgisches-staatstheater', name: 'Oldenburgisches Staatstheater', city: 'Oldenburg', state: 'Niedersachsen', capacity: 855, founded: 1893, description: 'Vielseitiges Staatstheater im Nordwesten mit ambitioniertem Opernprogramm.', color: '#1f1f3d' },
    { id: 'theater-osnabrueck', name: 'Theater Osnabrück', city: 'Osnabrück', state: 'Niedersachsen', capacity: 654, founded: 1909, description: 'Mehrspartenhaus in der Friedensstadt mit innovativem Musiktheater.', color: '#2d3d3d' },
    { id: 'staatstheater-braunschweig', name: 'Staatstheater Braunschweig', city: 'Braunschweig', state: 'Niedersachsen', capacity: 900, founded: 1690, description: 'Eines der ältesten Staatstheater Deutschlands mit bedeutender Musiktheatergeschichte.', color: '#3d2520' },

    // ── Nordrhein-Westfalen ───────────────────────────────
    { id: 'oper-koeln', name: 'Oper Köln', city: 'Köln', state: 'Nordrhein-Westfalen', capacity: 1346, founded: 1957, description: 'Die Kölner Oper am Offenbachplatz, ein wichtiges Zentrum des Musiktheaters im Rheinland.', color: '#2c1a0e' },
    { id: 'deutsche-oper-am-rhein', name: 'Deutsche Oper am Rhein', city: 'Düsseldorf / Duisburg', state: 'Nordrhein-Westfalen', capacity: 1292, founded: 1956, description: 'Theatergemeinschaft der Städte Düsseldorf und Duisburg mit Spielstätten in beiden Städten.', color: '#2d1f3d' },
    { id: 'oper-dortmund', name: 'Oper Dortmund', city: 'Dortmund', state: 'Nordrhein-Westfalen', capacity: 1170, founded: 1966, description: 'Modernes Opernhaus im Ruhrgebiet mit vielseitigem Spielplan.', color: '#2d3d1f' },
    { id: 'theater-bonn', name: 'Theater Bonn', city: 'Bonn', state: 'Nordrhein-Westfalen', capacity: 890, founded: 1965, description: 'Oper der ehemaligen Bundeshauptstadt mit Schwerpunkt auf zeitgenössischem Musiktheater.', color: '#3d1f2d' },
    { id: 'theater-essen', name: 'Aalto-Theater', city: 'Essen', state: 'Nordrhein-Westfalen', capacity: 1125, founded: 1988, description: 'Entworfen vom finnischen Architekten Alvar Aalto, eines der schönsten Opernhäuser Deutschlands.', color: '#2d1f1f' },
    { id: 'theater-hagen', name: 'Theater Hagen', city: 'Hagen', state: 'Nordrhein-Westfalen', capacity: 804, founded: 1911, description: 'Das südlichste Theater im Ruhrgebiet mit traditionsreichem Opernensemble.', color: '#1f3d1f' },
    { id: 'theater-wuppertal', name: 'Oper Wuppertal', city: 'Wuppertal', state: 'Nordrhein-Westfalen', capacity: 830, founded: 1956, description: 'Heimat der berühmten Tanztheater-Tradition von Pina Bausch.', color: '#1f3d2d' },
    { id: 'musiktheater-im-revier', name: 'Musiktheater im Revier', city: 'Gelsenkirchen', state: 'Nordrhein-Westfalen', capacity: 1015, founded: 1959, description: 'Architektonisches Juwel des Ruhrgebiets – eines der schönsten Theaterbauten der Nachkriegszeit.', color: '#25203d' },
    { id: 'theater-aachen', name: 'Theater Aachen', city: 'Aachen', state: 'Nordrhein-Westfalen', capacity: 764, founded: 1825, description: 'Traditionsreiches Haus in der Kaiserstadt nahe der belgisch-niederländischen Grenze.', color: '#3d3020' },
    { id: 'theater-krefeld-mg', name: 'Theater Krefeld und Mönchengladbach', city: 'Krefeld / Mönchengladbach', state: 'Nordrhein-Westfalen', capacity: 810, founded: 1950, description: 'Vereinigte Städtische Bühnen am Niederrhein mit Spielstätten in beiden Städten.', color: '#20353d' },
    { id: 'landestheater-detmold', name: 'Landestheater Detmold', city: 'Detmold', state: 'Nordrhein-Westfalen', capacity: 680, founded: 1825, description: 'Traditionsreiches Landestheater im Teutoburger Wald mit breitem Repertoire.', color: '#353d20' },

    // ── Rheinland-Pfalz ───────────────────────────────────
    { id: 'pfalztheater', name: 'Pfalztheater Kaiserslautern', city: 'Kaiserslautern', state: 'Rheinland-Pfalz', capacity: 594, founded: 1862, description: 'Bezirksverbandstheater mit engagiertem Opernensemble in der Pfalz.', color: '#2d1f2d' },
    { id: 'staatstheater-mainz', name: 'Staatstheater Mainz', city: 'Mainz', state: 'Rheinland-Pfalz', capacity: 960, founded: 1833, description: 'Lebendiges Mehrspartenhaus in der rheinland-pfälzischen Landeshauptstadt.', color: '#3d201f' },
    { id: 'theater-trier', name: 'Theater Trier', city: 'Trier', state: 'Rheinland-Pfalz', capacity: 616, founded: 1802, description: 'Theater in Deutschlands ältester Stadt mit europäischer Ausstrahlung.', color: '#1f3035' },

    // ── Saarland ──────────────────────────────────────────
    { id: 'saarlaendisches-staatstheater', name: 'Saarländisches Staatstheater', city: 'Saarbrücken', state: 'Saarland', capacity: 840, founded: 1938, description: 'Grenznahes Theater mit deutsch-französischer Theatertradition.', color: '#3d2d1f' },

    // ── Sachsen ───────────────────────────────────────────
    { id: 'semperoper', name: 'Semperoper', city: 'Dresden', state: 'Sachsen', capacity: 1300, founded: 1841, description: 'Die Sächsische Staatsoper in Dresden, ein Meisterwerk der Architektur von Gottfried Semper.', color: '#3c2415' },
    { id: 'oper-leipzig', name: 'Oper Leipzig', city: 'Leipzig', state: 'Sachsen', capacity: 1267, founded: 1693, description: 'Die drittälteste bürgerliche Musiktheaterbühne Europas.', color: '#1c3a1c' },
    { id: 'oper-chemnitz', name: 'Oper Chemnitz', city: 'Chemnitz', state: 'Sachsen', capacity: 720, founded: 1909, description: 'Das Opernhaus der Kulturhauptstadt Europas 2025 mit engagiertem Ensemble.', color: '#1f1f3d' },
    { id: 'landesbuehnen-sachsen', name: 'Landesbühnen Sachsen', city: 'Radebeul', state: 'Sachsen', capacity: 547, founded: 1945, description: 'Reisendes Theater mit Stammhaus in Radebeul und Aufführungen in ganz Sachsen.', color: '#35301f' },

    // ── Sachsen-Anhalt ────────────────────────────────────
    { id: 'theater-magdeburg', name: 'Theater Magdeburg', city: 'Magdeburg', state: 'Sachsen-Anhalt', capacity: 700, founded: 1876, description: 'Lebendige Opernszene in der Landeshauptstadt Sachsen-Anhalts.', color: '#2d3d2d' },
    { id: 'anhaltisches-theater', name: 'Anhaltisches Theater', city: 'Dessau', state: 'Sachsen-Anhalt', capacity: 1100, founded: 1798, description: 'Historisches Theater mit starker Wagner- und Bauhausbindung.', color: '#2d2d3d' },
    { id: 'oper-halle', name: 'Oper Halle', city: 'Halle (Saale)', state: 'Sachsen-Anhalt', capacity: 690, founded: 1886, description: 'Opernhaus in der Geburtsstadt Georg Friedrich Händels mit jährlichen Händel-Festspielen.', color: '#3d201f' },
    { id: 'nordharzer-staedtebundtheater', name: 'Nordharzer Städtebundtheater', city: 'Halberstadt / Quedlinburg', state: 'Sachsen-Anhalt', capacity: 450, founded: 1945, description: 'Kleines aber feines Mehrspartenhaus im nördlichen Harzvorland.', color: '#2d3520' },

    // ── Schleswig-Holstein ────────────────────────────────
    { id: 'theater-kiel', name: 'Theater Kiel', city: 'Kiel', state: 'Schleswig-Holstein', capacity: 840, founded: 1907, description: 'Das nördlichste Opernhaus Deutschlands an der Kieler Förde.', color: '#1f2d2d' },
    { id: 'theater-luebeck', name: 'Theater Lübeck', city: 'Lübeck', state: 'Schleswig-Holstein', capacity: 780, founded: 1908, description: 'Traditionsreiches Theater in der Hansestadt, geprägt von nordischer Theaterkultur.', color: '#2d2d1f' },
    { id: 'theater-flensburg', name: 'Schleswig-Holsteinisches Landestheater', city: 'Flensburg / Rendsburg', state: 'Schleswig-Holstein', capacity: 520, founded: 1974, description: 'Norddeutsches Reisetheater mit Spielstätten in mehreren Städten.', color: '#1f3535' },

    // ── Thüringen ─────────────────────────────────────────
    { id: 'theater-erfurt', name: 'Theater Erfurt', city: 'Erfurt', state: 'Thüringen', capacity: 800, founded: 2003, description: 'Modernes Opernhaus auf dem Theaterplatz der thüringischen Landeshauptstadt.', color: '#1f2d1f' },
    { id: 'dnt-weimar', name: 'Deutsches Nationaltheater Weimar', city: 'Weimar', state: 'Thüringen', capacity: 857, founded: 1791, description: 'Goethes Theaterhaus – geschichtsträchtigste Bühne Deutschlands mit Staatskapelle.', color: '#3d2d15' },
    { id: 'theater-gera-altenburg', name: 'Theater Altenburg Gera', city: 'Gera / Altenburg', state: 'Thüringen', capacity: 530, founded: 1995, description: 'Fusionstheater in Ostthüringen mit Spielstätten in Gera und Altenburg.', color: '#25303d' },
    { id: 'theater-nordhausen', name: 'Theater Nordhausen / Loh-Orchester Sondershausen', city: 'Nordhausen', state: 'Thüringen', capacity: 450, founded: 1917, description: 'Mehrspartenhaus am Südharz, verbunden mit dem traditionsreichen Loh-Orchester.', color: '#353520' },

    // ── Schweiz ───────────────────────────────────────────
    { id: 'opernhaus-zuerich', name: 'Opernhaus Zürich', city: 'Zürich', state: 'Schweiz', capacity: 1100, founded: 1891, description: 'Das renommierte Opernhaus am Sechseläutenplatz – eines der führenden Musiktheater Europas, mehrfach als bestes Opernhaus des Jahres ausgezeichnet.', color: '#1a4a3a' },
];
