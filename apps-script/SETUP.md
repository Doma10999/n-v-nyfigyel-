# Apps Script beállítás – Növényfigyelő

## 1. Hozz létre egy új Google Táblázatot
Ajánlott külön táblázatot csinálni csak az előfizetésekhez.
Például neve: `Novenyfigyelo Előfizetések`.

## 2. Nyisd meg az Apps Scriptet
Táblázat → Bővítmények → Apps Script

## 3. A teljes `Code.gs` tartalmát másold be
A zipben lévő `apps-script/Code.gs` fájl teljes tartalmát másold be a projekted `Code.gs` fájljába.

## 4. Script Properties
Apps Script → Project Settings → Script properties

Adj hozzá egy új property-t:
- Key: `STRIPE_SECRET_KEY`
- Value: a Stripe **secret key** (sandbox teszthez: `sk_test_...`)

## 5. Töltsd ki a support emailt
A `Code.gs` tetején ezt cseréld ki:
- `ide-ird-a-sajat-email-cimedet@example.com`

## 6. Futtasd le egyszer ezeket kézzel
Ebben a sorrendben:
1. `createSubscriptionsSheet`
2. `setupAllTriggers`

Az első futásnál engedélyt fog kérni. Fogadd el.

## 7. Mit csinál a script?
- `checkPlantsAndSendEmails` → a meglévő 35% alatti növényes email
- `syncStripePayments` → 15 percenként ellenőrzi a Stripe fizetéseket
- `dailyPlanMaintenance` → naponta ellenőrzi a Stripe előfizetést és 5 nappal előtte emailt küld

## 8. Fontos
A mostani Stripe termékeid **előfizetésesek**, ezért a Stripe havi/éves fordulóval automatikusan megújíthatja őket. A script emiatt a Stripe subscription állapotát és a `current_period_end` dátumot szinkronizálja a Firebase-be.

## 9. Firebase szabályok
A script REST API-val írja a Realtime Database-et. Ha a szabályaid ezt tiltják, akkor engedned kell az írást arra az útvonalra, vagy külön admin megoldás kell.
