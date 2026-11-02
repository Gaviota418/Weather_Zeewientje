# Weather Zeewientje – meteogram voor de wijngaard

Een meteogram voor het WeatherXM-station op wijngaard Zeewientje. Het toont de metingen van de afgelopen 24 uur en de verwachting voor de komende 48 uur. Daarbij komen agro-signalen: vorst, hittestress, valse en echte meeldauw, botrytis, bladnat, spuit- en snoeivensters, een waterbalans voor jonge aanplant en de betrouwbaarheid van de verwachting.

## Opbouw

| Pad | Wat |
|---|---|
| `apps-script/WeatherXM.gs` | Haalt elk uur de meting en elke nacht de verwachting op bij WeatherXM en schrijft ze naar de Google Sheet |
| `apps-script/Api.gs` | Web-app: serveert de pagina (`/exec`) en de data als JSON (`/exec?format=json`) |
| `apps-script/Index.html` | De app zelf, zoals ze in Apps Script staat (met `<?!= … ?>`-sjabloon voor de eigen URL) |
| `index.html` | Losse kopie van de app voor GitHub Pages (zonder sjabloon; de `/exec`-URL vul je in de app in) |
| `docs/installatie.md` | Installatie- en bijwerkhandleiding |

## Snel starten

1. Maak in je Google Sheet een Apps Script-project met de drie bestanden uit `apps-script/` (`Index.html` als HTML-bestand met de naam `Index`).
2. Projectinstellingen → Scripteigenschappen → `WXM_KEY` = je WeatherXM-API-key.
3. Voer één keer `installTriggers` uit.
4. Deploy als web-app (Execute as **Me**, toegang **Anyone**).

Zie [docs/installatie.md](docs/installatie.md) voor de volledige handleiding, inclusief GitHub Pages.

## Geheimen

De WeatherXM-API-key staat **nooit** in de code. Hij staat alleen in de Scripteigenschappen van het Apps Script-project. Zet hem niet in een commit.

## Let op

De agro-signalen zijn vuistregels om op te letten, geen landbouwadvies.
