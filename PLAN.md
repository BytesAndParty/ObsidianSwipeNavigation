# Plan: Swipe Navigation v1.1

Überblick über Ziel, Stand, Phasen und Entscheidungen. Die Checkliste mit dem Fortschritt steht in [TODO.md](TODO.md), die Findings sind dort als F1–F39 nummeriert.

## Übergabe (Stand 2026-10-15, abends)

Für alle, die hier weitermachen: Dieser Abschnitt sagt, wo die Arbeit steht, was offen ist und was bei der schwierigsten Stelle, dem Erkennen des Loslassens, schon probiert wurde.

### Kurzfassung

- **Alles ist auf `main` committet**, nicht gepusht. Commits dieser Runde, älteste zuerst:
  - `2e85557` feat: navigate only for intended swipes in the pane under the pointer (Phase 1)
  - `8ec34cc` feat: record gesture traces in debug mode (Phase 0)
  - `2de8290` docs: add v1.1 rework plan and findings
  - `0d5bc5d` fix: stop treating trackpad events as mouse-wheel notches (F26)
  - `f3cccfe` docs: add review findings and Chromium fact-check to the plan
  - `9c2b1d6` feat: gesture recognizer with inferred release (work in progress) (Phase 2)
  - `d8fdda9` feat: draft Safari-style swipe indicator (not wired yet) (Phase 3, Entwurf)
  - `f3121ca` docs: update README, development guide and disclaimer for v1.1
- **Build** (`bun run build`) ist grün. **Tests** (`bun test`): 47 von 50 grün, 1 übersprungen (Replay, weil es noch keine Traces gibt), 3 rot (siehe unten).
- **Nichts ist am Gerät getestet**, es gibt noch keine Aufnahmen. Alle Parameter sind Schätzungen.
- Das Plugin nutzt schon die neue Erkennung aus Phase 2. Der neue Indikator aus Phase 3 liegt als Entwurf in `src/SwipeIndicator.ts` und `src/SwipeIndicator.draft.css`. `main.ts` steuert noch den alten Indikator.
- README und DEVELOPMENT.md beschreiben schon den Zielzustand inklusive des neuen Indikators.
- `CLAUDE.md` und `.claude/` sind absichtlich nicht committet (lokale Pfade, Rechte). `CLAUDE.md` ist auf dem Stand dieser Runde.

### Wie weitermachen

1. **Zuerst entscheiden:** echte Aufnahmen holen oder erst die synthetischen Tests grün machen?
   - **Empfehlung: Aufnahmen zuerst.** Der Recorder speichert die rohen Events, egal wie gut die Erkennung schon ist.
   - Jede weitere Feinarbeit an synthetischen Modellen kann an echten macOS-Daten vorbeigehen.
   - Ablauf: Build in den Test-Vault (siehe „Test-Vault“), Debug-Modus an, Szenarien aus Phase 0 aufnehmen. Traces nach `test/fixtures/traces/` kopieren, dann `bun run analyze-traces test/fixtures/traces` und `bun test` laufen lassen.
2. **Phase 2 abschließen:**
   - die 3 roten Tests (unten)
   - die offenen Findings F35, F36, F38 und F39
   - die Parameter mit den Traces einstellen
   - danach eine zweite Review-Runde durch einen Subagenten, mit diesem Plan und der TODO als Maßstab
3. **Phase 3:** `SwipeIndicator` einbauen (Schritte unten), dann Review.
4. **Phase 4:** Robert entscheidet die Plugin-ID. Danach Version 1.1.0, Testmatrix, Release.

### Arbeitsweise (Roberts Regeln)

- Nach jedem großen Schritt prüft ein unabhängiger Subagent gegen diesen Plan. Er soll Lücken finden, nicht bestätigen.
- Commits pro Schritt, aber erst, wenn Robert die Änderungen gesichtet hat. Robert gibt den Commit frei.
- Commit-Messages:
  - keine Hinweise auf KI
  - Conventional Commits
  - kein Gedankenstrich
  - direkt auf `main`, kein Push
