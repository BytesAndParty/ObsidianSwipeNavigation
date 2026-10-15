# Plan: Swipe Navigation v1.1

Überblick über Ziel, Ursachen, Phasen und Entscheidungen. Die Checkliste mit dem Fortschritt steht in [TODO.md](TODO.md), die Findings sind dort als F1–F28 nummeriert.

Stand: 2026-10-15. Phase 0 und 1 sind umgesetzt und committet, aber noch nicht am Gerät getestet, die Aufnahmen fehlen. Phase 2 ist umgesetzt und mit synthetischen Gesten getestet. Phase 3 folgt, beide vor den Aufnahmen (siehe Entscheidungen), ihre Parameter bleiben bis zur Auswertung vorläufig. Phase 4 ist offen.

## Ziel

Das Plugin soll sich beim Wischen wie Safari anfühlen: Es reagiert auf die Geste, löst beim Loslassen aus und lässt sich durch Zurückwischen abbrechen. Es soll nur navigieren, wenn der Swipe auch gemeint war.

## Ausgangslage

Das Plugin liest Scroll-Events (`wheel`) und rechnet daraus eine Swipe-Geste. Daran sind zwei Dinge falsch:

1. **Fingerzustand unbekannt.** Aus `wheel`-Events lässt sich nicht ablesen, ob der Finger aufliegt, angehoben wurde oder die Bewegung nur nachrollt (Momentum). Die Regel „200 ms ohne Events = losgelassen“ liegt deshalb in beide Richtungen daneben (F1, F2).
2. **Kontext ignoriert.** Es wurde nicht geprüft, wo der Swipe passiert: Codeblock, Canvas, Modal, Sidebar, welches Pane, welches Fenster (F5–F9).

Daraus ergeben sich die Fehlauslösungen, das späte Navigieren und das zähe Gefühl.

## Vorgehen

- Jeder große Schritt endet mit einer unabhängigen Prüfung durch einen Subagenten. Er bekommt diesen Plan und die TODO als Maßstab und soll Lücken finden, nicht bestätigen. Seine Findings werden behoben, bevor der nächste Schritt beginnt.
- Pro Schritt ein eigener Commit, aber erst, wenn Robert die Änderungen gesichtet hat.
- Reihenfolge in dieser Runde:
  1. Nachbesserungen aus dem Review vom 2026-10-15: Maus-Heuristik (F26), Auswertung, `CLAUDE.md`
  2. Phase 2: neue Gesten-Erkennung mit Tests
  3. Phase 3: neuer Indikator
  4. Phase 4, soweit ohne Entscheidung möglich: Doku, Versionsprüfung
- Danach am Gerät: Build einspielen, Szenarien aufnehmen, Parameter einstellen, Test-Durchlauf.

## Phasen

### Phase 0: Messen (umgesetzt, Aufnahmen offen)

Werte werden mit echten Aufnahmen eingestellt, nicht geschätzt.

- **Recorder** im Debug-Modus: Befehle „Start gesture recording“ und „Stop gesture recording“, Szenarioauswahl, „● REC“ in der Statusleiste.
- **Trace-Dateien** unter `<vault>/.obsidian/plugins/obsidian-swipe-navigation/traces/` mit rohen Wheel-Events und Markern (Gesture-Start, Achse, Schwelle, Loslassen, Gesture-Ende, Navigation, `file-open`).
- **Auswertung** mit `bun run analyze-traces <ordner>`: eine Zeile pro Geste, inklusive Verhältnis `wheelDeltaX / deltaX` (F26).
- **Offene Fragen**, die die Aufnahmen klären sollen:
  - ~~Schickt Chromium beim Abheben ein Event mit `deltaX = 0`?~~ Unter macOS nein: Chromium verwirft das Phase-Ended-Event, bevor es JS erreicht (Faktencheck, siehe Grundlagen). Unter Windows kommt beim Fling-Beginn eventuell ein (0,0)-Event an. Das zeigen die Windows-Traces.
  - Wie sieht das Momentum aus (Länge, Abnahme pro Event)? Unterscheidet es sich vom Abbremsen des Fingers?
  - Stimmen die Verhältnisse `wheelDeltaX / deltaX` aus dem Chromium-Quellcode auch am Gerät: macOS-Trackpad 3, Windows-Precision-Touchpad 1, Maus-Notch 120 pro Notch? Davon hängt die Maus-Erkennung ab (F26).
  - Wie unterscheiden sich die Deltas bei 60 und 120 Hz?
