# VertexAgent Test-Suite

Kuratierte Test-Befehle für alle Agent-Komponenten.

## 1. LoopEngine Stress-Test

### Test 1.1: Multi-Iteration Loop
```
Erstelle eine TypeScript-Funktion calculateFibonacci in src/test/fibonacci.ts, die die Fibonacci-Folge berechnet. Füge dann Unit-Tests hinzu und optimiere die Performance.
```
**Erwartet:** 3-4 Iterationen, automatische Test-Erstellung, Performance-Optimierung

### Test 1.2: Error-Fix Loop
```
Erstelle eine Python-Datei src/test/broken.py mit einer Funktion die absichtlich einen TypeError wirft. Der Agent soll den Fehler erkennen und automatisch beheben.
```
**Erwartet:** 2-3 Iterationen, automatische Fehlererkennung, selbstständige Behebung

### Test 1.3: Refactor Loop
```
Erstelle eine komplexe JavaScript-Funktion src/test/messy.js mit verschachtelten if-else Blöcken. Refactore sie dann nach Clean Code Prinzipien.
```
**Erwartet:** 2-3 Iterationen, Code-Verbesserung, SOLID-Prinzipien

---

## 2. FileEditEngine Maximal-Test

### Test 2.1: Multiple Files
```
Erstelle ein komplettes Express.js REST API mit folgenden Dateien:
- src/api/server.ts (Express Server)
- src/api/routes/users.ts (User Routes)
- src/api/controllers/userController.ts (Controller)
- src/api/models/user.ts (User Model)
- src/api/middleware/auth.ts (Auth Middleware)
```
**Erwartet:** 5 Dateien gleichzeitig, korrekte Ordnerstruktur, funktionierende Imports

### Test 2.2: Large File
```
Erstelle eine TypeScript-Datei src/test/large.ts mit 50+ Funktionen für String-Manipulation (trim, uppercase, lowercase, reverse, etc.)
```
**Erwartet:** Große Datei (>500 Zeilen), alle Funktionen funktionsfähig

### Test 2.3: Binary/Special Files
```
Erstelle eine JSON-Konfigurationsdatei config/settings.json mit verschachtelten Objekten und Arrays. Füge dann eine .env.example Datei hinzu.
```
**Erwartet:** Korrekte JSON-Syntax, verschiedene Dateitypen

---

## 3. ContextBuilder Logik-Test

### Test 3.1: Workspace Analysis
```
Analysiere die aktuelle Projektstruktur und erstelle eine README.md die alle Komponenten dokumentiert.
```
**Erwartet:** Korrekte Analyse von src/, out/, package.json

### Test 3.2: Dependency Detection
```
Erstelle eine neue Funktion die axios verwendet. Der Agent soll erkennen ob axios installiert ist und ggf. darauf hinweisen.
```
**Erwartet:** Dependency-Check, Hinweis auf fehlende Packages

### Test 3.3: File Reference
```
Erstelle eine neue Datei src/test/importer.ts die Funktionen aus src/agent/loopEngine.ts importiert und verwendet.
```
**Erwartet:** Korrekte Import-Pfade, Typ-Sicherheit

---

## 4. ErrorAnalyzer Pfad-Test

### Test 4.1: Syntax Error
```
Erstelle eine TypeScript-Datei src/test/syntax-error.ts mit absichtlichen Syntax-Fehlern (fehlende Klammern, Semikolons).
```
**Erwartet:** Sofortige Fehlererkennung, automatische Behebung

### Test 4.2: Type Error
```
Erstelle eine Funktion die einen string erwartet aber number erhält. Der Agent soll den Type-Error erkennen und beheben.
```
**Erwartet:** TypeScript-Fehler erkannt, Type-Annotations korrigiert

### Test 4.3: Import Error
```
Erstelle eine Datei die ein nicht-existierendes Modul importiert. Der Agent soll den Fehler erkennen und korrigieren.
```
**Erwartet:** Import-Fehler erkannt, korrekter Import-Pfad

---

## 5. AI-Antwortstruktur Test

### Test 5.1: Code-Block Format
```
Erstelle 3 verschiedene Dateien in einem Request: Python, TypeScript, JSON
```
**Erwartet:** 3 separate Code-Blöcke mit korrekten Dateipfaden

### Test 5.2: Implementation Notes
```
Erstelle eine komplexe Algorithmus-Funktion und erkläre die Implementierung.
```
**Erwartet:** Code + detaillierte Implementierungs-Notizen

