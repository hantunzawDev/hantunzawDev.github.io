# hzOS

A personal browser home page that behaves like a tiny operating system, at **https://www.hantunzaw.dev/home/**.
It's static files with no build step, served by GitHub Pages. The earlier glass-dashboard version lives at `/home/classic/`.

## Windows

You can drag a window by its title bar, close it with `x`, and reopen it from the menubar or with `open <app>`. Window positions and which windows are open are saved in your browser.

| app | what it does |
|---|---|
| `clock.app` | Dot-matrix clock, greeting, date and week, day and year progress, sunrise and sunset countdown |
| `wx.sh` | Current weather plus 12-hour temperature and rain sparklines, and a plain-language guess for the day (Open-Meteo) |
| `today.cal` | Today's Google Calendar events (read-only) with a live "now" line |
| `todo.txt` | Local tasks. Tasks finished on an earlier day are cleared. |
| `focus.exe` | Focus timer: 25, 50 or 5 minutes, with a chime and a count of sessions today |
| `world.3d` | three.js dotted globe showing your location and the real day/night line |
| `fortune` | Quote of the day. `again` picks another. |
| `feed.rss` | Hacker News, DEV, GitHub (top new repos this week) and Wikipedia news |
| `config.ini` | Name, fallback city, 12h/24h clock, calendar, links |

A boot sequence plays on the first open of each day. Press any key to skip it.

## Command line

Press `/` to focus it. Use ↑/↓ for history and Tab to complete a command.

```
t <task>         add a todo            done <n> / rm <n>   toggle / remove
f [25|50|5]      start focus           pause, reset
news hn|dev|gh|world                   wx, cal, refresh
open|close <app> show / hide a window  layout reset
g|yt|ddg <query> search                gh <query>  GitHub search
<link name>      open a quick link     example.com  open a site
name <x>  city <x>  12h  24h  config  fortune  clear  help
```
Anything that isn't a command is sent to Google search.

## Make it your browser's home page

- **Chrome:** Settings → On startup → Open a specific page → `https://www.hantunzaw.dev/home/`. To use it as the new tab page as well, install a custom new-tab-URL extension such as "New Tab Redirect".
- **Safari:** Settings → General → Homepage, and set "New windows/tabs open with: Homepage".
- **Firefox:** Settings → Home → Custom URLs. **Arc / Edge:** set the same URL as the start page.

## Connect Google Calendar

**Private calendar (recommended):** deploy `worker/ical-proxy.js` as a Cloudflare Worker (free tier). It only accepts Google iCal URLs and only answers requests from this site. In Google Calendar, copy Settings → your calendar → "Secret address in iCal format". Then run `config` and paste that URL as `ical_url`, and `https://<worker>.workers.dev/?url=` as `proxy`.

**Public calendar:** create a Google Calendar API key restricted to `www.hantunzaw.dev/*`, then set `api_key` and `calendar_ids` in `config`.

The iCal reader handles daily, weekly, monthly and yearly repeats, exceptions and edited occurrences. It doesn't handle rules like "second Tuesday of the month".

## Files

`index.html` / `os.css` / `os.js` hold the shell and apps, `data.js` the weather, calendar, feeds and storage, `globe.js` the 3D globe, and `ical.js` the calendar parser.

## Local preview

```bash
python3 -m http.server 8080
```
Then open http://localhost:8080/home/.
