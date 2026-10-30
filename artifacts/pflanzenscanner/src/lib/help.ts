import type { ModuleId } from "@workspace/api-client-react";

/**
 * Hilfe & FAQ (docs/hilfe.md): ONE source for the explanation at the top of
 * every module page (components/module-intro.tsx) and for the help area
 * (/hilfe). Every module in lib/modules.ts has an entry here – help.test.ts
 * checks it. A new module or a new field that changes how a module is used:
 * update its entry (intro, steps, FAQ) in the same change.
 */

export interface HelpEntry {
  title: string;
  /** Where the module lives. */
  href: string;
  /** Two or three sentences: what it is for. */
  intro: string;
  /** "So funktioniert's" – the steps, in the order one uses them. */
  steps: string[];
  faq: { q: string; a: string }[];
}

export const MODULE_HELP: Record<ModuleId, HelpEntry> = {
  // ── Pflanzen ──────────────────────────────────────────────────────────────
  plants: {
    title: "Pflanzen erkennen",
    href: "/pflanzen",
    intro: "Mit der Kamera bestimmt die App Pflanzen, Pilze und Insekten. Sie sagt dir, ob etwas giftig ist – für Menschen und für deine Tiere – und wie du es pflegst.",
    steps: [
      "Unten in der Mitte auf den Scan-Knopf tippen und die Pflanze möglichst formatfüllend fotografieren.",
      "Pilze immer mit drei Fotos scannen (von oben, von der Seite und die Lamellen von unten) – nur dann gibt es eine Aussage zur Essbarkeit.",
      "Das Ergebnis landet in „Meine Pflanzen“; von dort geht es zu Pflegeplan, Pflanzendoc und Lexikon.",
      "Ohne Netz werden Fotos zwischengespeichert und gescannt, sobald du wieder online bist.",
    ],
    faq: [
      { q: "Wie sicher ist die Bestimmung?", a: "Die KI liegt meist richtig, aber nicht immer. Bei Giftpflanzen und Pilzen gilt: im Zweifel nicht essen und nicht verfüttern – frag eine Fachperson." },
      { q: "Was passiert, wenn die Erkennung nicht klappt?", a: "Dein Foto geht nicht verloren: Es bleibt in der Warteschlange (Mehr → Warteschlange) und wird automatisch noch einmal versucht – ohne Netz, sobald du wieder online bist. Fehlgeschlagene Versuche zählen nicht gegen dein Tageslimit." },
      { q: "Wie viele Scans habe ich?", a: "Es gibt ein tägliches Kontingent je Konto; um Mitternacht beginnt es neu. Pflanzendoc und Pflege-Guides zählen wie ein Pflanzen-Scan. Die App zeigt, wenn es erreicht ist; schlägt die KI fehl, zählt die Anfrage nicht." },
    ],
  },
  "my-plants": {
    title: "Meine Pflanzen",
    href: "/meine-pflanzen",
    intro: "Deine Sammlung: alle gescannten Pflanzen mit Foto, Standort und Pflegehinweisen – von der Zimmerpflanze bis zum Beet.",
    steps: [
      "Nach einem Scan „Speichern“ wählen – die Pflanze erscheint hier.",
      "Einen Ort zuordnen (Zimmer, Balkon, Beet), damit du sie wiederfindest.",
      "Von der Pflanze aus einen Pflegeplan anlegen oder den Pflanzendoc fragen.",
    ],
    faq: [
      { q: "Kann ich eine Pflanze wieder entfernen?", a: "Ja, in der Pflanze unten über „Löschen“. Der Pflegeplan dazu geht mit." },
      { q: "Wie finde ich nur meine Pilze?", a: "Über der Liste der Scans stehen die Arten, die du gescannt hast – etwa „Pilze (4)“ oder „Heilkräuter (2)“. Ein Tipp zeigt nur diese, „Alle“ wieder alles." },
    ],
  },
  "care-plan": {
    title: "Pflegeplan",
    href: "/aufgaben",
    intro: "Erinnerungen fürs Gießen, Düngen und Umtopfen – mit Rücksicht aufs Wetter: Draußen wird bei Regen nicht gegossen, bei Frost gibt es einen Hinweis.",
    steps: [
      "Eine Aufgabe anlegen: Pflanze, was zu tun ist und wie oft.",
      "„Draußen“ ankreuzen, wenn die Pflanze im Freien steht – dann zählt der Regen mit.",
      "Fällige Aufgaben abhaken; die nächste rückt automatisch nach.",
      "Push-Erinnerungen in „Mehr → Benachrichtigungen“ einschalten.",
    ],
    faq: [{ q: "Warum ist eine Gieß-Aufgabe verschoben?", a: "Bei genug Regen schiebt die App Gieß-Aufgaben für Pflanzen draußen auf. Du siehst es an der Aufgabe." }],
  },
  "plant-doc": {
    title: "Pflanzendoc",
    href: "/pflanzendoc",
    intro: "Kranke Pflanze? Ein Foto der Blätter genügt: Der Pflanzendoc nennt mögliche Ursachen – Schädlinge, Pilz, Nährstoffmangel, Gießfehler – und was hilft.",
    steps: [
      "Die betroffene Stelle nah und scharf fotografieren, am besten bei Tageslicht.",
      "Die Diagnose lesen: Ursache, Sicherheit der Einschätzung und Behandlung.",
      "Daraus einen Pflege-Guide mit Erinnerungen machen.",
    ],
    faq: [
      { q: "Ersetzt das einen Fachbetrieb?", a: "Nein. Bei wertvollen Pflanzen oder Unsicherheit lieber eine Gärtnerei fragen." },
      {
        q: "Bekomme ich nur Bio-Tipps?",
        a: "Nur wenn du willst. Standard sind biologische und mineralische Dünger-Tipps. Mit „Nur biologische Empfehlungen“ nennt der Pflanzendoc – und der Pflege-Guide daraus – nur Mittel aus dem Ökolandbau. Wirtschaftet euer Hof naturnah oder bio (Farm & Team → Bewirtschaftung), ist das automatisch an.",
      },
    ],
  },
  pests: {
    title: "Schädlinge & Nützlinge",
    href: "/schaedlinge",
    intro: "Erkennen, wer da krabbelt: Schädlinge mit biologischen und chemischen Mitteln dagegen, Nützlinge, die du fördern solltest. Der Ratgeber „Nützlinge fördern“ zeigt, wer gegen welches Problem hilft und wie du ihn in deinen Garten holst.",
    steps: [
      "Ein Insekt scannen – es landet unter „Meine Insekten“. Mit dem Filter siehst du nur Schädlinge, nur Nützlinge oder die neutralen.",
      "Bei Schädlingen zuerst die biologischen Wege lesen und auf „Wer hilft dagegen?“ tippen.",
      "Unter „Nützlinge fördern“ auf eine Kachel tippen, z. B. Blattläuse, Schnecken oder Boden verbessern – oder direkt einen Nützling wie den Igel.",
      "Die Maßnahmen umsetzen: Blühpflanzen, Insektenhotel, Ohrwurm-Topf, Tränke, wilde Ecke – jede mit Schritt-für-Schritt-Anleitung.",
    ],
    faq: [
      { q: "Warum steht bio vor chemisch?", a: "Weil es Nützlinge, Bienen und deine Tiere schont. Chemie nur, wenn nichts anderes hilft – und Wartezeiten beachten." },
      { q: "Ich habe Läuse und sehe keine Marienkäfer – was tun?", a: "Ein paar Tage abwarten und Läuse abspritzen. Nützlinge kommen erst, wenn sie Futter finden, meist mit ein bis zwei Wochen Verzögerung. Blühpflanzen und eine wilde Ecke sorgen dafür, dass sie nächstes Jahr schon da sind." },
      { q: "Soll ich Nützlinge kaufen?", a: "Im Gewächshaus, Wintergarten und an Zimmerpflanzen lohnt es sich – etwa Raubmilben gegen Spinnmilben oder Nematoden gegen Trauermücken. Im Freien wandern gekaufte Tiere oft ab; dort hilft es mehr, ihnen dauerhaft Futter und Verstecke zu bieten." },
      { q: "Bringt ein Insektenhotel aus dem Baumarkt etwas?", a: "Oft wenig: Zapfen, Stroh und ins Stirnholz gebohrte Löcher nutzt kaum eine Biene. Der Ratgeber zeigt, worauf es ankommt – und dass die meisten Wildbienen im Boden nisten." },
    ],
  },
  lexicon: {
    title: "Lexikon",
    href: "/lexikon",
    intro: "Alle Arten, die die App kennt – Pflanzen, Pilze und Insekten – mit Giftigkeit für Menschen und Tiere, Inhaltsstoffen und Nutzen.",
    steps: ["Nach Namen oder Merkmalen suchen.", "Bei Pflanzen auf die Giftigkeit für deine Tierarten achten.", "Aus einem Eintrag direkt zum Pflegeplan."],
    faq: [{ q: "Warum fehlt eine Art?", a: "Neue Arten kommen über Scans dazu. Scanne sie einfach – dann steht sie danach auch im Lexikon." }],
  },
  "herb-witch": {
    title: "Kräuter-Hexe",
    href: "/kraeuter-hexe",
    intro: "Der Heilkräuter-Ratgeber: Welche Kräuter bei welchen Beschwerden traditionell verwendet werden – mit Zubereitung und Vorsicht-Hinweisen.",
    steps: [
      "Wählen, für wen: Mensch oder Tier.",
      "Unter „Nach Beschwerden filtern“ eine Gruppe aufklappen, z. B. „Entzündungen“, und die passende Beschwerde wählen – etwa Haut, Mund und Rachen oder Magen-Darm. Mit „Übernehmen“ unten im Menü schließen. Oder oben eintippen.",
      "Anwendung und Gegenanzeigen lesen.",
      "Kräuter aus dem eigenen Garten im Beet-Architekt einplanen.",
    ],
    faq: [
      { q: "Ist das medizinischer Rat?", a: "Nein. Es ist überliefertes Wissen; bei Beschwerden ärztlichen Rat einholen, besonders in Schwangerschaft und bei Kindern." },
      { q: "Warum heißt meine Beschwerde anders als früher?", a: "Jede Beschwerde gibt es nur noch einmal und immer gleich geschrieben. „Magenkrämpfe“ und „Verdauungsbeschwerden“ heißen jetzt zum Beispiel „Magen-Darm-Beschwerden“, „Rachenentzündung“ heißt „Mund- und Rachenentzündungen“. Wer das alte Wort eintippt, findet trotzdem die passenden Pflanzen." },
    ],
  },
  garden: {
    title: "Beet-Architekt",
    href: "/beete",
    intro: "Beete planen wie auf Karopapier: Mischkultur, Fruchtfolge, Licht und Abstände prüft die App. Dazu Gartenkalender, Frostwarnung, Saatgut-Vorrat, Ernte-Auswertung und die Wirtschaftlichkeit des Gartens.",
    steps: [
      "Ein Beet anlegen (Größe, Standort mit Postleitzahl für Frosttermine).",
      "Kulturen ins Raster setzen – die App warnt bei schlechten Nachbarn und zu wenig Platz.",
      "Umstellen: eine Pflanze mit dem Finger auf ein freies Feld ziehen – oder antippen, „Verschieben“ und das neue Feld tippen. Ernten und Häkchen bleiben dabei erhalten.",
      "Optional ein Foto des Beets: Die KI schätzt Schatten, Boden und Unkraut ein.",
      "Im Gartenkalender sehen, wann gesät, gepflanzt und geerntet wird.",
      "Ernten eintragen – die Ernte-Auswertung zeigt, was sich gelohnt hat.",
      "Gartenausgaben und Stunden eintragen – unter „Wirtschaftlichkeit“ steht, was nach Abzug der Kosten übrig bleibt und was eine Stunde gebracht hat.",
    ],
    faq: [
      {
        q: "Der KI-Vorschlag kommt nicht – was tun?",
        a: "Die KI hat höchstens 45 Sekunden. Braucht sie länger, kommt „Die KI hat zu lange gebraucht“ und die Anfrage zählt nicht gegen dein Tageslimit. Einfach noch einmal tippen; kürzere Wünsche helfen.",
      },
      { q: "Woher kennt die App meine Frosttermine?", a: "Aus Wetterdaten des Deutschen Wetterdienstes für deine Postleitzahl (auf etwa 10 km gerundet)." },
      {
        q: "Wo trage ich Dünger ein?",
        a: "Im Beet unter „Düngung“: Datum, was (Kompost, Mist, Gründüngung, Hornspäne …) und auf Wunsch die Menge. Darunter rechnet die App, wie viel Mist deine Tiere im Jahr geben und für wie viel Beet er reicht (Richtwerte). Auf Bio-Höfen zeigt der Bio-Check Mineraldünger rot.",
      },
      { q: "Was ist mit dem Saatgut?", a: "Unter „Saatgut“ führst du deine Tüten. Die App sagt, wie lange sie keimen, und bucht beim Säen ab." },
      {
        q: "Wo trage ich Bio-Saatgut ein?",
        a: "Auf naturnahen und Bio-Höfen hat jedes Saatgut das Feld „Bio-Saatgut?“. Auf Bio-Höfen warnt die Saatgut-Seite bei konventionellem Saatgut – erlaubt nur, wenn es die Sorte nicht in Bio gibt, mit Ausnahmegenehmigung der Kontrollstelle (Richtwert). Selbst gewonnenes Saatgut vom eigenen Hof zählt als Bio. Es erscheint auch im Bio-Check und in der Bio-Dokumentation.",
      },
      {
        q: "Lohnt sich mein Garten?",
        a: "Die Ernte-Auswertung rechnet die Ernte zum Ladenwert, zieht die Gartenausgaben ab (Saatgut, Pflanzen, Erde, Dünger, Wasser, Material) und teilt durch deine Stunden. Ohne eingetragene Stunden schätzt sie etwa 1 Stunde je Woche für 10 m² Beet. Frische und Freude zählen nicht mit.",
      },
      {
        q: "Kann die KI einen Teil des Beetes als Tierfutter planen?",
        a: "Ja. Im „KI-Vorschlag“ stellst du mit dem Schieberegler ein, wie viel für die Tiere und wie viel für die Küche sein soll, z. B. 30 % Futter für die Hühner. Die KI nimmt dafür nur Pflanzen, die für deine Tiere geeignet und nicht giftig sind, und zeigt danach, wie viel Fläche es wirklich geworden ist. Vorgabe ist der Anteil aus dem Garten-Assistenten.",
      },
      { q: "Wie kommt der Garten-Assistent auf seine Zahlen?", a: "Unter der Aufteilung „So rechnet der Assistent“ aufklappen: Dort steht die Rechnung mit deinen Zahlen – Personen mal Fläche je Richtung, Grünfutter je Tier und Tag, Saison und Winter in m² und welche Beete den Futteranteil ergeben. Hast du schon Ernten eingetragen, rechnet er mit deinen eigenen Erträgen." },
      { q: "Zählen Gartenausgaben unter Ertrag & Bilanz doppelt?", a: "Nein. Sie sind ganz normale Ausgaben des Hofs mit dem Zeichen „Garten“ und zählen dort einmal." },
    ],
  },
  pantry: {
    title: "Vorratskammer",
    href: "/vorrat",
    intro: "Was eingekocht, eingefroren, getrocknet oder als Honig im Regal steht – mit Mindesthaltbarkeit, damit nichts verdirbt.",
    steps: [
      "„Einlagern“: was, wie viel, wo und bis wann – oder direkt aus einer Ernte übernehmen.",
      "Beim Entnehmen „1 Glas genommen“ tippen; „rückgängig“ korrigiert Vertipper.",
      "Montags kommt ein Push für alles, was bald aufgebraucht werden sollte.",
    ],
    faq: [{ q: "Wie kommt die Haltbarkeit zustande?", a: "Die App schlägt je Art eine übliche Dauer vor (z. B. Eingekochtes ein Jahr). Du kannst sie ändern." }],
  },
  grow: {
    title: "Grow",
    href: "/grow",
    intro: "Für Erwachsene ab 18: der private Eigenanbau nach dem Konsumcannabisgesetz – Plan, Tagebuch, Wetter, Strom und Kosten. Der KI-Check gehört zu Premium.",
    steps: ["Das Alter einmal bestätigen.", "Ein Grow anlegen (drinnen, draußen, Gewächshaus) und Pflanzen eintragen.", "Dem Plan folgen und das Tagebuch führen; die App erinnert an die Schritte."],
    faq: [{ q: "Ist das Rechtsberatung?", a: "Nein. Die App zeigt die Grenzen des Gesetzes (Anzahl, Besitz), entscheidet aber nichts für dich." }],
  },

  // ── Tiere ─────────────────────────────────────────────────────────────────
  animals: {
    title: "Tierbestand",
    href: "/farm/tiere",
    intro: "Alle Tiere des Hofs, einzeln oder in Gruppen – auf der Seite „Meine Tiere“ (oben auf „Tiere“): mit Gesundheitsakte, Gewicht, Abstammung und Wartezeiten. Für den Anfang genügen Tierart, Geschlecht und Geburtsdatum.",
    steps: [
      "„Schnellstart“: eine Gruppe mit nummerierten Tieren, Startration und Erinnerungen in einem Rutsch.",
      "Oder ein Tier einzeln anlegen – Foto, Name und Ring-/Ohrmarke sind optional (ohne Namen heißt es z. B. „Ziege 1“).",
      "In der Gesundheitsakte Behandlungen mit Wartezeit eintragen – bei mehreren Tagen mit „Behandlung bis“; Entwurmen und Impfen erinnern auf Wunsch an die Wiederholung.",
      "Gewicht eintragen – die App warnt bei mehr als 5 % Abnahme in 14 Tagen.",
    ],
    faq: [
      { q: "Muss ich die Ohrmarkennummer eintragen?", a: "Nein, sie lässt sich jederzeit nachtragen. Rinder, Schafe, Ziegen und Schweine müssen aber gekennzeichnet sein – das Formular erinnert daran." },
      {
        q: "Ab wann zählt die Wartezeit?",
        a: "Ab dem letzten Behandlungstag. Bei einer Behandlung über mehrere Tage trägst du „Behandlung bis“ ein; das Formular zeigt sofort, bis wann Milch, Eier und Fleisch nicht verwendet werden dürfen. Maßgeblich bleibt die Angabe auf dem Beipackzettel oder vom Tierarzt.",
      },
      {
        q: "Was zeigt der Bio-Check?",
        a: "Auf Bio-Höfen steht auf der Tiere-Seite eine Ampel je Bereich: Futter (Bio-Anteile der Rationen), Platz (Stall und Auslauf) und Behandlungen (chemisch-synthetische je Tier in 12 Monaten) Saatgut (Bio oder vom eigenen Hof) und Dünger (kein Mineraldünger in 12 Monaten). Grün passt, gelb fehlt etwas, rot braucht Handlung. Ein Tipp öffnet, wo du es ändern kannst.",
      },
      {
        q: "Was ist der Platz-Check?",
        a: "Nur auf Bio-Höfen (Farm & Team → Bewirtschaftung): Oben unter „Meine Tiere“ trägst du je Gruppe Stallfläche und Auslauf in m² ein. Die App rechnet aus, wie viel die Tiere nach EU-Öko-Verordnung mindestens brauchen (z. B. Legehennen höchstens 6 je m² Stall und 4 m² Auslauf je Huhn), und zeigt grün oder rot. Richtwerte für ausgewachsene Tiere; Verbände verlangen oft mehr.",
      },
      {
        q: "Wozu die „Art der Behandlung“?",
        a: "Freiwillig: chemisch-synthetisches Arzneimittel, Naturheilverfahren (Pflanzen, Homöopathie), Impfung oder Parasitenbehandlung. Auf einem Bio-Hof zählt die App damit die chemisch-synthetischen Behandlungen je Tier in 12 Monaten und rechnet die doppelte Wartezeit. Auf allen anderen Höfen ist es nur eine Notiz.",
      },
      { q: "Was passiert beim Archivieren?", a: "Das Tier verschwindet aus den Listen, bleibt aber mit seiner Akte für den Veterinäramt-Export erhalten." },
      {
        q: "Wo sind Gänse, Enten, Puten und Wachteln?",
        a: "Sie sind eigene Tierarten mit eigenem Futterbedarf, eigener Brutdauer (Gans 30, Ente 28, Pute 28, Wachtel 17 Tage) und eigenen Hinweisen bei Frost. Was du bisher als „Geflügel“ eingetragen hast, heißt jetzt „Huhn“ – führst du darunter Enten oder Gänse, stell die Tierart an der Gruppe oder am Tier um. Eine Tierart fehlt? Unter der Tierart-Auswahl auf „Anfragen“ tippen.",
      },
      {
        q: "Was gilt für Nandus und Esel?",
        a: "Nandus zählen als Laufvögel zum Geflügel: beim Veterinäramt anmelden, Geflügelpest-Regeln beachten, vor dem Kauf Gehege und Genehmigung klären. Brut etwa 36 Tage – die Eier wiegen statt schieren. Esel brauchen einen Artgenossen, einen Equidenpass und einen trockenen Unterstand (ihr Fell ist nicht wasserdicht); sie fressen wenig Eiweiß, deshalb startet die Ration mit viel Stroh. Alle Zahlen sind Richtwerte.",
      },
      {
        q: "Was gilt für Alpakas?",
        a: "Alpakas sind Herdentiere – mindestens zwei, besser drei. Der Schnellstart legt Heu und Alpaka-Mineralfutter als Ration an und erinnert an Zehennägel (alle 3 Monate), Kotprobe (alle 4 Monate) und die Schur im Frühsommer. Beim Veterinäramt anmelden; ob die Tierseuchenkasse sie will, regelt das Bundesland. Alle Zahlen sind Richtwerte.",
      },
    ],
  },
  "farm-tasks": {
    title: "Hof- & Stall-Aufgaben",
    href: "/hof-aufgaben",
    intro: "Eine gemeinsame Liste für alles, was auf dem Hof ansteht: Eier einsammeln, Gänse füttern, Teichpumpe kontrollieren. Einfach reinsprechen, was zu tun ist – die KI macht daraus die Liste. Alle im Team sehen sie, haken ab und schreiben dazu, wenn etwas fehlt. Auf dem Hof steht sie unter Pflanzenretter als orange Kachel, neben den Alltagsnotizen für Einkauf und Merkzettel.",
    steps: [
      "Einfach reinsprechen: „Halten & sprechen“ gedrückt halten, frei sagen, was zu tun ist, und loslassen – z. B. „Heute müssen die Eier eingesammelt werden, die Gänse jeden Tag gefüttert und morgen für Maria die Blumen gegossen.“ Dann „Liste erstellen“.",
      "Die KI macht daraus einzelne Aufgaben und erkennt Tag (heute, morgen, Freitag …), Wiederholung (jeden Tag, jede Woche, alle 2 Tage …), Uhrzeit und für wen. In der Vorschau lässt sich alles ändern oder entfernen, dann „Alle anlegen“.",
      "Eine einzelne Aufgabe wie „Eier einsammeln“ kommt ohne KI direkt auf die Liste. „Für“ und „Täglich“ gelten, wo im Gesagten nichts steht. Mehr (Tier, beliebiger Tag) unter „Mit Tag, Wiederholung, Uhrzeit oder Tier anlegen“.",
      "Den Bereich erkennt die App am Text: Tiere-Aufgaben stehen auch bei den Stall-Aufgaben und „Am Stall“, Garten-Aufgaben im Pflegeplan, alles andere unter „Hof & Haus“.",
      "Wer etwas erledigt, tippt auf den Kreis – alle sehen, wer es wann gemacht hat. Ein zweiter Tipp nimmt den Haken zurück.",
      "Über die Sprechblase einen Kommentar schreiben, z. B. „Wir brauchen neue Eierkartons“. Die anderen bekommen eine Push-Nachricht.",
    ],
    faq: [
      { q: "Muss ich die Aufgaben einzeln eintippen?", a: "Nein. Sprich einfach frei rein, so wie du es jemandem sagen würdest – die KI macht daraus die Liste mit Tagen, Wiederholungen und Personen. Du prüfst sie nur noch und tippst auf „Alle anlegen“." },
      { q: "Was, wenn die KI nicht erreichbar ist?", a: "Ohne Netz oder wenn das tägliche KI-Limit erreicht ist, erkennt die App einfache Wörter selbst (heute, morgen, jeden Tag, um 7 Uhr, für Maria). Die Liste ist dann als „ohne KI erkannt“ markiert – bitte genauer prüfen." },
      { q: "Wo sehe ich einen Hof, der mit mir geteilt wurde?", a: "Ganz oben auf der Hofseite unter „Wähle deine Farm“: Ein Tipp klappt die Liste auf – oben deine eigenen Farmen, darunter die verknüpften Höfe, die dir freigegeben wurden („Geteilt von …“), und der Demo-Hof. Ein Tipp auf einen Hof wechselt – Wetter, Hof-Aufgaben und Widgets zeigen dann diesen Hof. Die Auswahl erscheint, sobald du zu mehr als einem Hof gehörst, auch auf der Seite Hof-Aufgaben." },
      { q: "Ich sehe eine Farm zu viel – wie werde ich sie los?", a: "„Meine Farm“ legt die App automatisch an, wenn du zum ersten Mal auf den Hof kommst. Hast du danach eine weitere Farm angelegt, z. B. mit eigenem Namen, und brauchst die erste nicht: Wähle sie oben aus, tippe auf „Farmen verwalten“ und unten auf „Farm löschen“. Achtung: Alles auf dieser Farm wird mit gelöscht – schau vorher nach, ob dort Tiere oder Aufgaben stehen. Oder benenne sie einfach um und nutze sie weiter." },
      { q: "Geht „montags und donnerstags“?", a: "Ja. Sag oder schreib es so („Müll rausbringen montags und donnerstags“, „werktags“, „am Wochenende“), oder wähl im Formular unter „Wann?“ die Wochentage. Die Aufgabe ist dann an jedem dieser Tage fällig; ein verpasster Tag bleibt stehen, bis er abgehakt ist." },
      { q: "Wie teile ich die Liste?", a: "Unten auf der Seite auf „Teilen“ tippen (nur Admins): jemanden aus dem Team wählen oder eine E-Mail-Adresse eingeben und „Hof-Aufgaben“, „Alltagsnotizen“ oder beides ankreuzen. Neue Personen kommen als Mitarbeiter ins Team und sehen nur die Hof-Aufgaben (und die Tiere); mehr gibst du unter „Farm & Team“ frei." },
      { q: "Wer darf Aufgaben löschen?", a: "Nur die Admins des Hofs – sie sind die Besitzer der Liste. Mitarbeiter haken ab, legen neue Aufgaben an, ändern und kommentieren, löschen aber nichts." },
      { q: "Wer bekommt die Erinnerung?", a: "Bei einer Aufgabe für eine Person nur diese, sonst alle Admins und Mitarbeiter des Hofs. Gäste nicht. Ruhezeiten stellst du unter „Mehr → Benachrichtigungen“ ein." },
      { q: "Was ist der Unterschied zu den Stall-Aufgaben?", a: "Es ist dieselbe Liste. Die Stall-Aufgaben unter Tiere zeigen nur den Bereich Tiere, die Hof-Aufgaben alles – dazu deine fälligen Pflanzen und den Garten." },
      { q: "Verschwindet eine einmalige Aufgabe?", a: "Ja, nach dem Abhaken bleibt sie bis zum Abend unter „Heute erledigt“ (zugeklappt – ein Tipp öffnet die Liste) und fällt dann aus der Liste." },
    ],
  },
  feed: {
    title: "Futterplaner",
    href: "/farm/futter",
    intro: "Rationen je Tier oder Gruppe, gerechnet auf den Bedarf der Art: Protein, Rohfaser, Mineralien und Wasser mit Ampel. Dazu Sommer- und Winterration, Futtervorrat und Mehrbedarf bei Kälte.",
    steps: [
      "Eine Ration anlegen: Futtermittel aus der Liste oder vom Etikett, Menge je Tier und Lebensphase.",
      "Die Ampel zeigt, was fehlt oder zu viel ist – mit Tipp zum Ausgleich.",
      "Sommer- und Winterration anlegen; die App stellt schrittweise um.",
      "Unter „Vorrat & Kosten“ den Bestand führen – die App sagt, wann nachkaufen.",
      "Mit Hofstandort zeigt sie bei Kälte, wie viel mehr Heu oder Körner es braucht.",
    ],
    faq: [
      {
        q: "Wie rechnet der Futterplaner auf einem Bio-Hof?",
        a: "Nur wenn der Hof unter Farm & Team auf „Bio“ oder „Bio-Verband“ steht: Unter „Herkunft der Futtermittel“ gibst du je Futter an, ob es bio, aus der Umstellung oder konventionell ist und ob es vom Hof oder aus der Region kommt. Jede Ration zeigt dann die Anteile auf die Trockenmasse mit Ampel – Bio-Anteil 100 %, zugekauftes Umstellungsfutter höchstens 25 %, vom Hof oder aus der Region mindestens 70 % (Pflanzenfresser) bzw. 30 % (Schwein, Geflügel), Raufutter mindestens 60 % bei Pflanzenfressern. Alles Richtwerte nach EU-Öko-Verordnung. Andere Höfe sehen den Futterplaner wie bisher.",
      },
      { q: "Warum warnt die App bei Mineralfutter?", a: "Manches Mineralfutter ist für eine andere Art gemacht – zu viel Kupfer ist für Schafe giftig, Kokzidiostatika für Pferde. Diese Warnungen lassen sich nicht wegklicken." },
      { q: "Sind das genaue Werte?", a: "Es sind Richtwerte aus der Fachliteratur für ein typisches Tier. Im Zweifel mit Tierärztin oder Fütterungsberatung abstimmen." },
    ],
  },
  breeding: {
    title: "Zucht",
    href: "/farm/zucht",
    intro: "Von der Deckung bis zur Geburt, vom Einlegen bis zum Schlupf: Termine und Schritte dazwischen, Jungtiere mit Eltern, Brunstkalender und Absetzen.",
    steps: [
      "„Deckung oder Brut eintragen“ mit Datum – die App rechnet den Termin und die Schritte (Schieren, Nestbox, Trockenstellen …).",
      "Bei der Geburt die Jungtiere auf Wunsch gleich mit Mutter und Vater anlegen.",
      "Im Brunstkalender „Brunst gesehen“ tippen – die nächste Brunst wird berechnet, am Vortag kommt ein Push.",
      "Unter „Absetzen“ steht, wann die Jungtiere von der Mutter getrennt werden.",
    ],
    faq: [
      { q: "Warum eine Warnung bei Mutter und Vater?", a: "Wenn sie verwandt sind (Geschwister, Elterntier, Cousins). Inzucht erhöht das Risiko für Erbfehler – die App blockiert aber nicht." },
      { q: "Wie genau sind die Termine?", a: "Durchschnittswerte aus der Fachliteratur. Jedes Tier ist anders; der normale Bereich steht dabei." },
    ],
  },
  medicines: {
    title: "Arzneimittel",
    href: "/farm/arzneimittel",
    intro: "Der Vorrat an Tierarzneimitteln mit Charge, Haltbarkeit und Wartezeiten für Fleisch, Milch und Eier. Behandlungen buchen die Menge ab.",
    steps: [
      "Ein Mittel eintragen: Name, Menge, Charge, Ablaufdatum, Wartezeiten, woher.",
      "In der Gesundheitsakte oder bei den Bienen das Mittel wählen – Menge und Charge werden übernommen.",
      "Vor dem Ablauf kommt eine Erinnerung.",
    ],
    faq: [
      { q: "Wo sehe ich laufende Wartezeiten?", a: "Am Tier, in der Übergabe und im Futterplaner – solange Fleisch, Milch oder Eier nicht genutzt werden dürfen." },
      {
        q: "Was ändert sich auf einem Bio-Hof?",
        a: "Nur wenn der Hof unter Farm & Team auf „Bio“ oder „Bio-Verband“ steht: Neue Behandlungen bekommen die doppelte gesetzliche Wartezeit, mindestens 2 Tage – auch chemische Mittel ohne Wartezeit. Eingetragen wird weiter die gesetzliche Zahl. Am Tier zählt die App die chemisch-synthetischen Behandlungen der letzten 12 Monate (Richtwert: höchstens 3). Konventionelle und naturnahe Höfe sehen alles wie bisher.",
      },
    ],
  },
  duties: {
    title: "Pflichten & Tierseuchen",
    href: "/farm/pflichten",
    intro: "Was die Haltung auf dem Papier bedeutet: Anmeldung beim Veterinäramt, Tierseuchenkasse, Stichtagsmeldung, Stallpflicht – je nach Tierart, auch für Bienen.",
    steps: [
      "Die Liste zeigt nur die Pflichten deiner Tierarten.",
      "Bundesland unter „Betrieb“ wählen – dann nennt die App deine Tierseuchenkasse mit Link, ihren Stichtag und ihre Frist.",
      "Erledigtes abhaken; jährliche Meldungen kommen im nächsten Jahr wieder.",
      "Registriernummer des Betriebs eintragen – sie steht dann im Veterinäramt-Export.",
      "Eine amtliche Stallpflicht für Geflügel mit Enddatum eintragen – alle auf dem Hof sehen sie.",
    ],
    faq: [
      {
        q: "Gilt das in jedem Bundesland gleich?",
        a: "Die Grundlagen sind bundesweit. Stichtag und Frist der Bestandsmeldung legt jede Tierseuchenkasse selbst fest – z. B. Bayern bis 20. Januar, NRW bis 31. Januar, Rheinland-Pfalz bis 15. Februar, Brandenburg, Niedersachsen und Thüringen mit Stichtag 3. Januar. Mit eingetragenem Bundesland rechnet die App damit. Maßgeblich bleibt der Meldebogen der Kasse. Keine Rechtsberatung.",
      },
      { q: "Wann erinnert mich die App?", a: "Etwa zwei Wochen und drei Tage vor der Frist, je Meldung: an HI-Tier also am 2. und 12. Januar, an die Kasse je nach Bundesland." },
    ],
  },
  yields: {
    title: "Ertrag & Bilanz",
    href: "/farm/ertrag",
    intro: "Eier, Milch, Fleisch, Wolle, Honig und Ernte – und was das im Laden kosten würde, gegen Futter und andere Ausgaben gerechnet. Mit Legeleistung je Henne.",
    steps: [
      "Oben schnell eintragen: Produkt, Menge, Datum, optional Gruppe oder Henne.",
      "Ausgaben eintragen (Futter, Tierarzt, Einstreu) – die Bilanz rechnet mit.",
      "„Legeleistung“ zeigt Eier je Henne und Woche.",
    ],
    faq: [
      { q: "Woher kommen die Preise?", a: "Grobe Bio- bzw. Hofladen-Preise als Vergleich – du kannst sie anpassen." },
      {
        q: "Was heißt „Bio“ bei einem Eintrag?",
        a: "Was du einträgst, während dein Hof unter Farm & Team auf „Bio“ oder „Bio-Verband“ steht – Eier, Milch, Honig, Ernte –, bekommt das Zeichen „Bio“. Es bleibt, auch wenn du später umstellst. Oben steht dann „davon Bio“ mit dem Wert. Ware aus der Umstellungszeit darf noch nicht als Bio verkauft werden – das prüft die App nicht.",
      },
    ],
  },
  pasture: {
    title: "Weide",
    href: "/farm/weide",
    intro: "Welche Herde wann wo steht, wann eine Fläche wieder bereit ist und wann gemäht wird: Weidetagebuch, Ruhezeiten, Tier-Tage je Hektar, Schnitte mit Heuwetter, Wurm-Hinweise je Tierart und eine Karte mit eingezeichneten Weiden.",
    steps: [
      "Jede Weide einmal anlegen: Nutzung, Fläche, Ruhezeit, längste Weidedauer.",
      "Optional auf der Karte einzeichnen – die Fläche rechnet die App dann selbst aus.",
      "Auf-, um- und abtreiben mit einem Tipp; die App merkt sich Herde, Tierart, Tiere und Tage.",
      "„Gemäht“ eintragen (gern mit Ballen) – bei Mähweide und Wiese zeigt die App den nächsten Schnitt und ob Heuwetter kommt.",
      "Hinweise und Push sagen, wann umzutreiben ist, wann eine Weide wieder bereit ist und wann ein Schnitt fällig ist.",
    ],
    faq: [
      { q: "Woher kommen die Kartenbilder?", a: "Von OpenStreetMap – erst nach einem Tipp auf „Karte zeigen“. Deine eingezeichneten Weiden bleiben bei uns." },
      {
        q: "Wann soll ich mähen?",
        a: "Die App rechnet mit Richtwerten: Mähweide ab Mitte Mai, dann etwa alle 6 Wochen; Wiese fürs Heu ab Mitte Juni, dann etwa alle 8 Wochen; nach September nicht mehr. Nach einem Weidegang beginnt das Nachwachsen neu. Mit Standort des Hofs prüft sie, ob drei trockene Tage am Stück kommen.",
      },
      {
        q: "Was bedeutet der Wurm-Hinweis?",
        a: "Standen vor Kurzem schon Tiere derselben Art auf der Fläche (Ziegen, Schafe und Alpakas zählen zusammen – sie teilen sich viele Würmer), können ihre Wurmlarven noch im Gras sein. Dann helfen eine Kotprobe, Wechselweide mit einer anderen Tierart oder Nachmähen. Bei „anderen Tieren“ wähle die Tierart, sonst gibt es keinen Hinweis. Ob und womit entwurmt wird, besprich mit dem Tierarzt.",
      },
    ],
  },
  bees: {
    title: "Bienen",
    href: "/farm/bienen",
    intro: "Die Stockkarte für jedes Volk: Durchsicht, Fütterung, Varroa und Honig, mit Hinweisen durchs Bienenjahr. Dazu ein Foto vom Standort je Volk und der KI-Standort-Check.",
    steps: [
      "Jedes Volk einmal anlegen (Stand, Beute, Königin) und ein Foto vom Standort hinterlegen.",
      "Durchsichten eintragen – Waben, Brut, Weiselzellen, Milbenfall.",
      "Varroa-Behandlungen mit Mittel aus dem Arzneimittel-Vorrat – das ist das Bestandsbuch fürs Veterinäramt.",
      "Honig eintragen – er zählt in Ertrag & Bilanz und in der Vorratskammer.",
      "„Standort prüfen lassen“: Foto eines Bienenstands, die KI rät zu Ausrichtung, Wind, Bepflanzung und Feuchtigkeit.",
    ],
    faq: [
      { q: "Muss ich meine Völker melden?", a: "Ja, beim Veterinäramt, und in den meisten Ländern bei der Tierseuchenkasse. Unter „Pflichten“ steht es." },
      { q: "Zählt der Standort-Check?", a: "Ja, als KI-Anfrage für die Farm (15 am Tag). Das Foto geht zur Auswertung an Google Gemini." },
    ],
  },
  wildlife: {
    title: "Wildtier-Radar",
    href: "/farm/kameras",
    intro: "Kameras am Stall melden Fuchs, Marder und Greifvogel. Die App zeigt die Bilder und schickt einen Alarm – nicht in Echtzeit, Licht oder Sirene besser direkt an der Kamera auslösen.",
    steps: ["Eine Kamera anlegen und den Webhook in der Kamera eintragen.", "Ruhezeit zwischen zwei Alarmen wählen.", "Bilder ansehen und Fehlalarme löschen."],
    faq: [{ q: "Warum kommt der Alarm manchmal spät?", a: "Der Server schläft bei wenig Betrieb und braucht bis zu einer Minute zum Aufwachen. Für echten Schutz die Kamera vor Ort reagieren lassen." }],
  },
  handover: {
    title: "Übergabe",
    href: "/farm/uebergabe",
    intro: "Alles für die Vertretung auf einer Seite: Notiz der Admins, heutige Stall-Aufgaben, Wartezeiten, Wetter und letzte Behandlungen.",
    steps: ["Eine Notiz für die Vertretung schreiben (Schlüssel, Tierarzt, Besonderheiten).", "Die Vertretung unter „Farm & Team“ mit Enddatum einladen.", "Sie hakt die Aufgaben auf dieser Seite ab."],
    faq: [{ q: "Was sieht die Vertretung?", a: "Nur, was ihre Rolle und Freigaben erlauben – nach dem letzten Tag endet der Zugang von selbst." }],
  },
  members: {
    title: "Farm & Team",
    href: "/team",
    intro: "Wer gehört zum Hof und was darf wer: Admins, Mitarbeiter, Gäste, Vertretungen mit Enddatum, Freigaben je Modul und wichtige Kontakte wie Tierarzt und Hufschmied.",
    steps: [
      "Mitglieder per E-Mail einladen und eine Rolle wählen.",
      "Optional Module freigeben – etwa nur Stall-Aufgaben.",
      "Bei der Vertretung „Tierarzt einladen“: Zugang auf Zeit zu Tieren, Krankenakte, Arzneimitteln und Export.",
      "Kontakte eintragen; sie stehen auch in der Übergabe.",
      "Unter „Bewirtschaftung“ festlegen, wie ihr wirtschaftet: konventionell, naturnah oder bio – jederzeit umschaltbar.",
      "Unter „Nachhaltigkeit“ abhaken, was ihr für Natur und Klima tut – daraus wird der Hof-Steckbrief.",
    ],
    faq: [
      {
        q: "Was ist der Hof-Steckbrief?",
        a: "Ein, zwei Sätze aus Bewirtschaftung und den abgehakten Maßnahmen (Nistkästen, Blühstreifen, Hecken, Regenwasser, Kompost …). Mit „Text kopieren“ kommt er auf eure Website, ins Schaufenster oder an den Hofladen. Die Liste gibt es für jeden Hof, auch konventionell. Abhaken dürfen Admins und Mitarbeiter.",
      },
      { q: "Was dürfen Gäste?", a: "Lesen, aber nichts ändern." },
      {
        q: "Müssen wir bio wirtschaften?",
        a: "Nein. Bio ist eine Option: „Konventionell“ ist Standard und lässt alle Empfehlungen wie gehabt. „Naturnah“ und „Bio“ stellen Pflanzendoc und Pflege-Guide auf biologische Mittel um; bei Bio lassen sich Kontrollstelle und Umstellungsdatum eintragen. Umschalten geht jederzeit, nur Admins können es.",
      },
      {
        q: "Wie gebe ich meinem Tierarzt Einblick?",
        a: "Unter Vertretung auf „Tierarzt einladen“ tippen. Die E-Mail kommt aus dem Kontakt „Tierarzt“, der Zugang endet nach 14 Tagen (änderbar). Er sieht die Tiere mit Krankenakte, den Arzneimittel-Vorrat und den Export – sonst nichts. Als Gast liest er nur; als Mitarbeiter kann er Behandlungen eintragen. Er braucht ein eigenes Little-Farming-Konto.",
      },
    ],
  },
  export: {
    title: "Veterinäramt-Export",
    href: "/farm/export",
    intro: "Bestandsliste und Medizin-Historie für einen Zeitraum als PDF oder CSV – mit Bienen auch die Völker und das Bestandsbuch der Behandlungen.",
    steps: ["Zeitraum wählen.", "PDF zum Ausdrucken oder CSV für Excel.", "Tiere ohne Ohrmarke stehen am Ende der Liste – Nummern lassen sich nachtragen.", "Auf Bio-Höfen gibt es zusätzlich die Bio-Dokumentation für die Öko-Kontrolle."],
    faq: [
      { q: "Reicht das fürs Veterinäramt?", a: "Es ist eine Arbeitshilfe mit den üblichen Angaben. Was genau verlangt wird, sagt dein Veterinäramt." },
      {
        q: "Was steht in der Bio-Dokumentation?",
        a: "Nur auf Bio-Höfen gibt es den Knopf „Bio-Dokumentation (PDF)“: Bestandsliste und Behandlungen mit Bio-Wartezeit wie im Export, dazu die Bio-Anteile der aktuellen Rationen, Stall und Auslauf je Gruppe, den Weidegang und die Düngung im Zeitraum und das Saatgut. Werte außerhalb der Richtwerte sind mit (!) markiert. Eine Arbeitshilfe für die Öko-Kontrolle – was genau verlangt wird, sagt deine Kontrollstelle.",
      },
    ],
  },
};

