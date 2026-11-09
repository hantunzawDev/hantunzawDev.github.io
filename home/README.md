# hzOS

A personal browser home page that behaves like a tiny operating system, at **https://www.hantunzaw.dev/home/**.
It's static files with no build step, served by GitHub Pages. The earlier glass-dashboard version lives at `/home/classic/`.

## Windows

Drag a window by its title bar, resize it from the bottom-right corner, and double-click the title bar to maximize it. Close a window with `x` and reopen it from the menubar or with `open <app>`. Positions, sizes and which windows are open are saved in your browser.

| app | what it does |
|---|---|
| `clock.app` | Dot-matrix clock, greeting, date and week, day and year progress, sunrise and sunset countdown |
| `wx.sh` | Current weather plus 12-hour temperature and rain sparklines, and a plain-language guess for the day (Open-Meteo) |
| `todo.txt` | Local tasks. Tasks finished on an earlier day are cleared. |
| `notes.md` | Scratchpad, saved as you type |
| `focus.exe` | Pomodoro timer: 25, 50 or 5 minutes, with a chime and a count of sessions today |
| `world.map` | Dot-matrix world map with your location, the live day/night line and where the sun is overhead |
| `fortune` | A quote picked for the time and day, with a hint like "morning · monday". `again` picks another. |
| `feed.rss` | Hacker News, DEV, GitHub (top new repos this week) and Wikipedia news |
| `viz.app` | Three.js audio visualizer: orb (particle sphere), terrain (scrolling spectrogram landscape) or pulsar (stacked ridgelines), with bloom, driven by your mic or by shared tab/system audio (Chrome/Edge). Closed until you open it. |
| `game.exe` | Snake, a typing test and bughunt (a small raycasting shooter) |
| `config.ini` | Name, fallback city, 12h/24h clock, theme, quotes, links |

## Modes

Switch modes from the menubar or with `mode <name>`. Esc returns to desktop.

- **desktop:** all the windows.
- **focus:** only a full-screen pomodoro, showing the task you're working on (`next task` cycles through open todos).
- **zen:** only a big clock, the date and the quote of the day.

## Quotes

The fortune window and zen mode share one picker. Set it up in `config.ini` → `[quotes]` or with `quote` commands.

- **Packs:** `dev`, `stoic`, `motivation` and `rest`, each on or off.
- **Your own quotes:** one per line, as `text -- author @tags`. Lines starting with `#` are ignored.
- **Rotation:** every visit, every 30 min, hourly (default) or daily. Within a slot the quote stays the same; `again` shuffles it.
- **Time and day matching:** when on, a quote tagged for right now is picked about 70% of the time, and a general (untagged) quote the rest. Quotes tagged for another time never show.

Tags:

| group | tags |
|---|---|
| time of day | `@morning` (5–12h) `@afternoon` (12–17h) `@evening` (17–22h) `@night` (22–5h) |
| day | `@mon` … `@sun`, `@weekday`, `@weekend` |
| date | `@12-25` (month-day) |
| hours | `@9-12h` (`@22-6h` wraps past midnight) |

Tags in the same group mean "or", different groups mean "and". `Ship it. -- Me @fri @evening` shows on Friday evenings; `Rest. -- Me @sat @sun` shows on either weekend day.

## Themes

`theme lime` (default), `theme amber`, `theme ice`, `theme purple`, or `theme paper` (light). All text meets WCAG AA contrast (4.5:1 or better).

## Command line

Press `/` to focus it. ↑/↓ steps through history and Tab completes commands, app names, themes and modes. `help` lists everything; `help <topic>` shows one group. Anything that isn't a command goes to Google search.

```
todo    t <task> · done <n> · rm <n> · note <text> · cat todo.txt|notes.md
focus   f [min] · pause · reset · mode desktop|focus|zen · timer 10m [label] · timers
info    wx · news hn|dev|gh|world · define <word> · wiki <topic> · date · uptime
tools   = <math> · pass [len] · uuid · b64 <text> · unb64 <text> · g|yt|ddg|gh <query> · <link name>
quotes  quote [now] · quote add <text> -- <author> @tags · quote ls · quote rm <n> · quote rotate visit|30m|hourly|daily · quote pack <name> on|off · quote match on|off · quote tags
fun     neofetch · cowsay <text> · fortune · joke · 8ball <q> · roll [2d6] · flip · hack · sl · matrix · coffee
games   snake · type · guess · fps
audio   viz [mic|sys|off] · viz orb|terrain|pulsar
system  open|close|max <app> · ls · layout reset · theme <name> · name|city <x> · 12h|24h · history · clear
```

- `= 2^10/4` evaluates math. Only numbers, operators and a few math functions are allowed.
- `pass` and `uuid` copy their result to the clipboard.
- `timer 10m tea` counts down in the menubar and chimes when time is up.
- `matrix` runs until you press a key or click.
- `viz sys` asks to share a tab or screen: tick "share audio". Video is dropped right away; nothing is recorded or sent anywhere. Safari and Firefox can only use `viz mic`.
- `quote now` shows the current quote and why it was picked.

## Make it your browser's home page

- **Chrome:** Settings → On startup → Open a specific page → `https://www.hantunzaw.dev/home/`. To use it as the new tab page as well, install a custom new-tab-URL extension such as "New Tab Redirect".
- **Safari:** Settings → General → Homepage, and set "New windows/tabs open with: Homepage".
- **Firefox:** Settings → Home → Custom URLs. **Arc / Edge:** set the same URL as the start page.

## Files

| file | contents |
|---|---|
| `index.html`, `os.css`, `os.js` | The shell: window manager, modes, apps and command line |
| `data.js` | Weather, feeds, settings and storage |
| `quotes.js` | Quote packs, tag matching and the rotation picker |
| `games.js` | Snake and the typing test |
| `fun.js` | cowsay, neofetch, 8ball, the matrix screen and the calculator |
| `viz.js` | The audio visualizer. Three.js is vendored in `vendor/` (r170, MIT) and loaded only when `viz.app` opens. |
| `map.js` | The world map: coastlines from Natural Earth, cached in the browser after the first load |

## Local preview

```bash
python3 -m http.server 8080
```
Then open http://localhost:8080/home/.
