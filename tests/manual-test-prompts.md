# Manual Test Prompts für gefixte Bugs

Diese Prompts kannst du manuell im VertexAgent testen um zu verifizieren dass die Bugs gefixt sind.

---

## Bug 1: HTML-Artefakte im Chat

### ✅ Test Prompt 1.1: Requirements.txt mit Versionsnummern
```
Erstelle eine requirements.txt mit folgenden Paketen:
- pytest==7.4.3
- alabaster==0.7.12
- altgraph==0.17
- appdirs==1.4.4
```

**Erwartetes Ergebnis:**
- ✅ Chat zeigt sauberen Code ohne `class="tok-number">` oder `class="hl-number">`
- ✅ Versionsnummern werden farbig angezeigt (Syntax-Highlighting)
- ✅ Datei wird korrekt erstellt mit exakten Versionsnummern

**Fehler-Indikator:**
- ❌ Im Chat erscheint: `pytest==class="tok-number">7.4.class="tok-number">3`
- ❌ Im Chat erscheint: `pytest==class="hl-number">7.4.class="hl-number">3`

---

### ✅ Test Prompt 1.2: Python Code mit Zahlen
```
Schreibe eine Python-Funktion die zwei Zahlen addiert:
- Funktion heißt calculate_sum
- Parameter: x und y
- Return: x + y
- Teste mit x=42 und y=3.14
```

**Erwartetes Ergebnis:**
- ✅ Chat zeigt sauberen Python-Code
- ✅ Zahlen (42, 3.14) werden farbig hervorgehoben
- ✅ Keine HTML-Tags als Text sichtbar

**Fehler-Indikator:**
- ❌ Im Chat erscheint: `x = <class="hl-number">42`
- ❌ Zahlen werden nicht farbig angezeigt

---

## Bug 2: Diff-Logik löscht alle Zeilen

### ✅ Test Prompt 2.1: Einzelne Zeile löschen
```
Lösche die Zeile pytest in requirements.txt
```

**Vorbedingung:** requirements.txt existiert mit:
```
pytest==7.4.3
alabaster==0.7.12
altgraph==0.17
appdirs==1.4.4
argh==0.26.2
astroid==2.4.2
```

**Erwartetes Ergebnis:**
- ✅ Nur `pytest==7.4.3` wird gelöscht
- ✅ Alle anderen 5 Zeilen bleiben erhalten
- ✅ Datei hat danach 5 Zeilen (nicht 1 Zeile!)

**Fehler-Indikator:**
- ❌ Datei hat nur noch 1 Zeile (alle außer pytest gelöscht)
- ❌ Datei ist leer

---

### ✅ Test Prompt 2.2: Zeile löschen und neue hinzufügen
```
Lösche pytest==7.4.3 und füge requests==2.31.0 hinzu in requirements.txt
```

**Vorbedingung:** requirements.txt existiert mit mehreren Zeilen

**Erwartetes Ergebnis:**
- ✅ pytest wird entfernt
- ✅ requests wird am Ende hinzugefügt
- ✅ Alle anderen Zeilen bleiben unverändert
- ✅ Keine Duplikate

**Fehler-Indikator:**
- ❌ Alle Zeilen außer requests gelöscht
- ❌ requests wird mehrfach hinzugefügt

---

## Bug 3: DELETE vs. Diff-Format Verwechslung

### ✅ Test Prompt 3.1: Zeile löschen (sollte Diff verwenden)
```
Lösche die zeile pytest in requirements.txt
```

**Erwartetes Ergebnis:**
- ✅ Agent zeigt Diff-Format: `- pytest==7.4.3`
- ✅ Nur die Zeile wird gelöscht, nicht die Datei
- ✅ Datei existiert noch mit anderen Zeilen

**Fehler-Indikator:**
- ❌ Agent zeigt: `rm -rf pytest` oder `DELETE`
- ❌ Ganze Datei wird gelöscht

---

### ✅ Test Prompt 3.2: Datei löschen (sollte DELETE verwenden)
```
Lösche die Datei test.py
```

**Vorbedingung:** test.py existiert

**Erwartetes Ergebnis:**
- ✅ Agent zeigt: ```bash test.py\nDELETE```
- ✅ Datei wird komplett gelöscht
- ✅ Keine Diff-Anzeige