### Test 5.3: Memory Notes
```
Erstelle eine Funktion und merke dir wichtige Design-Entscheidungen für spätere Verwendung.
```
**Erwartet:** memoryNotes im Response, spätere Verwendung

---

## 6. Workspace-Safety Test

### Test 6.1: Relative Paths
```
Erstelle Dateien mit verschiedenen Pfad-Tiefen: src/a.ts, src/deep/b.ts, src/very/deep/nested/c.ts
```
**Erwartet:** Nur relative Pfade, keine absoluten Pfade

### Test 6.2: Overwrite Protection
```
Versuche eine existierende Datei zu überschreiben (z.B. package.json)
```
**Erwartet:** Warnung oder Ablehnung, keine ungewollte Überschreibung

### Test 6.3: Outside Workspace
```
Versuche eine Datei außerhalb des Workspace zu erstellen (/tmp/test.txt)
```
**Erwartet:** Ablehnung, nur Workspace-Dateien erlaubt

---

## 7. Autoloop-Funktion Test

### Test 7.1: Continue Flag
```
Erstelle eine Funktion die mehrere Schritte benötigt. Der Agent soll "continue": true setzen.
```
**Erwartet:** Mehrere Iterationen, continue-Flag korrekt gesetzt

### Test 7.2: Max Iterations
```
Gib eine sehr komplexe Aufgabe die mehr als 10 Iterationen benötigen würde.
```
**Erwartet:** Stop bei maxIterations, Fehler-Meldung

### Test 7.3: Early Exit
```
Erstelle eine einfache Funktion die sofort funktioniert.
```
**Erwartet:** 1 Iteration, sofortiger Success

---

## 8. Token-Usage Sichtbarkeit

### Test 8.1: Token Display
```
Stelle eine einfache Frage und beobachte die Token-Anzeige.
```
**Erwartet:** Token-Count im UI sichtbar, aktualisiert nach Response

### Test 8.2: Large Response
```
Erstelle eine sehr große Datei mit vielen Funktionen.
```
**Erwartet:** Hoher Token-Count, korrekt angezeigt

### Test 8.3: Multiple Requests
```
Stelle mehrere Requests hintereinander und beobachte Token-Akkumulation.
```
**Erwartet:** Token-Count pro Request, nicht kumulativ

---

## Erwartete Ergebnisse

### LoopEngine
- ✓ Mehrere Iterationen funktionieren
- ✓ Fehler werden automatisch erkannt
- ✓ Fixes werden automatisch angewendet
- ✓ Loop stoppt bei Success oder maxIterations

### FileEditEngine
- ✓ Multiple Dateien gleichzeitig
- ✓ Korrekte Ordnerstruktur
- ✓ Große Dateien (>500 Zeilen)
- ✓ Verschiedene Dateitypen

### ContextBuilder
- ✓ Workspace korrekt analysiert
- ✓ Dependencies erkannt
- ✓ File-Referenzen korrekt

### ErrorAnalyzer
- ✓ Syntax-Fehler erkannt
- ✓ Type-Fehler erkannt
- ✓ Import-Fehler erkannt
- ✓ VS Code Diagnostics integriert

### AI-Antwortstruktur
- ✓ Code-Blöcke korrekt formatiert
- ✓ Dateipfade vorhanden
- ✓ Implementation Notes vorhanden
- ✓ Memory Notes bei Bedarf

### Workspace-Safety
- ✓ Nur relative Pfade
- ✓ Nur Workspace-Dateien
- ✓ Keine ungewollten Überschreibungen

### Autoloop
- ✓ Continue-Flag funktioniert
- ✓ Max-Iterations-Limit greift
- ✓ Early Exit bei Success

### Token-Usage
- ✓ Anzeige im UI
- ✓ Korrekte Werte
- ✓ Pro Request, nicht kumulativ

---

## Manuelle Test-Durchführung

1. Starte VS Code Extension (F5)
2. Öffne VertexAgent Chat (Cmd+Shift+P → "VertexAgent: Open Chat")
3. Führe Tests nacheinander aus
4. Beobachte:
   - Chat-Antworten
   - Datei-Erstellung im Explorer
   - Token-Anzeige
   - Fehler-Meldungen
   - Loop-Iterationen

## Erfolgs-Kriterien

- [ ] Alle 8 Kategorien getestet
- [ ] Mindestens 80% der Tests erfolgreich
- [ ] Keine kritischen Fehler
- [ ] UI funktioniert korrekt
- [ ] Performance akzeptabel (<5s pro Iteration)