export interface HelpTopic {
  id: string;
  title: string;
  faq: { q: string; a: string }[];
}

/** Things that are not one module. */
export const GENERAL_HELP: HelpTopic[] = [
  {
    id: "start",
    title: "Erste Schritte",
    faq: [
      { q: "Wo fange ich an?", a: "Auf der Hof-Seite führt „Einrichtung“ durch die ersten Schritte: Hofname, Standort, erste Tiere, Rationen, Aufgaben, Beete, Team. Jeder Schritt lässt sich überspringen." },
      { q: "Kann ich erst mal ausprobieren?", a: "Ja, mit den Demo-Daten unter „Mehr → Meine Module“: ein Demo-Hof mit Beispielen in jedem Modul. Ein Tipp löscht ihn wieder, deine eigenen Daten bleiben." },
      { q: "Kostet die App etwas?", a: "In der Testphase nicht: Alle Funktionen sind offen und kostenlos, die KI mit einem Tageslimit. Wer jetzt testet, behält die App auch nach dem Start kostenlos." },
      { q: "Wie komme ich in die App?", a: "Über littlefarming.de/app – oder auf littlefarming.de oben auf „Zur App“. littlefarming.de selbst zeigt im Browser die Homepage. Am bequemsten: die App auf dem Startbildschirm installieren, sie öffnet sich dann immer direkt." },
      { q: "Was steht oben auf den Seiten?", a: "Jedes Modul hat oben einen Kasten „So funktioniert’s“. Du kannst ihn zuklappen; die ganze Erklärung steht hier in der Hilfe." },
      {
        q: "Wie melde ich einen Fehler?",
        a: "Über die Sprechblase unten rechts: schreiben oder „Halten & sprechen“. Am meisten hilft ein Screenshot – mach ihn mit dem Handy und häng ihn mit „Bild“ an. Wir sehen dazu, auf welcher Seite du warst.",
      },
    ],
  },
  {
    id: "module",
    title: "Module ein- und ausblenden",
    faq: [{ q: "Ich brauche nicht alles – geht das kleiner?", a: "Unter „Mehr → Meine Module“ blendest du ganze Bereiche oder einzelne Module aus. Nichts wird gelöscht; du kannst sie jederzeit wieder einblenden." }],
  },
  {
    id: "push",
    title: "Benachrichtigungen",
    faq: [
      { q: "Wie bekomme ich Erinnerungen aufs Handy?", a: "Unter „Mehr → Benachrichtigungen“ einschalten und im Browser erlauben. Auf dem iPhone muss die App dafür zum Home-Bildschirm hinzugefügt sein." },
      { q: "Kann ich nachts Ruhe haben?", a: "Ja, mit einer Ruhezeit (Standard 22–7 Uhr). Dann kommt nichts außer dem Raubtier-Alarm des Wildtier-Radars." },
    ],
  },
  {
    id: "offline",
    title: "Ohne Netz",
    faq: [{ q: "Was geht ohne Empfang?", a: "Fotos zum Scannen werden zwischengespeichert, „Am Stall“ zählt Eier und hakt Aufgaben ab. Sobald wieder Netz da ist, wird alles nachgereicht." }],
  },
  {
    id: "daten",
    title: "Daten und Konto",
    faq: [
      { q: "Wer sieht meine Daten?", a: "Die Hofdaten sehen nur die Mitglieder des Hofs. Fotos für die KI gehen zur Auswertung an Google Gemini; Details in der Datenschutzerklärung." },
      { q: "Kann ich meine Daten herunterladen oder löschen?", a: "Ja, unter „Mehr → Konto“: alles als Datei herunterladen oder das Konto löschen." },
      {
        q: "Ich habe mein Passwort vergessen.",
        a: "Auf der Anmeldeseite auf „Passwort vergessen?“ tippen und die E-Mail-Adresse eingeben. Du bekommst einen Link, mit dem du ein neues Passwort festlegst; er gilt einmal. Solange der Mailversand nicht eingerichtet ist, schickt dir der Betreiber den Link.",
      },
      { q: "Wie ändere ich mein Passwort?", a: "Unter „Mehr → Konto → Passwort ändern“. Danach sind alle anderen Geräte abgemeldet – praktisch, wenn jemand dein Passwort kennen könnte." },
    ],
  },
  {
    id: "premium",
    title: "Paket & Abo",
    faq: [
      { q: "Was kostet etwas?", a: "Alles ohne KI ist kostenlos. KI kostet bei jeder Anfrage Geld – deshalb gibt es Pakete mit mehr KI-Anfragen am Tag: Basis 3, Lite 15, Premium 40 (je Bereich, z. B. Pflanzen-Scan oder Hof-KI). Der KI-Check im Grow gehört zu Premium." },
      {
        q: "Wo sehe ich mein Paket?",
        a: "Unter „Mehr“ oben im grünen Kasten oder direkt unter „Paket & Abo“. Dort stehen dein Paket, dein Tageslimit und – mit Abo – bis wann es bezahlt ist. In der Testphase ist alles offen; wer jetzt testet, behält die App auch nach dem Start kostenlos.",
      },
      {
        q: "Wie kündige ich?",
        a: "Unter „Mehr → Paket & Abo → Abo kündigen“ und dann „Jetzt kündigen“. Das Paket läuft bis zum Ende des bezahlten Zeitraums, danach geht es als Basis weiter – deine Daten bleiben. Löschst du dein Konto, endet ein Abo sofort.",
      },
    ],
  },
  {
    id: "notes",
    title: "Alltagsnotizen",
    faq: [
      {
        q: "Was sind die Alltagsnotizen?",
        a: "Deine Einkaufsliste und ein Merkzettel – getrennt von den Hof-Aufgaben. Auf dem Hof unter Pflanzenretter stehen beide als orange Kacheln nebeneinander. Einfach „Halten & sprechen“ gedrückt halten, sagen, z. B. „Ich muss Zahnbürsten kaufen, Fleisch holen und Oma anrufen“, und loslassen: Die KI macht daraus einzelne Notizen und sortiert die Einkäufe nach Bereichen im Laden.",
      },
      {
        q: "Wie teile ich meine Einkaufsliste?",
        a: "Auf der Seite der Alltagsnotizen unten auf „Teilen“ tippen und jemanden aus dem Team wählen oder eine E-Mail-Adresse eingeben – zum Beispiel jemanden aus der Familie mit eigenem Konto. Im selben Dialog lassen sich auch die Hof-Aufgaben mitteilen. Setzt jemand etwas auf die geteilte Liste, bekommen die anderen eine Push-Nachricht (abschaltbar unter Mehr → Benachrichtigungen).",
      },
      {
        q: "Was darf, wer mitmacht?",
        a: "Abhaken und Neues hinzufügen – aber nichts löschen. Löschen kann nur der Besitzer der Liste. Wer nicht mehr mitmachen will, verlässt die Liste mit „Verlassen“.",
      },
    ],
  },
];

const norm = (s: string) => s.toLocaleLowerCase("de-DE");

/** Help entries whose text contains every word of the query. */
export function searchHelp(query: string, ids: readonly ModuleId[]): ModuleId[] {
  const words = norm(query).split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return [...ids];
  return ids.filter((id) => {
    const e = MODULE_HELP[id];
    const text = norm([e.title, e.intro, ...e.steps, ...e.faq.flatMap((f) => [f.q, f.a])].join(" "));
    return words.every((w) => text.includes(w));
  });
}

/** The help entry of the module page at `path` (exact), for the box at the top. */
export function helpForPath(path: string): { id: ModuleId; entry: HelpEntry } | null {
  const clean = path.replace(/\/+$/, "") || "/";
  for (const [id, entry] of Object.entries(MODULE_HELP) as [ModuleId, HelpEntry][]) if (entry.href === clean) return { id, entry };
  return null;
}