- Paketmanager ist Bun, nie npm/yarn/pnpm. Umlaute werden normal geschrieben.

### Die Kernschwierigkeit: Loslassen erkennen

Wheel-Events sagen nicht, wann die Finger das Trackpad verlassen. Unter macOS verwirft Chromium das Phase-Ended-Event, bevor es JS erreicht (siehe „Grundlagen“). Das Plugin muss das Loslassen aus dem Verlauf der Geschwindigkeit ableiten. Dabei ziehen zwei Fehler in entgegengesetzte Richtungen:

- **Zu früh oder fälschlich als Momentum erkannt:** Bewusste Swipes brechen ab, oder ein Abbruch navigiert doch (F29).
- **Momentum zu spät erkannt:** Es schiebt kurze Swipes über die Schwelle (F1).

Was schon probiert wurde, damit es niemand wiederholt:

| Version | Idee | Ergebnis |
|---|---|---|
| v1 | Mindestens 4 kleiner werdende Events nach einem Höchstwert gelten als Momentum. Entschieden wird mit dem Stand am Höchstwert. | Das Review zeigte: Jedes normale Abbremsen des Fingers passt. Bewusste Swipes brachen ab, Abbrüche navigierten doppelt (F29). Die ersten Tests hatten nur konstante Geschwindigkeiten und harte Stopps und haben das nicht gezeigt. |
| v2 | Vorläufig statt endgültig. 66 ms gleichmäßiger Abfall frieren den Swipe ein, weitere 66 ms mit derselben Abfallrate bestätigen. | Langsame Striche (900 ms) wurden falsch erkannt. In der Nähe des Höchstwerts bremst ein Finger mit fast konstanter Rate, genau wie Momentum. |
| v2b | Wie v2, aber entschieden wird mit dem Stand bei der Bestätigung statt mit dem eingefrorenen Stand. | Langsame Striche gingen. Dafür zählten ~130 ms Momentum mit und schoben einen 60-px-Swipe bei 120 Hz über die Schwelle (F1). Verworfen. |
| v3 (aktuell) | Gleiche Geschwindigkeitsstufen (Details unter Phase 2). Momentum braucht für jede Stufe gleich lang. | 3 Tests rot, siehe unten. |

Zu v3:

- Gemessen wird die Zeit vom Höchstwert bis 80 % und die Zeit von 80 % bis 64 %, beide linear interpoliert.
- Verhältnis der beiden Zeiten:
  - Momentum: 1,0
  - Finger nach dem Minimum-Jerk-Profil (so bewegen Menschen den Finger von Ruhe zu Ruhe): etwa 0,4
  - gleichmäßiges Abbremsen: 0,8
- Bestätigt ist das Loslassen, wenn die zweite Stufe mindestens 0,85-mal so lange dauert wie die erste.
- Entschieden wird mit dem eingefrorenen, zuletzt angezeigten Stand.
- Der Wechsel von v2 auf v3 hat andere Fälle grün gemacht:
  - 900-ms-Strich bei 60 Hz
  - langsamer Swipe mit Momentum bei 60 Hz
  - Abbremsen und Umkehren aus dem Review

Bei jeder Änderung immer alle Tests im Blick behalten, die Fälle ziehen gegeneinander.

### Die 3 roten Tests (v3)

1. **„momentum does not push a short swipe over the threshold (60 Hz)“:** Das Loslassen wird mit p = 1,67 entschieden, erwartet ist < 1.
   - Vermutung: Das gleitende 50-ms-Fenster der Geschwindigkeit rundet den Höchstwert ab. Die erste Stufe wirkt dadurch länger, das Verhältnis fällt unter 0,85, der Swipe läuft weiter und Momentum zählt mit.
   - Ansätze:
     - die erste Stufe erst ab 95 % des Höchstwerts messen
     - ein kürzeres Fenster
     - die Schwelle auf 0,75 senken und das Risiko beim gleichmäßigen Abbremsen in Kauf nehmen
   - Mit v2 (Schwelle 0,7, ohne Interpolation) war dieser Test grün.