**Fehler-Indikator:**
- ❌ Agent versucht Zeilen zu löschen statt Datei
- ❌ Datei bleibt bestehen

---

## Bug 4: Syntax-Highlighting entfernt Leerzeichen

### ✅ Test Prompt 4.1: Python Funktion (def keyword)
```
Schreibe eine Python-Funktion:
def broken_function(x, y):
    result = x + y
    return result
```

**Erwartetes Ergebnis:**
- ✅ Im Chat wird angezeigt: `def broken_function` (MIT Leerzeichen)
- ✅ `def` ist farbig hervorgehoben (rot/pink)
- ✅ `broken_function` ist normal oder als Funktionsname farbig
- ✅ Leerzeichen zwischen `def` und `broken_function` ist sichtbar

**Fehler-Indikator:**
- ❌ Im Chat erscheint: `defbroken_function` (OHNE Leerzeichen)
- ❌ Keywords kleben an Identifiern

---

### ✅ Test Prompt 4.2: JavaScript Funktion
```
Schreibe eine JavaScript-Funktion:
function calculateTotal(price, tax) {
    const total = price + tax;
    return total;
}
```

**Erwartetes Ergebnis:**
- ✅ `function calculateTotal` mit Leerzeichen
- ✅ `const total` mit Leerzeichen
- ✅ `return total` mit Leerzeichen
- ✅ Alle Keywords sind farbig hervorgehoben
- ✅ Alle Leerzeichen bleiben erhalten

**Fehler-Indikator:**
- ❌ `functioncalculateTotal` (ohne Leerzeichen)
- ❌ `consttotal` (ohne Leerzeichen)
- ❌ `returntotal` (ohne Leerzeichen)

---

## Schnell-Test: Alle Bugs auf einmal

### 🎯 Kombinations-Prompt
```
Erstelle eine requirements.txt mit:
- pytest==7.4.3
- alabaster==0.7.12
- requests==2.31.0

Dann lösche die Zeile pytest und füge numpy==1.24.0 hinzu.

Danach schreibe eine Python-Funktion:
def calculate_average(numbers):
    total = sum(numbers)
    count = len(numbers)
    return total / count
```

**Erwartetes Ergebnis:**
- ✅ requirements.txt wird erstellt mit 3 Zeilen
- ✅ Keine HTML-Artefakte im Chat (keine `class="...">`)
- ✅ pytest wird gelöscht, numpy hinzugefügt
- ✅ Datei hat danach 3 Zeilen (alabaster, requests, numpy)
- ✅ Python-Code zeigt `def calculate_average` mit Leerzeichen
- ✅ Alle Keywords sind farbig, alle Leerzeichen erhalten

**Fehler-Indikatoren:**
- ❌ HTML-Tags als Text sichtbar
- ❌ Alle Zeilen außer numpy gelöscht
- ❌ `defcalculate_average` ohne Leerzeichen

---

## Test-Protokoll

Fülle nach jedem Test aus:

| Test  | Prompt                 | Status | Notizen |
| -------| ------------------------| --------| ---------|
| 1.1   | Requirements.txt       | ❌      |         |
| 1.2   | Python mit Zahlen      | ❌      |         |
| 2.1   | Zeile löschen          | ❌      |         |
| 2.2   | Löschen + Hinzufügen   | ⬜      |         |
| 3.1   | Zeile löschen (Diff)   | ⬜      |         |
| 3.2   | Datei löschen (DELETE) | ⬜      |         |
| 4.1   | Python def             | ❌      |         |
| 4.2   | JavaScript function    | ⬜      |         |
| Kombi | Alle Bugs              | ⬜      |         |

**Legende:**
- ⬜ Nicht getestet
- ✅ Test bestanden
- ❌ Test fehlgeschlagen

---

## Automatische Tests

Vor dem manuellen Test, führe die automatischen Tests aus:

```bash
# Alle Tests
npm test

# Nur Requirement-Tests (Bug-spezifisch)
npm run test:requirements

# Einzelne Tests
node tests/requirements/html-artifacts.test.js
node tests/requirements/delete-command.test.js
node tests/requirements/keyword-spacing-bug.test.js
```

**Alle automatischen Tests sollten bestehen bevor du manuell testest!**
