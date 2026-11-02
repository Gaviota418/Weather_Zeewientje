# Installatie

Eén app, twee manieren om hem te draaien. Weg A is het eenvoudigst: alles blijft in je Apps Script-project.

## Weg A – alles in Apps Script (aanbevolen)

1. **Script.** Maak in Apps Script (Google Sheet → Extensies → Apps Script) een bestand `WeatherXM` en plak `apps-script/WeatherXM.gs`. Verwijder oudere versies (bv. `WeatherXM_v04`), anders krijg je "CELL_ID has already been declared".
2. **API-key veilig opslaan.** Projectinstellingen (tandwiel) → Scripteigenschappen → eigenschap `WXM_KEY` = je WeatherXM-key.
3. **Bestanden toevoegen.**
   - `+` → Script → naam `Api` → plak `apps-script/Api.gs`
   - `+` → HTML → naam `Index` → plak `apps-script/Index.html`. Het bestand moet eindigen op `</html>`.
   - Geen andere .gs- of HTML-bestanden laten staan (een tweede `doGet` botst).
4. **Triggers.** Kies de functie `installTriggers` en klik Uitvoeren (eenmalig): meting elk uur, verwachting elke nacht om 04:00.
5. **Publiceren.** Deploy → New deployment → ⚙ Web app → Execute as **Me**, Who has access **Anyone**.
   Met "Only myself" werkt de app slecht als je met meerdere Google-accounts bent ingelogd.
6. **Op tablet/telefoon.** Open de `/exec`-URL → Delen → *Zet op beginscherm*.

## Bijwerken zonder nieuwe link

Maak nooit een nieuwe implementatie: Deploy → Manage deployments → potlood → Version: New version → Deploy.
Veel nieuwe openbare links in korte tijd kunnen een Safari-waarschuwing "schadelijke software" geven (vals alarm).

## Weg B – via GitHub Pages

Vereist Weg A met toegang **Anyone**.

1. Repository → Settings → Pages → Source: *Deploy from a branch* → Branch `main` / `(root)` → Save.
2. Open `https://gaviota418.github.io/Weather_Zeewientje/`.
3. Klap **Instellingen** open, plak je `/exec`-URL → *Opslaan en laden*.
   (Of open de pagina met `?api=<je /exec-URL>` erachter.)
4. Zet de app met eigen icoon op je toestel:
   - **iPad/iPhone:** Safari → Delen → *Zet op beginscherm*.
   - **Mac:** Safari → Archief → *Voeg toe aan Dock*.
5. Open de app vanaf het beginscherm of de Dock en plak de `/exec`-URL nog één keer onder **Instellingen**. Een app op het beginscherm of in de Dock onthoudt zijn eigen instellingen, los van Safari.

## Problemen

- "Scriptfout … EOF": Index niet volledig geplakt of niet opgeslagen, of je opent een oude implementatie.
- "Kon je sheet niet bereiken (…)": de tekst tussen haakjes zegt waarom.
- Groene status maar lege grafiek: geen recente rijen in `Weather_Combined`; voer `runWeatherXM_Hourly` uit.
- Blok "betrouwbaarheid verwachting" blijft leeg: het tabblad `Verwachting_archief` ontbreekt of is leeg.

## Tabbladen in de Sheet

`Weather_Current`, `Weather_Forecast_Hourly`, `Weather_Combined`, `Weather_ChartData`, `Dashboard`, `Verwachting_archief`.