2. **„a flick navigates below the threshold when the release is detected early“** (mit `momentumStep: 0.9`): Mit der kleineren Stufe überwiegt das Rauschen.
   - Die Testprämisse ist schwer zu bauen: Bei Flick-Tempo überschreitet das Momentum die Schwelle vor jeder Erkennung.
   - Der Flick selbst navigiert, sein eigener Test ist grün.
   - Vorschlag: die Flick-Regel in `release()` direkter prüfen oder den Test streichen.
3. **„a locked horizontal swipe ignores later vertical movement“:** Der Fortschritt bleibt bei 0,17 stehen statt 0,29.
   - Die idealisierte Eingabe fällt abrupt von 8 auf 2 px pro Event. Das 50-ms-Fenster macht daraus einen gleichmäßigen Abfall, der wie Momentum aussieht, und der Swipe friert ein.
   - Wahrscheinlich ist die Testeingabe unrealistisch: `stroke` statt `move` nehmen oder auf die Entscheidung prüfen statt auf den letzten Fortschritt.
   - Der Test zeigt aber auch, dass das Fenster abrupte Änderungen verwischt.

Debug-Hilfe, die beim Eingrenzen am meisten geholfen hat:

- Die Klasse `Gesture` aus `test/GestureRecognizer.test.ts` in ein Skript kopieren.
- Eine Geste einspeisen und `recognizer.phase` vor und nach jedem `feed` vergleichen.
- Jeden Zustandswechsel mit Zeit und Delta ausgeben.

### Phase 3 einbauen

- **`main.ts`:** Die alten Indikator-Teile durch `SwipeIndicator` ersetzen, also `createIndicators` bis `animateIndicatorReset`, `indicatorLeft/Right` und `shownDirection`.
  - `onAxisLocked` → `indicator.place(leaf.view.containerEl)`
  - `onSwipeProgress` → `indicator.show(direction, progress, ready, canNavigate(...))`, bei `direction === null` → `indicator.hide()`
  - `onSwipeRelease` → `indicator.release(navigiert)`
  - `detachFromWindow` → `indicator.moveTo(document)`
  - `onunload` → `indicator.destroy()`
- **`styles.css`:** Den Block „=== Swipe Indicators ===“ durch `src/SwipeIndicator.draft.css` ersetzen und die Entwurfsdatei löschen. Den Kopfkommentar in `SwipeIndicator.ts` entfernen.
- **Timer (F36):** im Fenster des Events setzen statt im Hauptfenster. Das gilt auch für den Release-Timer im Indikator.
- **Am Gerät prüfen:** helles und dunkles Theme, reduzierte Bewegung, geteilte Ansicht, Pop-out, keine History in Swipe-Richtung.

## Ziel

Das Plugin soll sich beim Wischen wie Safari anfühlen: Es reagiert auf die Geste, löst beim Loslassen aus und lässt sich durch Zurückwischen abbrechen. Es soll nur navigieren, wenn der Swipe auch gemeint war.

## Ausgangslage

Das Plugin liest Scroll-Events (`wheel`) und rechnet daraus eine Swipe-Geste. Daran waren zwei Dinge falsch:

1. **Fingerzustand unbekannt.** Aus `wheel`-Events lässt sich nicht ablesen, ob der Finger aufliegt, angehoben wurde oder die Bewegung nur nachrollt (Momentum). Die Regel „200 ms ohne Events = losgelassen“ lag deshalb in beide Richtungen daneben (F1, F2).
2. **Kontext ignoriert.** Es wurde nicht geprüft, wo der Swipe passiert: Codeblock, Canvas, Modal, Sidebar, welches Pane, welches Fenster (F5–F9).

Daraus ergaben sich die Fehlauslösungen, das späte Navigieren und das zähe Gefühl.

## Vorgehen