- **Aufnahmeszenarien:** langsam zurück, schneller Flick, halten dann loslassen, abbrechen, vorwärts, vertikal scrollen, scrollen und sofort zurückwischen, diagonal scrollen, breiter Codeblock, Canvas, Shift+Mausrad, horizontales Mausrad, 3-Finger-Swipe.

### Phase 1: Schnelle Fixes (umgesetzt, Test am Gerät offen)

- 3-Finger-Modus entfernt. Obsidian setzt das macOS-`swipe`-Event selbst in `history.back()` und `forward()` um, das Plugin hat doppelt navigiert (F4). Die Einstellungen erklären jetzt die eingebaute macOS-Option.
- Pro Geste wird einmal am Anfang entschieden, ob sie navigieren darf (`src/context.ts`):
  - nicht bei Modifier-Tasten und Mausrad-Notches (F8)
  - nicht außerhalb von Panes im Hauptbereich, also nicht über Modals, Menüs, Sidebars (F6)
  - nicht in Ansichten aus der Liste „Disabled in views“, Standard `canvas, graph, localgraph, excalidraw`
  - nicht, solange der Inhalt unter dem Zeiger in Swipe-Richtung noch scrollen kann (F5)
- Navigiert wird das Pane unter dem Zeiger über dessen eigene History, der Indikator sitzt an dessen Rändern (F7, F20).
- Einstellung „Reverse swipe direction“ (F13).
- Pop-out-Fenster werden unterstützt (F9).
- Kleinere Fehler: tote Sperre entfernt (F3), alter Indikator wird bei Richtungswechsel zurückgesetzt (F11), `log()` beachtet den Debug-Modus (F22), Überschriften über `setHeading()` (F23).
- **Nachbesserung F26:** Die Maus-Erkennung hielt Trackpad-Events mit `deltaX` von ±40 oder ±80 für Mausrad-Notches, weil Chromium unter macOS `wheelDeltaX` als −3 × `deltaX` meldet. Windows-Precision-Touchpads melden −1 × `deltaX`, dort traf es `deltaX` von ±120. Ein Event gilt jetzt nur noch als Notch, wenn `wheelDeltaX` ein 120er-Vielfaches ist und das Verhältnis zu `deltaX` weder 3 noch 1 ist.

### Phase 2: Neue Gesten-Erkennung (umgesetzt, Test am Gerät offen)

Der Kern für das Gefühl. Eigene Klasse `GestureRecognizer` (`src/GestureRecognizer.ts`) ohne DOM- und Obsidian-Abhängigkeit, gefüttert mit `{ t, dx, dy }`. Getestet mit `bun test`: jetzt mit synthetischen Gesten, sobald Aufnahmen da sind zusätzlich als Replay der Traces aus `test/fixtures/traces/`.

- **Zustände:** wartet → beobachtet → wischt (Achse horizontal gesperrt) oder abgelehnt → Entscheidung (auslösen oder abbrechen) → Ruhephase → wartet.
- **Kontext** wie in Phase 1 einmal am Anfang der Geste, jetzt auch beim vertikalen Scrollen. Startet die Geste vertikal (`deltaX = 0`), lehnt schon horizontal scrollbarer Inhalt in beide Richtungen ab. Eine abgelehnte Geste bleibt bis zu ihrem Ende abgelehnt, auch durch Momentum.
- **Achse** nach den ersten 12 px Bewegung festlegen und beibehalten: horizontal, wenn die horizontale Bewegung mindestens doppelt so groß ist wie die vertikale (F15). Vertikal heißt abgelehnt.
- **Aktivierung mit der Achsensperre** statt über eine Mindestgeschwindigkeit. Gezählt wird ab dem ersten Event der Geste (F14).
- **Weg ab Gesten-Beginn:** Fortschritt = Weg seit Gesten-Beginn / Schwelle. Ein Richtungswechsel über den Startpunkt hinweg wird ohne Zurücksetzen verrechnet (F27).
- **„Bereit“ mit Hysterese:** bereit ab 100 %, zurück erst unter 85 %. Was der Indikator zeigt, entscheidet auch beim Loslassen.
- **Loslassen erkennen:**
  - Momentum = mindestens 4 Events in Folge nach einem Höchstwert, die gleichmäßig kleiner werden (jeder Schritt zwischen 50 % und 100 % des vorigen, insgesamt höchstens 90 %). Dann gilt der Finger als angehoben, entschieden wird mit dem Stand am Höchstwert (F1).
  - Rückfall: 400 ms ohne Events. Länger als bisher, damit kurzes Halten mitten im Swipe nicht auslöst (F2).
  - Ein Event mit `deltaX = 0` wird erst als Signal genutzt, wenn die Aufnahmen zeigen, dass Chromium es beim Abheben schickt.
