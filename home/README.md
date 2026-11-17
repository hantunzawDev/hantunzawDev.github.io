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
| `viz.app` | Three.js audio visualizer (orb / terrain / pulsar). **Parked for now** — flip `VIZ_ENABLED` in `os.js` to bring it back. File kept at `viz.js`. |
| `noise.app` | Ambient sound mixer and internet radio: 58 sounds in 10 categories (rain, nature, café and city, noise colors, binaural beats…) with a category rail, presets and a sleep timer, plus radio stations in vibe groups including a Myanmar group (Padamyar FM, Cherry FM, Mandalay FM, DVB Digital, DWG Radio Burmese, Radio Voice of Burma). Most sounds are recorded clips from [Moodist](https://github.com/remvze/moodist) (MIT code; sounds under the Pixabay Content License or CC0, with redistribution not clearly covered, see [`noise/rec/CREDITS.md`](noise/rec/CREDITS.md)), fetched when first selected. In focus and zen a small player sits at the bottom of the stage. Closed until you open it. The generated music genres (`noise/music.js`, `patterns.js`, `genres/`) no longer belong to noise.app: they only score the bughunt game. |
| `game.exe` | Snake, a typing test and bughunt (a small raycasting shooter) |
| `config.ini` | Name, fallback city, 12h/24h clock, theme, quotes, links |

## Modes

Switch modes from the menubar, with `mode <name>`, or with alt+0 to alt+3. Esc returns to desktop from focus and zen.

- **home:** the first screen. A clock and the command line as a search bar over animated ASCII art that fills the screen. Pick the art under config → home: 734 pieces from the self-hosted [ascii-magic-art](https://www.ascii-magic.com/ascii) library (MIT, in `vendor/ascii-magic-art`), redrawn in any of its character sets, in its own colours or the theme colour. Or bring your own: paste text art (a line of `---` between frames animates it) or turn a picture into halftone cells, all in the browser. `art random` and `art <name>` switch from the command line. Esc clears the bar. Pick another first screen under config → startup → open in.
- **desktop:** all the windows.
- **focus:** only a full-screen pomodoro, showing the task you're working on (`next task` cycles through open todos). Background themes via `bg` (including `bg ascii` for the same animated art as home).
- **zen:** only a big clock, the date and the quote of the day. Same `bg` themes as focus, including `ascii`.

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
noise   noise (play/stop, alt+n) · noise <sound> [0-100] · noise off <sound> · noise <preset> · noise vol <n> · noise save <name> · noise list · radio [station|off] · sleep 30m|off
bg      bg [off|ascii|audio|drift|grid|scan|glow] [focus|zen] · bg orb|terrain|pulsar · bg mic|sys|noise|off · [ ] cycle on stage
system  open|close|max <app> · ls · layout reset · theme <name> · name|city <x> · 12h|24h · history · clear
```

- `= 2^10/4` evaluates math. Only numbers, operators and a few math functions are allowed.
- `pass` and `uuid` copy their result to the clipboard.
- `timer 10m tea` counts down in the menubar and chimes when time is up.
- `matrix` runs until you press a key or click.
- `bg ascii` (focus or zen) shows the same animated ASCII art as home behind the stage; desktop stops it. `bg noise` drives the audio backdrop from whatever noise.app is playing.
- `quote now` shows the current quote and why it was picked.
- `noise deep-work` plays a preset; `noise light-rain 60` adds light rain at 60%; `noise list` shows every sound and preset. Nothing plays until you ask, and your last mix comes back (silent) on reload.
- `noise cafe` plays the café preset; `noise cafe 50` adds just the café layer at 50% (a name that is both a preset and a layer is the preset unless you give a volume). `noise light-rain 0` is the same as `noise off light-rain`.
- `sleep 30m` fades the sound out over the last minute, then stops. `alt+n` plays or stops from anywhere.
- `radio` lists stations; `radio <station>` tunes in and `radio off` stops.
- `viz` is parked: the command prints `viz.app is parked for now.` Flip `VIZ_ENABLED` in `os.js` to restore the visualizer.

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
| `viz.js` | The audio visualizer (parked). Three.js is vendored in `vendor/` (r170, MIT) and loads only when `viz.app` opens with `VIZ_ENABLED`. |
| `backdrop.js` | Focus/zen stage backgrounds: `off`, `ascii` (shared home art), `audio`, `drift`, `grid`, `scan`, `glow`. |
| `map.js` | The world map: coastlines from Natural Earth, cached in the browser after the first load |

## Local preview

```bash
python3 -m http.server 8080
```
Then open http://localhost:8080/home/.