- Jeder große Schritt endet mit einer unabhängigen Prüfung durch einen Subagenten (siehe „Arbeitsweise“).
- Reihenfolge der Runde vom 2026-10-15:
  1. Nachbesserungen aus dem Review: Maus-Heuristik (F26), Auswertung, `CLAUDE.md`. **Erledigt**, geprüft per Faktencheck gegen den Chromium-Quellcode.
  2. Phase 2: neue Gesten-Erkennung mit Tests. **In Arbeit**: Das Review fand F29–F38, die meisten sind umgesetzt.
  3. Phase 3: neuer Indikator. **Entwurf**, nicht eingebaut.
  4. Phase 4, soweit ohne Entscheidung möglich: Doku, Versionsprüfung. **Erledigt**.
- Danach am Gerät: Build einspielen, Szenarien aufnehmen, Parameter einstellen, Test-Durchlauf.

## Phasen

### Phase 0: Messen (umgesetzt, Aufnahmen offen)

Werte werden mit echten Aufnahmen eingestellt, nicht geschätzt.

- **Recorder** im Debug-Modus: Befehle „Start gesture recording“ und „Stop gesture recording“, Szenarioauswahl, „● REC“ in der Statusleiste.
- **Trace-Dateien** unter `<vault>/.obsidian/plugins/obsidian-swipe-navigation/traces/`. Sie enthalten rohe Wheel-Events und Marker: Gesture-Start, Achse, Schwelle, Loslassen (mit Grund, Entscheidung und Geschwindigkeit), Gesture-Ende, Navigation, `file-open`.
- **Auswertung** mit `bun run analyze-traces <ordner>`: eine Zeile pro Geste, inklusive Verhältnis `wheelDeltaX / deltaX` (F26).
- **Offene Fragen**, die die Aufnahmen klären sollen:
  - ~~Schickt Chromium beim Abheben ein Event mit `deltaX = 0`?~~ Unter macOS nein (siehe „Grundlagen“). Unter Windows kommt beim Fling-Beginn eventuell ein (0,0)-Event an, das zeigen die Windows-Traces.
  - Wie sieht das Momentum unter macOS wirklich aus? Ist es geometrisch, mit welcher Rate pro Frame und wie lange? Wie sieht dagegen das Abbremsen des Fingers aus? Davon hängen alle Parameter aus Phase 2 ab.
  - Stimmen die Verhältnisse `wheelDeltaX / deltaX` aus dem Chromium-Quellcode auch am Gerät (macOS-Trackpad 3, Windows-Precision-Touchpad 1, Maus-Notch 120 pro Notch)? Davon hängt die Maus-Erkennung ab (F26).
  - Wie unterscheiden sich die Deltas bei 60 und 120 Hz?
  - Wie lang ist die Lücke zwischen vertikalem Momentum und einem direkt folgenden Swipe (F33)?
- **Aufnahmeszenarien:**
  - zurück: langsam, schneller Flick, halten dann loslassen, abbrechen
  - vorwärts
  - vertikal scrollen, scrollen und sofort zurückwischen, diagonal scrollen
  - breiter Codeblock, Canvas
  - Shift+Mausrad, horizontales Mausrad
  - 3-Finger-Swipe

### Phase 1: Schnelle Fixes (umgesetzt, Test am Gerät offen)

- **3-Finger-Modus entfernt.** Obsidian setzt das macOS-`swipe`-Event selbst in `history.back()` und `forward()` um, das Plugin hat doppelt navigiert (F4). Die Einstellungen erklären jetzt die eingebaute macOS-Option.
- **Pro Geste wird einmal am Anfang entschieden**, ob sie navigieren darf (`src/context.ts`). Sie darf es nicht:
  - bei Modifier-Tasten und Mausrad-Notches (F8)
  - außerhalb von Panes im Hauptbereich, also nicht über Modals, Menüs, Sidebars (F6)
  - in Ansichten aus der Liste „Disabled in views“, Standard `canvas, graph, localgraph, excalidraw`
  - solange der Inhalt unter dem Zeiger in Swipe-Richtung noch scrollen kann (F5)