- **Entscheidung:** auslösen, wenn „bereit“, oder bei einem Flick ab 40 % Weg mit mindestens 1,5 px/ms in Swipe-Richtung (wie iOS). Ein Flick zurück bricht immer ab.
- **Ruhephase:** Restliches Momentum wird geschluckt, bis 150 ms lang nichts kommt. Wird es wieder deutlich schneller (Finger wieder aufgelegt), beginnt sofort eine neue Geste.
- **Kein Cooldown mehr zwischen Gesten:** Eine Geste navigiert höchstens einmal, ein bewusster zweiter Swipe navigiert wieder (F18).

Alle Zahlen sind vorläufig und werden mit den Aufnahmen eingestellt.

Später: Ab Chromium 151 gibt es `WheelEvent.momentum`, ein echtes Momentum-Signal. Sobald Obsidian eine Electron-Version damit ausliefert (Stand 2026-10-15: Chromium 142), ersetzt es per Feature-Erkennung die Momentum-Heuristik.

### Phase 3: Gefühl wie in Safari (offen)

- Runder Indikator mit Pfeil, der mit dem Finger hereinfährt und spürbar dämpft (F16).
- Aufploppen und Einfärben, sobald „bereit“ (Hysterese aus Phase 2).
- Ohne Verlauf ausgegraut und mit starkem Widerstand.
- Eigene Klasse `SwipeIndicator`. CSS-Variablen und `transform`, Updates pro Animationsframe gebündelt, Pfeil-Element gecacht (F17, F21).
- `prefers-reduced-motion` wird respektiert.
- Optional, nicht in dieser Runde: Inhalt zieht leicht mit, neue Notiz gleitet herein (F19).

### Phase 4: Release (offen)

- Neue Plugin-ID ohne „obsidian“, z. B. `trackpad-swipe-navigation` (F24). Braucht eine Entscheidung von Robert, weil sich der Plugin-Ordner und damit Einstellungen und Trace-Pfad ändern.
- README und Manifest aktualisieren (F25). `CLAUDE.md` wird schon im ersten Schritt aktualisiert.
- Version, `versions.json` und `minAppVersion` prüfen.
- Testmatrix: macOS mit 60 und 120 Hz, Natural Scrolling an und aus, Magic Mouse, Windows-Touchpad, Maus mit Shift+Rad, geteilte Ansicht, Pop-out, Canvas, Codeblock, Modal.
- GitHub-Release mit `main.js`, `manifest.json`, `styles.css`, PR an obsidian-releases, optional Demo-GIF.

## Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Werte aus Aufnahmen, nicht geschätzt | Ohne Aufnahmen werden die Werte blind eingestellt. Gilt weiter für alle Parameter. |
| Phase 2 und 3 vor den Aufnahmen bauen (2026-10-15) | Ablauf, Zustände und Tests hängen nicht von den Messwerten ab, nur die Parameter. Die bleiben vorläufig, die Replay-Tests prüfen sie, sobald Traces da sind. |
| 3-Finger-Modus entfernt | Obsidian macht das schon selbst, das Plugin hat doppelt navigiert. Bestätigt im Code von `obsidian.asar` (Obsidian 1.14.4), am Gerät noch nicht. |
| Kontext-Entscheidung einmal pro Geste | Wie Browser es mit dem Scroll-Ziel machen: Wer einen Codeblock scrollt, navigiert nicht mittendrin, auch nicht durch Momentum. |
| Aktivierung über Achsensperre statt Geschwindigkeit | Safari und Chromium starten die Zurück-Geste unabhängig vom Tempo. Vor langsamem horizontalem Scrollen schützt die Kontextprüfung (scrollbarer Inhalt, „Disabled in views“). Langsame, bewusste Swipes funktionieren damit (F14). |
| Kein Cooldown zwischen Gesten | Eine Geste löst höchstens einmal aus, Momentum wird bis zum Ende geschluckt. Ein Cooldown würde nur bewusste zweite Swipes verschlucken (F18). |
| Richtung als Einstellung | Chromium meldet nicht, ob die Deltas durch Natural Scrolling invertiert sind. |
| Maus-Erkennung per Heuristik | `deltaMode` ungleich 0 oder `wheelDeltaX` als 120er-Vielfaches, dessen Verhältnis zu `deltaX` nicht das eines Trackpads ist (3 unter macOS, 1 bei Windows-Precision-Touchpads) (F26). Wird mit den Traces geprüft. |

