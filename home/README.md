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
| `world.3d` | three.js dotted globe showing your location and the real day/night line |
| `fortune` | Quote of the day. `again` picks another. |
| `feed.rss` | Hacker News, DEV, GitHub (top new repos this week) and Wikipedia news |
| `game.exe` | Snake and a typing test |
| `config.ini` | Name, fallback city, 12h/24h clock, theme, links |

## Modes

Switch modes from the menubar or with `mode <name>`. Esc returns to desktop.

- **desktop:** all the windows.
- **focus:** only a full-screen pomodoro, showing the task you're working on (`next task` cycles through open todos).
- **zen:** only a big clock, the date and the quote of the day.

## Themes

`theme lime` (default), `theme amber`, `theme ice`, or `theme paper` (light). All text meets WCAG AA contrast (4.5:1 or better).

## Command line

Press `/` to focus it. ↑/↓ steps through history and Tab completes commands, app names, themes and modes. `help` lists everything; `help <topic>` shows one group. Anything that isn't a command goes to Google search.

```
todo    t <task> · done <n> · rm <n> · note <text> · cat todo.txt|notes.md
focus   f [min] · pause · reset · mode desktop|focus|zen · timer 10m [label] · timers
info    wx · news hn|dev|gh|world · define <word> · wiki <topic> · date · uptime
tools   = <math> · pass [len] · uuid · b64 <text> · unb64 <text> · g|yt|ddg|gh <query> · <link name>
fun     neofetch · cowsay <text> · fortune · joke · 8ball <q> · roll [2d6] · flip · hack · sl · matrix · coffee
games   snake · type · guess
system  open|close|max <app> · ls · layout reset · theme <name> · name|city <x> · 12h|24h · history · clear
```

- `= 2^10/4` evaluates math. Only numbers, operators and a few math functions are allowed.
- `pass` and `uuid` copy their result to the clipboard.
- `timer 10m tea` counts down in the menubar and chimes when time is up.
- `matrix` runs until you press a key or click.

## Make it your browser's home page

- **Chrome:** Settings → On startup → Open a specific page → `https://www.hantunzaw.dev/home/`. To use it as the new tab page as well, install a custom new-tab-URL extension such as "New Tab Redirect".
- **Safari:** Settings → General → Homepage, and set "New windows/tabs open with: Homepage".
- **Firefox:** Settings → Home → Custom URLs. **Arc / Edge:** set the same URL as the start page.

## Files

| file | contents |
|---|---|
| `index.html`, `os.css`, `os.js` | The shell: window manager, modes, apps and command line |
| `data.js` | Weather, feeds, quotes and storage |
| `games.js` | Snake and the typing test |
| `fun.js` | cowsay, neofetch, 8ball, the matrix screen and the calculator |
| `globe.js` | The 3D globe |

## Local preview

```bash
python3 -m http.server 8080
```
Then open http://localhost:8080/home/.