- **Pane unter dem Zeiger:** Es navigiert über seine eigene History, der Indikator sitzt an seinen Rändern (F7, F20).
- **Einstellung** „Reverse swipe direction“ (F13).
- **Pop-out-Fenster** werden unterstützt (F9).
- **Kleinere Fehler:**
  - tote Sperre entfernt (F3)
  - der alte Indikator wird bei einem Richtungswechsel zurückgesetzt (F11)
  - `log()` beachtet den Debug-Modus (F22)
  - Überschriften über `setHeading()` (F23)
- **Nachbesserung F26:** Die Maus-Erkennung hielt Trackpad-Events für Mausrad-Notches, unter macOS bei `deltaX` von ±40 oder ±80, unter Windows bei ±120.
  - Ein Event gilt jetzt nur noch als Notch, wenn `wheelDeltaX` ein 120er-Vielfaches ist und sein Verhältnis zu `deltaX` weder 3 noch 1 ist.
  - Die Regel steht in `src/input.ts` und wird auch von der Auswertung genutzt.

### Phase 2: Neue Gesten-Erkennung (in Arbeit)

Der Kern für das Gefühl. Die Klasse `GestureRecognizer` (`src/GestureRecognizer.ts`) hängt weder vom DOM noch von Obsidian ab und wird mit `{ t, dx, dy }` gefüttert. `main.ts` reicht jedes Wheel-Event weiter, reagiert auf die Callbacks `axis`, `progress`, `release` und `end` und ruft über einen Timer `tick()` auf, damit Pausen erkannt werden.

- **Zustände:**
  - `idle` → `tracking` (Achse noch offen)
  - → `swiping` (horizontal gesperrt) oder `rejected` (vertikal oder Kontext abgelehnt)
  - → `releasing` (Loslassen vorläufig, Anzeige eingefroren)
  - → Entscheidung → `settling` (Momentum wird geschluckt) → `idle`
- **Kontext:** einmal am ersten Event jeder Geste, auch beim vertikalen Scrollen. Eine abgelehnte Geste bleibt bis zu ihrem Ende abgelehnt, auch durch Momentum. Beginnt die Geste vertikal (`deltaX = 0`), lehnt horizontal scrollbarer Inhalt sie derzeit in beide Richtungen ab. Laut Review ist das zu streng (F35, offen).
- **Achse:** nach den ersten 12 px Bewegung festgelegt und beibehalten. Horizontal, wenn |Σdx| ≥ 2 × |Σdy| (F15).
- **Anlauf:** Eine Geste muss schneller werden als 1,2-mal ihr erstes Event (Delta durch die Zeit seit dem vorigen Event), bevor sie wischen kann. Finger starten aus der Ruhe. Übrig gebliebenes oder nach einem Ruckeln zusammengefasstes Momentum wird nie schneller (F34).
- **Weg ab Gesten-Beginn:** Fortschritt = Weg seit Gesten-Beginn / Schwelle (Empfindlichkeit × 3, Standard 150 px). Ein Richtungswechsel über den Startpunkt wird ohne Zurücksetzen verrechnet (F14, F27).
- **„Bereit“ mit Hysterese:** bereit ab 100 %, zurück erst unter 85 %.
- **Loslassen erkennen (v3):**
  - Geschwindigkeit = Weg der letzten 50 ms / Zeit, in px/ms.
  - Momentum wird nur ab 0,12 px/ms am Höchstwert gesucht.
  - Fällt die Geschwindigkeit nach dem Höchstwert auf 80 %, wird der Abfall pro 60-Hz-Frame berechnet. Liegt er zwischen 0,8 und 0,98, friert der Swipe ein (`releasing`). Es kommen keine `progress`-Aufrufe mehr, der Indikator bleibt stehen.
  - Die zweite Stufe (auf 64 %) muss 0,85- bis 2-mal so lange dauern wie die erste. Dann gilt das als Momentum, entschieden wird mit dem eingefrorenen Stand (F1, F30).
  - Andernfalls läuft der Swipe weiter: bei einer Umkehr, einem Wiederanstieg über 1,25 × das Minimum + 0,05 px/ms, einer zu schnellen zweiten Stufe (Finger stoppt) oder einem Abfall, der hängen bleibt.
  - Rückfall: 400 ms ohne Events. Damit löst kurzes Halten mitten im Swipe nicht aus (F2).
