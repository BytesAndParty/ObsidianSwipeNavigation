# Plan: Swipe Navigation v1.1

Überblick über Ziel, Ursachen, Phasen und Entscheidungen. Die Checkliste mit dem Fortschritt steht in [TODO.md](TODO.md), die Findings sind dort als F1–F25 nummeriert.

Stand: 2026-10-15. Phase 0 und 1 sind umgesetzt, aber noch nicht am Gerät getestet. Phase 2 bis 4 sind offen.

## Ziel

Das Plugin soll sich beim Wischen wie Safari anfühlen: Es reagiert auf die Geste, löst beim Loslassen aus und lässt sich durch Zurückwischen abbrechen. Es soll nur navigieren, wenn der Swipe auch gemeint war.

## Ausgangslage

Das Plugin liest Scroll-Events (`wheel`) und rechnet daraus eine Swipe-Geste. Daran sind zwei Dinge falsch:

1. **Fingerzustand unbekannt.** Aus `wheel`-Events lässt sich nicht ablesen, ob der Finger aufliegt, angehoben wurde oder die Bewegung nur nachrollt (Momentum). Die Regel „200 ms ohne Events = losgelassen“ liegt deshalb in beide Richtungen daneben (F1, F2).
2. **Kontext ignoriert.** Es wurde nicht geprüft, wo der Swipe passiert: Codeblock, Canvas, Modal, Sidebar, welches Pane, welches Fenster (F5–F9).

Daraus ergeben sich die Fehlauslösungen, das späte Navigieren und das zähe Gefühl.

## Phasen

### Phase 0: Messen (umgesetzt, Aufnahmen offen)

Werte werden mit echten Aufnahmen eingestellt, nicht geschätzt.

- **Recorder** im Debug-Modus: Befehle „Start gesture recording“ und „Stop gesture recording“, Szenarioauswahl, „● REC“ in der Statusleiste.
- **Trace-Dateien** unter `<vault>/.obsidian/plugins/obsidian-swipe-navigation/traces/` mit rohen Wheel-Events und Markern (Gesture-Start, Schwelle, Gesture-Ende, Navigation, `file-open`).
- **Auswertung** mit `bun run analyze-traces <ordner>`: eine Zeile pro Geste.
- **Offene Fragen**, die die Aufnahmen klären sollen:
  - Schickt Chromium beim Abheben ein Event mit `deltaX = 0`? Das wäre ein echtes Loslass-Signal.
  - Wie sieht das Momentum aus (Länge, Abnahme pro Event)?
  - Beginnt eine Trackpad-Geste je mit einem 120er-Vielfachen bei `wheelDeltaX`? Das prüft die Maus-Erkennung.
  - Wie unterscheiden sich die Deltas bei 60 und 120 Hz?
- **Aufnahmeszenarien:** langsam zurück, schneller Flick, halten dann loslassen, abbrechen, vorwärts, vertikal scrollen, diagonal scrollen, breiter Codeblock, Canvas, Shift+Mausrad, horizontales Mausrad, 3-Finger-Swipe.

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

### Phase 2: Neue Gesten-Erkennung (offen)

Der Kern für das Gefühl. Als eigene Klasse ohne DOM-Abhängigkeit, getestet mit den aufgenommenen Traces (`bun test`).

- Zustände: wartet, beobachtet, wischt (Achse gesperrt) oder abgelehnt, auslösen oder abbrechen, Ruhephase.
- Achse nach den ersten 10 bis 20 px festlegen und beibehalten (F15).
- Aktivierung über Geschwindigkeit in px/ms ab Gesten-Beginn statt über ein einzelnes Event, damit die Bildwiederholrate keine Rolle spielt (F14).
- Momentum erkennen (gleichmäßig abnehmende Deltas) und als „Finger weg“ werten. Das restliche Nachrollen wird geschluckt (F1).
- Ein schneller Flick navigiert auch unter der Distanz-Schwelle, wie unter iOS.
- Der Idle-Timeout bleibt nur als Rückfall, mit Wert aus den Messungen (F2).
- Der Cooldown gilt nur noch innerhalb einer Geste, ein bewusster zweiter Swipe navigiert (F18).

### Phase 3: Gefühl wie in Safari (offen)

- Runder Indikator mit Pfeil, der mit dem Finger hereinfährt und spürbar dämpft (F16).
- Aufploppen und Einfärben an der Schwelle, mit Hysterese: bereit ab 100 %, zurück erst unter etwa 85 %.
- Ohne Verlauf ausgegraut und mit starkem Widerstand.
- CSS-Variablen und `transform`, Updates pro Animationsframe gebündelt, Pfeil-Element gecacht (F17, F21).
- Optional: Inhalt zieht leicht mit, neue Notiz gleitet herein (F19). `prefers-reduced-motion` wird respektiert.

### Phase 4: Release (offen)

- Neue Plugin-ID ohne „obsidian“, z. B. `trackpad-swipe-navigation` (F24).
- README, Manifest und `CLAUDE.md` aktualisieren (F25).
- Version, `versions.json` und `minAppVersion` prüfen.
- Testmatrix: macOS mit 60 und 120 Hz, Natural Scrolling an und aus, Magic Mouse, Windows-Touchpad, Maus mit Shift+Rad, geteilte Ansicht, Pop-out, Canvas, Codeblock, Modal.
- GitHub-Release mit `main.js`, `manifest.json`, `styles.css`, PR an obsidian-releases, optional Demo-GIF.

## Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Phase 0 vor Phase 2 | Ohne Aufnahmen werden die Werte blind eingestellt. |
| 3-Finger-Modus entfernt | Obsidian macht das schon selbst, das Plugin hat doppelt navigiert. Bestätigt im Code von `obsidian.asar` (Obsidian 1.14.4), am Gerät noch nicht. |
| Kontext-Entscheidung einmal pro Geste | Wie Browser es mit dem Scroll-Ziel machen: Wer einen Codeblock scrollt, navigiert nicht mittendrin, auch nicht durch Momentum. |
| Richtung als Einstellung | Chromium meldet nicht, ob die Deltas durch Natural Scrolling invertiert sind. |
| Maus-Erkennung per Heuristik | `deltaMode` ungleich 0 oder `wheelDeltaX` als Vielfaches von 120. Wird mit den Traces geprüft. |

## Risiken

- **Die Maus-Heuristik** könnte echte Trackpad-Gesten ablehnen, wenn deren erster Wert zufällig ein 120er-Vielfaches ist. Die Traces zeigen, ob das vorkommt.
- **Momentum-Erkennung** hängt von macOS und Windows ab und kann sich zwischen Geräten unterscheiden. Deshalb Traces von beiden Systemen.
- **Interne Obsidian-APIs** (`leaf.history`, `app.commands`) sind nicht offiziell dokumentiert. Dafür gibt es den Fallback über die Befehle `app:go-back` und `app:go-forward`.

## Nächster Schritt

Build in einen Test-Vault einspielen, die Szenarien aus Phase 0 aufnehmen und den Test-Durchlauf aus Phase 1 machen. Danach beginnt Phase 2 auf Basis der Aufnahmen.
