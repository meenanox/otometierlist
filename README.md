# Tier List Studio

Character tier-list and Venn-diagram builder for otome / joseimuke fans. Pulls characters from [KoiLog](https://koilog.moe) and [VNDB](https://vndb.org).

## Download (easiest)
**[Download otometierlist.zip](https://github.com/meenanox/otometierlist/raw/main/otometierlist.zip)**, unzip it, and follow `HOW TO USE.txt` inside the `otometierlist` folder.
You need [Python 3](https://www.python.org/downloads/) installed once (free; on Windows tick "Add python.exe to PATH").

**Start:** double-click `start-tierlist.bat` (Windows) or run `./start-tierlist.sh` (Mac / Linux). It opens http://localhost:9100. No other packages needed.

Maintainers: run `python make_zip.py` after changing the app and commit the refreshed zip.

## Import
- **KoiLog user:** username or profile link (`koilog.moe/u/yourname`). Reads your games, route statuses and character ratings. Profile must be public.
- **VNDB:** VN ids (`v17, v2002`) or a VNDB username / user id.
- **Search by name:** KoiLog games, VNDB games, VNDB characters.

## Four modes
- **Tier list:** drag characters onto ranks, or **double-click** a character and pick the rank from the menu (also works in Venn and axis modes; the menu also has Back to pool, Mark as heroine and Remove). **Auto-rank by rating** uses your KoiLog character ratings.
- **Axis chart:** a cross chart (like an alignment chart). Drag characters anywhere on it. Set the four end labels, grid size (or none), square or wide shape, optional numbered scale, snap-to-grid, axis/grid colours and corner labels. **Auto-plot from ratings** puts personality left to right and looks bottom to top.
- **Awards:** an awards ceremony with a podium (1st, 2nd, 3rd) for each award, plus a one-line blurb for why each won. Choose awards from a list (characters, routes, overall; or for games), add a pack (Classic, Chaos, Cry-fest), or type your own, like "Saddest route". Drag characters onto the podium, or double-click one and pick an award and place. The same character can win many awards. **Auto-nominate from ratings** fills Best design, Best voice acting, Best personality, Best writing and Favourite overall from your KoiLog ratings (Best overall from your VNDB votes for games). Export has its own medal layout in all 8 styles and 17 sizes, with a **Designs…** picker (winner topper: crown, tiara, laurel wreath, star, heart or cherry blossom; place buttons: holo, bubble, metallic, simple, glowing or pixel; what sits under the button: podium steps, a **square plaque**, or the **button only** with no plaque; and where a game's cover sits: top, middle or bottom of the left or right side) and an **Award finish** choice: Gala (glowing winner frames, spotlight beam, sparkles and a crown), Glow, Metallic (shiny podium steps) or Flat.
  - **Game awards** (the switch at the top of Awards): pick one game and only its characters get awards, with the game's cover beside them, e.g. "OLYMPIA SOIREE AWARDS" with Best arc, Saddest arc, Hottest character. Each game keeps its own awards and podiums; ◀ ▶ flips through your games. Characters who appear in several games (sequels, fandiscs) are in each of them. Each game's page shows how much of its cast you have and can add the rest in one click (**Add the missing** / **Add side characters too**), so you don't need to re-import. You can also start from the **Games** side: choose **Give awards to the characters of…** and pick a game, and you're taken to its characters.
- **Rank match:** tick the games you want (or none for everyone), press **Start ranking**, and choose between two characters at a time: *Like a lot more, Like more, About the same, Like a little less, Like a lot less* (about how you feel about the left one), or **No opinion**. The keys 1 to 5 answer, 0 is No opinion, and Backspace or Z undoes. A merge sort picks the questions, so a list of 100 takes roughly 600. Progress is saved as you go, so you can **Save and leave** and **Resume** later. When it's done you get a full ranking with a score out of 10, and **Place in my tier list** spreads it over your ranks. Characters only (not the Games list).
- **Spectrum, Radar and Alignment (Scales):** rate routes (a character in a game) on opposite-ended scales, starting with **Fluff ↔ Serious** and **Cute ↔ Spice**. Add, rename and delete your own scales under **Scales**. Scores run 0 to 10 in half steps (3.5 / 10), with the right-hand word as the high end. Pick a route in the list, then **click or drag on the chart** (the number shows as you drag), or use the sliders for exact scores. One set of ratings feeds all three charts:
  - **Spectrum:** one scale as a line, with route cards sitting at their scores.
  - **Radar:** one spoke per scale (3 to 8 scales); overlay up to 4 routes to compare them.
  - **Alignment:** two scales make a 3×3 grid. Name all nine cells, change where Low / Middle / High start, click a cell to put the picked route there or drag cards between cells.
  - The route list can show **all games, one game or several games**, and **Completed routes only** (KoiLog route status, or tick the ✓ yourself). Export works for all three in the 8 styles and 17 sizes. Scales are for characters, not the Games list.
- **Venn diagram:** 2 or 3 circles with your own names and colours. Drop a character where circles overlap to put them in several groups. **Auto-fill from ratings** makes Looks / Personality / Voice circles from your 5★ aspect ratings.

## Game tier lists
Switch **Characters / Games** at the top for a second, separate list made of game covers from VNDB. Import by VN ids, a VNDB username or user id (choose which of their labels to use: played, finished only, wishlist, everything), or search by name. Your VNDB votes become ratings for **Auto-rank by rating**. Games get all three styles (tier list, Venn diagram, axis chart), the same customisation, and the same 8 export styles and 17 sizes. Each list keeps its own placements, and both are saved.

## Heroines
Heroines (the player character) are tagged on import: KoiLog "protagonist", VNDB "main". Importing adds love interests and heroines together with their games (the games also go into your Games list). Tick **Also add side characters** in the import box to include them too. Then use the cast menu above the pool (or **Characters shown** when exporting) to choose who appears: everyone, hide heroines, heroines only, love interests only, heroines + love interests, or side characters only. Each choice shows how many characters it matches. Heroines show a pink ♀ badge; double-click a card and choose Mark as heroine to change one by hand. Characters imported before roles were saved can be fixed with **More → Detect heroines for imported characters** (or the button shown when the filter is empty), or by importing again.

## Customise
- **Layout:** pool beside or below the board, drag the divider (or use sliders) for pool width, card size on the board / in the pool / in the Venn, rank label width and text size, show or hide names on cards.
- **Ranks:** rename on the board (double-click), recolour, reorder, add or remove; four presets, save your own, or paste a list (`Soulmate #e8467c` per line). Optional order numbers on each card.
- Lists autosave in the browser; **More → Save list to file** keeps a copy.

## Export
8 styles (Pastel, Noir gold, Classic, Minimal, Neon, Washi, Midnight, Arcade), 17 sizes (auto-height widths 1000–3200, social posts and stories, wallpapers, A4 print), PNG / JPEG / WebP, 1–2× density, optional names. Works for both tier lists and Venn diagrams.

## Why a local server and not a bare `.html`
KoiLog's API rejects requests from other origins and its pictures aren't canvas-safe, so `server.py` proxies the API and images (`/proxy/koilog`, `/proxy/img`). VNDB is called straight from the page. This also means the site can't run from plain static hosting such as GitHub Pages without a proxy in front of it.