- **Entscheidung:** auslösen, wenn „bereit“, oder bei einem Flick. Ein Flick heißt: mindestens 40 % Weg und mindestens 1,5 px/ms, gemessen als schnellste Geschwindigkeit seit dem letzten Richtungswechsel. Ein Flick zurück bricht immer ab.
- **Ruhephase:** Restliches Momentum wird geschluckt, bis 150 ms lang nichts kommt.
  - Zwei Anstiege hintereinander, deutlich über dem langsamsten Momentum, heißen: Die Finger liegen wieder auf. Dann beginnt eine neue Geste und nimmt den Weg seit dem Tiefpunkt mit (F18, F31).
  - Ein einzelner Sprung, etwa zusammengefasste Events nach einem Ruckeln, reicht nicht (F34).
  - Eine Umkehr während der Ruhephase startet keine Geste, solange sie schneller wird. Bremst sie ab, kann die Regel „zwei Anstiege“ trotzdem eine Geste in Gegenrichtung starten (F39, offen).
- **Vertikales Scrollen gibt nach:** Ein klar horizontales Event (≥ 2 px, ≥ 2:1) startet eine neue Geste, wenn davor mindestens 50 ms Pause war oder die vertikale Geschwindigkeit auf höchstens 50 % ihres Höchstwerts gefallen ist (F33).
- **Kein Cooldown** zwischen Gesten (F18).
- **Parameter:** `RECOGNIZER_DEFAULTS` in `src/GestureRecognizer.ts`. Alle Werte sind vorläufig.
- **Tests:** `test/GestureRecognizer.test.ts` arbeitet mit synthetischen Gesten:
  - Fingerstriche nach dem Minimum-Jerk-Profil
  - Abheben in der Bewegung mit geometrischem Momentum
  - ganzzahlige Deltas mit Übertrag wie unter macOS
  - Tempo-Schwankungen
  - 60 und 120 Hz
  - Ruckeln, Timer und die Reihenfolge der Callbacks
  
  `test/replay.test.ts` spielt Traces aus `test/fixtures/traces/` ab und prüft das Ergebnis pro Szenario.

Später: Ab Chromium 151 gibt es `WheelEvent.momentum`, ein echtes Momentum-Signal. Sobald Obsidian eine Electron-Version damit ausliefert (Stand 2026-10-15: Chromium 142), ersetzt es per Feature-Erkennung die Heuristik.

### Phase 3: Gefühl wie in Safari (Entwurf, nicht eingebaut)

Entwurf in `src/SwipeIndicator.ts` und `src/SwipeIndicator.draft.css`, Einbau siehe „Übergabe“.

- Ein Overlay liegt genau über dem gewischten Pane und schneidet daran ab. Darin fährt ein runder Kreis mit Pfeil vom Rand herein. Bis zur Schwelle folgt er dem Finger, danach dämpft er spürbar (F16).
- Sobald „bereit“, ploppt er kurz auf und färbt sich in der Akzentfarbe.
- Ohne History in Swipe-Richtung ist er ausgegraut und fährt kaum herein.
- Updates werden pro Animationsframe gebündelt und schreiben nur CSS-Variablen und `transform`, nie Layout-Eigenschaften. Das Icon wird einmal erzeugt (F21).
- Eine neue Geste übernimmt eine laufende Release-Animation sofort (F17).
- `prefers-reduced-motion`: kein Aufploppen, beim Loslassen nur Ausblenden.
- Optional, nicht in dieser Runde: Inhalt zieht leicht mit, neue Notiz gleitet herein (F19).

### Phase 4: Release (offen)