## Risiken

- **Die Maus-Heuristik** ist auf Chromium-Interna gebaut. Sie verpasst hochauflösende Mäuse und Notches bei einem Seitenzoom ungleich 100 % (bei 110 % meldet Chromium 109 statt 120). Ein horizontales Mausrad kann dann navigieren. Shift+Rad bleibt durch die Modifier-Prüfung abgedeckt.
- **Zoom (F28):** Chromium teilt alle Deltas durch den Seitenzoom. Bei 150 % Zoom braucht ein Swipe 1,5-mal so viel Fingerweg. Ein Ausgleich braucht eine verlässliche Quelle für Obsidians Zoomfaktor.
- **Momentum-Erkennung ohne Aufnahmen.** Ein Finger, der vor dem Zurückwischen gleichmäßig abbremst, kann wie Momentum aussehen und zu früh auslösen. Bis zum Einstellen kann sich das Loslassen falsch anfühlen. Die Szenarien „abbrechen“ und „halten, dann loslassen“ sind dafür die wichtigsten Aufnahmen.
- **Längerer Rückfall-Timeout** (400 ms) verzögert die Navigation, wenn der Finger erst still steht und dann ohne Momentum abhebt.
- **Swipe direkt nach dem Scrollen.** Vertikales Scrollen ist jetzt eine eigene, abgelehnte Geste, die erst nach 150 ms ohne Events endet, Momentum eingeschlossen. Ein Swipe, der früher beginnt, wird geschluckt. Bewusst die sichere Seite: Ein Neustart bei horizontalen Events würde diagonales Scrollen wieder navigieren lassen (F15). Das Szenario „Scrollen, dann sofort zurückwischen“ misst die Lücke, danach wird die Pause oder eine Regel dafür eingestellt.
- **Interne Obsidian-APIs** (`leaf.history`, `app.commands`) sind nicht offiziell dokumentiert. Dafür gibt es den Fallback über die Befehle `app:go-back` und `app:go-forward`.

## Grundlagen

Faktencheck vom 2026-10-15 zur Wheel-Verarbeitung in Chromium, belegt im Chromium-Quellcode (`web_input_event_builders_mac.mm`, `wheel_event.cc`, `web_input_event_builders_win.cc`, `mouse_wheel_event_manager.cc`):

- `wheelDeltaX` ist unter macOS bei Trackpads −3 × `deltaX` (40 px pro Tick, 120 pro Tick), bei Windows-Precision-Touchpads −1 × `deltaX`. Mausrad-Notches melden 120 pro Notch. macOS-Trackpad-Deltas sind ganzzahlig.
- Alle Deltas werden durch `devicePixelRatio` geteilt, das den Seitenzoom enthält.
- Momentum-Events sind normale Wheel-Events mit demselben Ziel. Das Phase-Ended-Event beim Abheben erreicht JS unter macOS nicht.
- Wheel-Scroll-Latching ist auf allen Desktop-Plattformen aktiv: Eine Geste bleibt beim Scroller, auf dem sie begann, auch durch Momentum.

## Test-Vault

Installiert ist das Plugin im Vault `UnfilteredMe` (OneDrive), `.obsidian/plugins/obsidian-swipe-navigation/`. Dort liegt zusätzlich ein älterer Ordner `swipe-navigation` mit derselben Plugin-ID. Er sollte vor dem Test entfernt werden, sonst ist unklar, welcher Build läuft.

## Nächster Schritt

Die Schritte 1 bis 4 aus „Vorgehen“. Danach Build in den Test-Vault, Szenarien aus Phase 0 aufnehmen, Parameter aus Phase 2 einstellen und den Test-Durchlauf aus Phase 1 machen.
