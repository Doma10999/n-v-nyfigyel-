# Növényfigyelő – Stripe + Google Sheet + Apps Script beállítás

## 1. A ZIP csomag webes része
A módosított weboldalban már benne van:
- Free / Plus logika
- új pénzes menü gomb
- külön `payment.html` fizetési oldal
- `payment-success.html` visszairányítási oldal

## 2. Stripe Payment Linkek létrehozása
Készíts 2 külön Payment Linket:
- havi Plus – 390 Ft
- éves Plus – 3000 Ft

Mindkét linknél:
- használj saját sikeres visszairányítási oldalt:
  - `https://A-TE-DOMAINED/payment-success.html`
- adj hozzá egy **kötelező custom fieldet**
  - key: `uid`
  - label: `Firebase UID`

## 3. payment.js
A `payment.js` fájlban cseréld le ezt a 2 linket:
- `IDE_IRD_LINKET_CSERELD`
- `EVES_IRD_LINKET_CSERELD`

## 4. Google Sheet
1. Hozz létre egy új Google Sheetet
2. Extensions / Apps Script
3. Másold be a `Code.gs` tartalmát
4. Futtasd le egyszer a `createSetupSheet()` függvényt
5. Állítsd be a Script Properties-ben:
   - `STRIPE_SECRET_KEY` = a Stripe titkos kulcsod

## 5. Code.gs
A `SETTINGS.PAYMENT_LINKS` részben írd át:
- `plink_HAVI_LINK_ID`
- `plink_EVES_LINK_ID`

Itt nem a teljes URL kell, hanem a Stripe Payment Link ID.

## 6. Triggerek
Futtasd le egyszer:
- `createProjectTriggers()`

Ez létrehozza:
- `syncStripePayments()` → 15 percenként
- `dailyPlanMaintenance()` → naponta egyszer

## 7. Firebase
A script Realtime Database REST írást használ.
Ha a jelenlegi Firebase Rules ezt nem engedi, akkor ezt külön nyitni kell a scripthez.

A weboldal a következő mezőt használja:
- `users/{uid}/subscription/plan`
- `users/{uid}/subscription/status`
- `users/{uid}/subscription/expiresAt`

## 8. Mire figyelj
A sikeres fizetés utáni oldal csak visszajelzés.
A valódi aktiválást a háttérben futó Apps Script végzi el.