- **Neue Plugin-ID** ohne „obsidian“, z. B. `trackpad-swipe-navigation` (F24). Das braucht eine Entscheidung von Robert, weil sich der Plugin-Ordner und damit Einstellungen und Trace-Pfad ändern.
- **Doku ist erledigt** (F25): README, DEVELOPMENT.md und DISCLAIMER.md sind aktualisiert, die Manifest-Beschreibung endet mit einem Punkt.
- **Version:**
  - `minAppVersion` 1.0.0 passt. Die neueste genutzte API ist `setActiveLeaf(leaf, params)` aus 0.16.3, die Pop-out-Helfer stammen aus 0.15.x.
  - Beim Release die Version in `manifest.json`, `package.json` und `versions.json` auf 1.1.0 setzen.
- **Testmatrix:**
  - macOS mit 60 und 120 Hz
  - Natural Scrolling an und aus
  - Magic Mouse, Windows-Touchpad, Maus mit Shift+Rad
  - geteilte Ansicht, Pop-out
  - Canvas, Codeblock, Modal
  - Zoom ungleich 100 % (F28)
- **Release:** GitHub-Release mit `main.js`, `manifest.json` und `styles.css`, PR an obsidian-releases, optional ein Demo-GIF.

## Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Werte aus Aufnahmen, nicht geschätzt | Ohne Aufnahmen werden die Werte blind eingestellt. Gilt weiter für alle Parameter. |
| Phase 2 und 3 vor den Aufnahmen bauen (2026-10-15) | Ablauf, Zustände und Tests hängen nicht von den Messwerten ab, nur die Parameter. Die bleiben vorläufig, die Replay-Tests prüfen sie, sobald Traces da sind. |
| 3-Finger-Modus entfernt | Obsidian macht das schon selbst, das Plugin hat doppelt navigiert. Bestätigt im Code von `obsidian.asar` (Obsidian 1.14.4), am Gerät noch nicht. |
| Kontext-Entscheidung einmal pro Geste | Browser machen es mit dem Scroll-Ziel genauso: Wer einen Codeblock scrollt, navigiert nicht mittendrin, auch nicht durch Momentum. |
| Aktivierung über Achsensperre statt Geschwindigkeit | Safari und Chromium starten die Zurück-Geste unabhängig vom Tempo. Vor langsamem horizontalem Scrollen schützt die Kontextprüfung. Langsame, bewusste Swipes funktionieren damit (F14). |
| Loslassen erst vorläufig, dann bestätigt | Ein einzelnes Abbremsen ist kein Beweis für Momentum. Erst eine zweite, gleich lange Stufe bestätigt es. Eine Umkehr oder ein Wiederanstieg setzt den Swipe fort (F29). |
| Gleiche Geschwindigkeitsstufen statt gleicher Zeitfenster | Nahe am Höchstwert bremst auch ein Finger fast mit konstanter Rate, gleich lange Zeitfenster trennen das schlecht (v2). Gleiche Stufen messen, ob das Abbremsen schneller wird. |
| Entscheidung mit dem eingefrorenen, angezeigten Stand | Was der Indikator zeigt, entscheidet (F30). Ein späterer Stand lässt Momentum mitzählen (v2b, F1). |
| Anlauf-Pflicht für neue Gesten | Nach einem Ruckeln oder einem zu früh feuernden Timer darf übrig gebliebenes Momentum keine zweite Navigation auslösen (F34). |
| Umkehr in der Ruhephase startet keine Geste | Sonst navigiert eine Abbruch-Bewegung nach einem falsch erkannten Loslassen in die Gegenrichtung (F29). Noch lückenhaft, siehe F39. |
| Kein Cooldown zwischen Gesten | Eine Geste löst höchstens einmal aus, Momentum wird geschluckt. Ein Cooldown würde nur bewusste zweite Swipes verschlucken (F18). |
| Richtung als Einstellung | Chromium meldet nicht, ob die Deltas durch Natural Scrolling invertiert sind. |
| Maus-Erkennung per Heuristik | `deltaMode` ungleich 0 oder `wheelDeltaX` als 120er-Vielfaches, dessen Verhältnis zu `deltaX` nicht das eines Trackpads ist (F26). Wird mit den Traces geprüft. |

## Risiken

