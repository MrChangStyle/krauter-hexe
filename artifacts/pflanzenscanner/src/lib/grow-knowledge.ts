/**
 * Grow-Wissen: the fixed guide of the Grow module (docs/grow.md). Plain
 * horticulture – no consumption advice.
 */

export interface KnowledgeSection {
  id: string;
  title: string;
  intro: string;
  points: { title: string; text: string }[];
}

export const KNOWLEDGE: KnowledgeSection[] = [
  {
    id: "grundlagen",
    title: "Grundlagen: Gattung, Art, Sorte",
    intro: "Botanisch gehört jede Pflanze zur Gattung Cannabis und zur Art Cannabis sativa. Indica, Sativa und Ruderalis sind Typen innerhalb dieser Art, die Sorte (Strain) ist die Züchtung.",
    points: [
      { title: "Indica", text: "Kompakt, breite Blätter, kurze Blüte (etwa 7–9 Wochen). Gut für Zelte mit wenig Höhe." },
      { title: "Sativa", text: "Hoch, schmale Blätter, lange Blüte (10–14 Wochen). Braucht Platz und Geduld, draußen oft zu spät reif." },
      { title: "Hybrid", text: "Kreuzung aus beiden – die meisten Sorten im Handel. Die Blütezeit steht auf der Packung." },
      { title: "Ruderalis und Autoflower", text: "Autoflower tragen Ruderalis-Gene und blühen unabhängig vom Licht nach etwa 3–5 Wochen. Ernte nach 9–12 Wochen ab Keimung – ideal für Einsteiger und späte Outdoor-Starts." },
      { title: "Feminisiert oder regulär", text: "Feminisierte Samen ergeben fast nur weibliche Pflanzen. Aus regulären Samen wird etwa jede zweite männlich – diese bei Beginn der Blüte entfernen." },
    ],
  },
  {
    id: "umgebung",
    title: "Indoor, Outdoor, Gewächshaus",
    intro: "Wo die Pflanze wächst, bestimmt Licht, Klima und Zeitplan.",
    points: [
      { title: "Indoor im Zelt", text: "Volle Kontrolle über Licht und Klima. Für ein Zelt von 80 × 80 cm reicht eine gute LED mit etwa 200–300 W. Abluft mit Aktivkohlefilter hält Geruch und Luftfeuchte im Griff, ein kleiner Umluftventilator stärkt die Stängel." },
      { title: "Outdoor im Freien", text: "Sonniger Platz mit mindestens 6 Stunden direkter Sonne, windgeschützt und nicht einsehbar. Erst nach den Eisheiligen (Mitte Mai) raus, vorher drinnen vorziehen. Die Blüte beginnt von selbst, wenn die Nächte im August länger werden." },
      { title: "Im Gewächshaus", text: "Wärmer und vor Regen geschützt – die Pflanzen werden größer. Gut lüften: stehende, feuchte Luft ist der häufigste Grund für Schimmel in der Blüte." },
    ],
  },
  {
    id: "erde",
    title: "Erde und Substrat",
    intro: "Für den Anfang ist Erde am verzeihendsten.",
    points: [
      { title: "Erde", text: "Leicht vorgedüngte, lockere Erde mit 20–30 % Perlite für Luft an den Wurzeln. Starke Blumenerde mit Langzeitdünger ist zu „heiß“ für Sämlinge. pH-Wert 6,2–6,8." },
      { title: "Kokos", text: "Locker und schnell, verzeiht aber weniger: von Anfang an leicht düngen, mit Calcium und Magnesium, und täglich gießen. pH-Wert 5,8–6,2." },
      { title: "Hydro", text: "Wurzeln im Wasser mit Nährlösung – schnellstes Wachstum, aber Technik und Messwerte müssen stimmen. Eher für Fortgeschrittene. pH-Wert 5,6–6,0." },
    ],
  },
  {
    id: "toepfe",
    title: "Töpfe",
    intro: "Der Topf bestimmt, wie groß die Wurzeln – und damit die Pflanze – werden kann.",
    points: [
      { title: "Stofftöpfe", text: "Luft kommt an die Wurzeln, sie verzweigen sich statt im Kreis zu wachsen, und Staunässe hat keine Chance." },
      { title: "Größen", text: "Anzucht 0,5–1 l. Endtopf indoor 11–20 l, outdoor und im Gewächshaus 30–60 l oder ein Platz direkt im Beet." },
      { title: "Autoflower", text: "Direkt in den Endtopf (11–15 l) säen – jedes Umtopfen kostet Zeit, die eine Autoflower nicht hat." },
    ],
  },
  {
    id: "duenger",
    title: "Dünger",
    intro: "Weniger ist mehr: mit der halben Dosis anfangen und die Pflanze beobachten.",
    points: [
      { title: "Wachstum", text: "Stickstoffbetont (etwa NPK 3-1-2). Sattgrüne Blätter sind gut, dunkelgrüne mit nach unten gebogenen Spitzen sind zu viel." },
      { title: "Blüte", text: "Phosphor und Kalium betont (etwa NPK 1-3-2), Stickstoff zurückfahren. Viele Hersteller haben ein Schema nach Wochen." },
      { title: "Organisch oder mineralisch", text: "Organisch (Wurmhumus, Guano, Bio-Flüssigdünger) ist einfach und fehlerverzeihend in Erde. Mineralisch wirkt schnell und lässt sich genau dosieren – dann EC messen." },
      { title: "Calcium und Magnesium", text: "Bei Kokos, LED-Licht und weichem Wasser fast immer nötig. Rostige Flecken auf mittleren Blättern sind ein Zeichen." },
      { title: "Spülen", text: "In den letzten 7–10 Tagen nur noch klares Wasser – die Pflanze baut ihre Reserven ab." },
    ],
  },
  {
    id: "giessen",
    title: "Gießen",
    intro: "Mehr Pflanzen gehen an zu viel Wasser ein als an zu wenig.",
    points: [
      { title: "Wann", text: "Den Topf anheben: ist er leicht, wird gegossen. Erde zwischen dem Gießen antrocknen lassen." },
      { title: "Wie viel", text: "So viel, dass 10–20 % unten herauslaufen. Ablaufwasser nicht stehen lassen." },
      { title: "Wasser", text: "Leitungswasser abstehen lassen, Raumtemperatur, pH-Wert passend zum Substrat einstellen." },
    ],
  },
  {
    id: "training",
    title: "Schnitt und Training",
    intro: "Ziel ist ein flaches, gleichmäßiges Blätterdach, auf das überall Licht fällt.",
    points: [
      { title: "LST (Low Stress Training)", text: "Haupttrieb und Seitentriebe vorsichtig nach unten binden. Schont die Pflanze und geht auch bei Autoflowern." },
      { title: "Toppen und FIM", text: "Die Spitze über dem 4. oder 5. Knoten abschneiden (Toppen) oder zu etwa 80 % abknipsen (FIM). Aus einem Haupttrieb werden zwei oder mehr. Nur bei gesunden, photoperiodischen Pflanzen im Wachstum." },
      { title: "SCROG", text: "Ein Netz über die Pflanzen spannen und die Triebe darunter verteilen – ideal für kleine Zelte mit wenig Pflanzen." },
      { title: "Lollipopping", text: "Kurz vor oder zu Beginn der Blüte die unteren Triebe entfernen, die kein Licht bekommen – sie würden nur kleine, lockere Blüten bilden." },
      { title: "Entlauben", text: "Um Tag 21 der Blüte große Blätter entfernen, die Blüten verschatten oder das Innere zumachen. Nicht mehr als ein Drittel auf einmal, bei Autoflowern sparsam." },
    ],
  },
  {
    id: "wachstum",
    title: "Worauf achten im Wachstum",
    intro: "Jetzt entsteht das Gerüst für die Blüte.",
    points: [
      { title: "Lichtabstand", text: "Zu nah: helle, verbrannte Spitzen. Zu weit: lange, dünne Stängel. Den Abstand der Lampe nach Herstellerangabe einstellen und mit der Pflanze mitwandern." },
      { title: "Klima", text: "22–28 °C und 50–70 % Luftfeuchte. Nachts nicht unter 18 °C." },
      { title: "Wann in die Blüte", text: "Indoor auf 12/12 umstellen, wenn die Pflanze etwa halb so hoch ist wie der verfügbare Platz – sie streckt sich in der Blüte noch einmal auf das Doppelte." },
    ],
  },
  {
    id: "bluete",
    title: "Worauf achten in der Blüte",
    intro: "Die heikelste Phase – Fehler zeigen sich jetzt direkt an den Blüten.",
    points: [
      { title: "Stretch", text: "In den ersten zwei bis drei Wochen wächst die Pflanze kräftig in die Höhe. Platz einplanen." },
      { title: "Lichtlecks", text: "Photoperiodische Pflanzen brauchen 12 Stunden völlige Dunkelheit. Licht in der Nacht kann Zwitter mit Samen machen." },
      { title: "Luftfeuchte und Schimmel", text: "Luftfeuchte auf 40–50 % senken, gut lüften. Graue, matschige Stellen in den Blüten (Botrytis) großzügig ausschneiden – draußen nach Regen jeden Tag nachsehen." },
      { title: "Zwitter", text: "Einzelne Pollensäcke (kleine Bananen) zwischen den Blüten entfernen, bei vielen die Pflanze aus dem Zelt nehmen." },
    ],
  },
  {
    id: "ernte",
    title: "Ernte, Trocknen, Curing",
    intro: "Gutes Trocknen ist so wichtig wie der ganze Grow davor.",
    points: [
      { title: "Erntezeitpunkt", text: "Mit einer Lupe (30–60×) die Trichome ansehen: klar = zu früh, milchig = reif, bernsteinfarben = über dem Höhepunkt, wirkt schwerer." },
      { title: "Trocknen", text: "Kopfüber in einem dunklen Raum bei 15–20 °C und 55–62 % Luftfeuchte, leichte Luftbewegung ohne direkten Luftzug. Nach 7–14 Tagen knacken dünne Stiele." },
      { title: "Curing", text: "Blüten locker in Gläser füllen. In der ersten Woche täglich kurz öffnen, danach wöchentlich. Nach vier Wochen ist das Aroma deutlich besser." },
    ],
  },
  {
    id: "probleme",
    title: "Häufige Probleme",
    intro: "Erst die Grundwerte prüfen (pH, Gießen, Licht), dann an Mangel denken.",
    points: [
      { title: "Untere Blätter gelb", text: "Stickstoffmangel im Wachstum – in der späten Blüte dagegen normal." },
      { title: "Rostige Flecken", text: "Calcium- oder Magnesiummangel, oft durch falschen pH-Wert." },
      { title: "Verbrannte Blattspitzen", text: "Zu viel Dünger – Dosis senken." },
      { title: "Hängende Blätter", text: "Fast immer zu viel Wasser, seltener zu wenig." },
      { title: "Spinnmilben", text: "Feine Gespinste und Pünktchen auf den Blättern. Luftfeuchte erhöhen, Raubmilben einsetzen." },
      { title: "Trauermücken", text: "Kleine schwarze Fliegen über der Erde: oben trockener halten, Gelbtafeln, Nematoden." },
      { title: "Mehltau", text: "Weißer Belag auf den Blättern. Befallene Blätter entfernen, besser lüften, Luftfeuchte senken." },
    ],
  },
];
