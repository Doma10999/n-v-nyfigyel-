Növényfigyelő – LED csúszka + UI javítás

Javítások:
1. Bejelentkezésnél jelszó szem ikon.
2. Email értesítés mentése után modern, oldalhoz illő visszajelző.
3. LED csúszka javítás:
   - ha van ledLevel mező, megjeleníti a csúszkát;
   - ha a firmwareVersion LED-es eszközre utal, de ledLevel még hiányzik, létrehozza 0-val;
   - cache-busting verziószám frissítve: firebase-app.js?v=20260624fix1.

Feltöltésnél fontos:
- Ne csak az index.html-t töltsd fel.
- Ezek biztosan változtak:
  index.html
  styles.css
  firebase-app.js
  notifications.js

Ha feltöltés után még nem látszik:
- Ctrl+F5 / gyorsítótár ürítés
- mobilon böngésző cache törlés
- PWA esetén alkalmazás bezárása és újranyitása