- **Loslassen ohne Aufnahmen eingestellt.** Die synthetischen Modelle von Finger und Momentum können von echten macOS-Daten abweichen. Gleichmäßiges Abbremsen (Verhältnis 0,8) liegt nah an Momentum (1,0). Bei langsamen Swipes (4–5 px pro Event) macht die Rundung auf ganze Pixel die Messung unscharf. Die wichtigsten Aufnahmen dafür: „abbrechen“, „halten, dann loslassen“, „langsam“, „schneller Flick“.
- **Verzögerung beim Navigieren:**
  - Nach dem Abheben mit Momentum navigiert das Plugin erst nach zwei Stufen, bei 0,95 pro Frame etwa 150 ms nach dem Höchstwert.
  - Steht der Finger erst still und hebt dann ohne Momentum ab, wartet es auf den 400-ms-Rückfall.
- **Die Maus-Heuristik** ist auf Chromium-Interna gebaut. Sie verpasst hochauflösende Mäuse und Notches bei einem Seitenzoom ungleich 100 % (bei 110 % meldet Chromium 109 statt 120). Ein horizontales Mausrad kann dann navigieren. Shift+Rad bleibt durch die Modifier-Prüfung abgedeckt.
- **Zoom (F28):** Chromium teilt alle Deltas durch den Seitenzoom. Bei 150 % Zoom braucht ein Swipe 1,5-mal so viel Fingerweg. Ein Ausgleich braucht eine verlässliche Quelle für Obsidians Zoomfaktor.
- **Swipe direkt nach dem Scrollen (F33):** Vertikales Scrollen gibt jetzt nach einer Pause oder nach dem Abbremsen nach. Ein Swipe mitten in schnelles vertikales Momentum hinein wird weiter geschluckt, bis es abgebremst ist.
- **Interne Obsidian-APIs** (`leaf.history`, `app.commands`) sind nicht offiziell dokumentiert. Dafür gibt es den Fallback über die Befehle `app:go-back` und `app:go-forward`.

## Grundlagen

Faktencheck vom 2026-10-15 zur Wheel-Verarbeitung in Chromium, belegt im Chromium-Quellcode (`web_input_event_builders_mac.mm`, `wheel_event.cc`, `web_input_event_builders_win.cc`, `mouse_wheel_event_manager.cc`):

- **`wheelDeltaX`:**
  - macOS-Trackpad: −3 × `deltaX` (40 px pro 120er-Tick)
  - Windows-Precision-Touchpad: −1 × `deltaX`
  - Mausrad-Notches: 120 pro Notch
  - macOS-Trackpad-Deltas sind ganzzahlig.
- **Zoom:** Alle Deltas werden durch `devicePixelRatio` geteilt, und das enthält den Seitenzoom.
- **Momentum und Abheben:** Momentum-Events sind normale Wheel-Events mit demselben Ziel. Das Phase-Ended-Event beim Abheben erreicht JS unter macOS nicht.
- **Zusammenfassen:** Ist der Main-Thread blockiert, fasst Chromium Wheel-Events zu einem zusammen (Summe der Deltas, Zeitstempel des letzten).
- **Latching:** Wheel-Scroll-Latching ist auf allen Desktop-Plattformen aktiv. Eine Geste bleibt beim Scroller, auf dem sie begann, auch durch Momentum. Gewählt wird der erste Vorfahr, der in der Anfangsrichtung scrollen kann.

## Test-Vault

Installiert ist das Plugin im Vault `UnfilteredMe` (OneDrive), `.obsidian/plugins/obsidian-swipe-navigation/`. Dort liegt zusätzlich ein älterer Ordner `swipe-navigation` mit derselben Plugin-ID. Er sollte vor dem Test entfernt werden, sonst ist unklar, welcher Build läuft. Der installierte Build ist vom 2026-03-05, also noch v1.0.

Einspielen: `bun run build`, dann `main.js`, `manifest.json` und `styles.css` in den Plugin-Ordner kopieren und Obsidian neu laden (`Cmd+R`).
