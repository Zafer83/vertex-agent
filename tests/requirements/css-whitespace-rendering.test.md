# CSS Whitespace Rendering Test

## Problem

User sieht:
```
def
calculate_sum
```

Statt:
```
def calculate_sum
```

## HTML (vom User gezeigt)

```html
<div class="code-line">
  <span class="tok-keyword">def</span> 
  <span class="tok-fn">test_calculate_average_normal_case</span>():
</div>
```

**Das Leerzeichen ist DA!** (zwischen `</span>` und `<span>`)

## CSS (aktuell)

```css
.message.agent .code-line {
  white-space: pre;
}
.message.agent .code-line .tok-keyword { color: #ff7b72; }
.message.agent .code-line .tok-fn { color: #d2a8ff; }
```

## Problem-Diagnose

`white-space: pre` sollte Leerzeichen anzeigen, aber:

1. **Browser-Bug:** Manche Browser ignorieren Leerzeichen zwischen inline-Elementen
2. **Font-Rendering:** Leerzeichen könnte zu schmal sein
3. **Line-Breaking:** Browser könnte Zeilenumbruch nach `</span>` machen

## Lösung

### Option 1: Explizites `&nbsp;` statt Leerzeichen

Im JavaScript:
```javascript
return '<span class="tok-keyword">' + match + '</span>&nbsp;';
```

### Option 2: CSS Fix - Display Inline-Block

```css
.message.agent .code-line .tok-keyword,
.message.agent .code-line .tok-fn,
.message.agent .code-line .tok-string,
.message.agent .code-line .tok-number {
  display: inline;
  white-space: pre;
}
```

### Option 3: Kein Zeilenumbruch im HTML

Stelle sicher dass `highlightCodeLine()` keine Newlines einfügt.

## Test

Erstelle eine HTML-Datei und öffne sie im Browser:

```html
<!DOCTYPE html>
<html>
<head>
<style>
.code-line {
  white-space: pre;
  font-family: monospace;
}
.tok-keyword { color: #ff7b72; }
.tok-fn { color: #d2a8ff; }
</style>
</head>
<body>

<h3>Test 1: Normal (sollte funktionieren)</h3>
<div class="code-line"><span class="tok-keyword">def</span> <span class="tok-fn">calculate_sum</span>()</div>

<h3>Test 2: Mit Newline im HTML (Bug)</h3>
<div class="code-line"><span class="tok-keyword">def</span>
<span class="tok-fn">calculate_sum</span>()</div>

<h3>Test 3: Mit &nbsp;</h3>
<div class="code-line"><span class="tok-keyword">def</span>&nbsp;<span class="tok-fn">calculate_sum</span>()</div>

</body>
</html>
```

Wenn Test 1 ein Newline zeigt → Browser-Bug
Wenn Test 1 funktioniert → Problem ist im generierten HTML
