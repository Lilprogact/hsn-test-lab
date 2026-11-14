# HSN Test Lab — website (public)

The website for the HSN Test Lab: a plain HTML/CSS/JavaScript site (no build step) hosted on GitHub Pages.
It holds **no data and no secrets**. Everything it shows comes from the private `hsn-test-lab-engine` repo
through the GitHub API, using a fine-grained token that you paste once and that is encrypted on your device.

## The password lock, honestly

A static site on GitHub Pages **cannot have a server-side login**: anyone can read this site's code. What the
password does is encrypt your GitHub token on the device you use (PBKDF2-SHA256 with 600,000 rounds and a random
salt, then AES-256-GCM). The password itself is never stored and never sent anywhere; the token is what actually
unlocks the data, and without it the site has nothing to show and nothing to run. The site locks itself after
30 minutes idle, and **Forget token** wipes it from the device. The token should be a fine-grained token for
`hsn-test-lab-engine` only — Actions: read and write, Contents: read-only, 90-day expiry — so even a leaked token
could only start workflows and read results, never change code. The site tells you when it is about to expire.

## What each page does

* **Backtest** — pick instrument, strategy, timeframes, dates, unseen months, targets, exits, balance, credit,
  risk plan, lot spread, market type, leverage, luck-check runs, a labelled experiment; tap **Run**. The engine
  runs on GitHub (one run at a time); the progress bar follows the engine's own status file. Results: money, average
  R, pips, win rate (last), profit factor, drawdown, training vs unseen months, target reach, splits (session,
  market type, HTF agreement, plan, month, year), the sideways stress test and bleed, the luck check with its
  histogram, the experiment next to the unchanged baseline, the plain-English summary, a replay of the real trades
  on real candles, and the trade CSV. **Describe my own** sends your rules to Claude, shows its reading for you to
  confirm or correct, and only then can the strategy run.
* **Million** — the challenge played from every start date: % reaching £1M, median finish, stop line and blow-ups,
  best/worst/typical runs, the day-by-day table with lots and pips needed, the luck check and the verdict.
* **Paper** — parked (Hassan, 8 Nov 2026: backtests and HSN Capital first). The page says so. When it returns it is
  virtual books only, on demo accounts opened just for the Test Lab; nothing of it runs on the trading VPS.
* **HSN Capital** — one **Start** button, then the firm works in shifts at the pace chosen in the Start dialog (every
  6 hours, 3 hours, hourly or non-stop) inside the two monthly limits set there (AI budget, GitHub minutes). Start
  waits until there is price history and says what is missing; **Pause** stops it. A line beside the button says what
  the firm is doing now: live figures while a shift runs (ideas tested, the Engine's own search, code read and handed
  in, when progress was last saved), otherwise when the next shift is due. The Start dialog and the CEO's office say,
  live as the pace or the minutes limit is changed, what they give: how many shifts are left this month and how long
  each may work, or the day the month's minutes would run out. The firm paces itself (each shift gets an even share
  of the minutes left) and that line is the engine's own sum (`js/firmlogic.js` `shiftPlan` = the engine's
  `scripts/firm_schedule.py` `shift_plan`; both are tested against the same table of cases). Five pages:
  * **Company** — the firm as a small 2D world (our own pixel-style art, drawn in code: `js/sprites.js` the people,
    `js/scene.js` the painters, `js/building.js` the logic, `js/palette.js` colours and sizes; no game's or brand's
    art). A side-on tower under the London sky (day and night by London's clock): the Audit desk and the CEO's office
    at the top, floors 5 to 2 with two group rooms and a discussion room each, the Analysts' floor with 12 rooms, a
    lift, and in the basement the Engine, the price history, the code room and the sandbox. All 100 agents are in it,
    each with a look of its own, a shirt in its level's colour, a mood on its face, its name and four bars for its
    progress to the next level (months in profit, pips, risk to reward, win rate); a star marks the most pips and a
    ring the best win rate. **It looks like a game and is not one: nothing is scripted.** What moves is only what
    really happened, from the live status of a running shift or a shift's recorded events:
    a test = the idea flies from the agent's screen down to the Engine and the Engine's own numbers come back to the
    desk; reading the code = it comes up from the code room; code handed in = it goes to the sandbox; a meeting = the
    group walks (along the floor, by the stairs between rows of rooms) to its discussion room and sits at the table;
    a challenge = the room's screen comes down and draws the real running total; an audit = the papers go to the
    Audit desk; a level-up = the lift, a new desk, a celebration; swaps, transfers and new Analysts the same. A room
    is lit while someone in it is really working; a paused firm sits in the half dark with its sign off. Only the sky,
    the blinking and the turning of the machines are decoration.
    Two pictures of the same world: **the camera** (first on the page) goes to wherever the latest real event is,
    with one line saying what it is and a badge saying LIVE, REPLAY of shift N, PAUSED or BETWEEN SHIFTS; with
    nothing to show it walks round the building saying what is true there ("The Engine is waiting for price
    history"). Buttons under it hold it on one floor, the top or the basement (it then stays there and still says
    what has just happened) or let it follow the action again, and give it the whole screen. Whoever is watching is
    the CEO: a figure marked "you" sits at the CEO's desk. **The whole building** is the map: tap a desk for that agent's file, a room for its group and its
    challenge played day by day on the real candles, the basement's machines for their pages. Between shifts the last
    shift's real events are **replayed on a loop**, always labelled as a replay (Replay options switches it off).
    A scoreboard sits between the two pictures (most pips, best win rate with a minimum number of trades and only
    for ideas in profit, ideas tested, strategy code in use, moves up, AI and minutes used) and under them
    "What just happened": the latest real events in plain words. Movement respects the device's reduced-motion
    setting and can be switched off; the pictures are then still and every event is applied without motion.
  * **People** — a tile per agent: level, best pips and win rate, the four bars; sort by floor, pips, win rate,
    progress, Month Score or name.
  * **Rules & code** — the strategy code agents and teams wrote themselves (tap one to read the code, how the
    sandbox judged it and its real results; "signals" are the trades the code itself opens over the whole history,
    "trades" its best tested result), each team's own rules as agreed in its meeting, and the coded features.
  * **Records** — staff pyramid, floors and their challenges, budget meters, the leaderboard (pips and win rate
    beside the Month Score), Ideas Board, events, minutes, discussions, reports, memos.
  * **CEO's office** — ask any agent or manager a question, set the monthly focus, commend, decide on the Head of
    Trading's memo, and how the firm works: the pace, the two monthly limits (changeable while it works), whether
    agents may write their own strategy code, the Engine's own search, and whether the win rate is a pass mark for
    moving up (off by default: shown and ranked on only).
  When the site's token cannot read the engine (a token made without Contents: Read-only can start jobs but read
  nothing), the page says which permission is missing and how to add it instead of showing an empty building.
* **Settings** — token, password, budgets and limits, HSN Capital's size and budgets, Actions minutes and AI
  costs this month, data coverage, the TradingView match check, animations on/off.

* **Setup** (One-time setup) — put the engine's five logins into GitHub Actions secrets from the browser, in one
  go, instead of typing them into GitHub's secrets page. See the next section.

The header always shows the market clock: gold and NAS100 open or closed with the time to the next change in UK
time (including the weeks when UK and US clocks differ), the Sydney, Tokyo, London and New York sessions, and a
note when forex is open but gold is frozen.

## One-time setup: the secret drop

Open `…/hsn-test-lab/#setup` (or the **Setup** tab). The page has one hidden box each for `FOREXCOM_MT5_LOGIN`,
`FOREXCOM_MT5_SERVER`, `FOREXCOM_MT5_PASSWORD` (the investor, read-only password), `ANTHROPIC_API_KEY` and
`VPS_FEED_READ_TOKEN`, and a last box for a **one-time key**.

What happens on **Send** (`js/drop.js`, `js/sealedbox.js`):

1. The page asks GitHub whether it accepts the one-time key, and reads `hsn-test-lab-engine`'s Actions public key.
   If GitHub does not accept the key, nothing is sent and the boxes are kept.
2. The browser reproduces a known sealed box byte for byte (a self-test); if it cannot, nothing is sent.
3. Each filled box is sealed in the browser for that public key (a libsodium sealed box, the format GitHub's API
   requires) and saved straight into the repository's Actions secrets. An empty box leaves its secret untouched.
4. The boxes are emptied as soon as the first value has gone through. The page asks GitHub which names it now
   holds, shows each name with **Saved** or **Failed**, and locks.
5. The one-time key is destroyed through GitHub's own revocation address (called without a login). GitHub emails
   the owner that a token was revoked; that is this step.
6. With the site token, the page starts the engine's `Secrets check` workflow and shows its one-line answer:
   FOREX.com read-only login / Anthropic key / feed access.

The locked page opens again only with the site password, and only to replace a value (with a new one-time key).

Where a value can be: in a hidden box in the page's memory, and sealed on its way to `api.github.com`. Where it
never is: this repo or its history, any file, a log or the console, a URL, `localStorage` / `sessionStorage` /
cookies / IndexedDB, any address other than `api.github.com`, any outside script (the two encryption libraries are
bundled in `js/vendor/` and pinned to their upstream files byte for byte; see `js/vendor/README.md`). The boxes are
`type="password"` (secure text entry: no keyboard learning, no suggestions) with autofill, autocorrect,
autocapitalise and spellcheck off, and they are not inside a form. Boxes left untouched for 60 minutes are emptied,
and so are they on a tap of Lock or a reload; when the site locks itself after 30 idle minutes they stay where they
are, out of sight and out of reach behind the password. The only thing kept on the device is the list of names
with Saved / Failed and the time.

**Why a one-time key and not the site token.** The site token stays on the device for 90 days. If it could also
write secrets, a stolen copy could overwrite one (for example, point the FOREX.com server name at a machine that
records the login). The one-time key is a fine-grained token for `hsn-test-lab-engine` only, with *Secrets: Read and
write* and nothing else, made a minute before the Send (the page links to GitHub's form with the name, a 1-day
expiry and the permission filled in), used once, never stored, and destroyed by the page. Neither key can ever read
a secret back: GitHub's API does not return secret values to anyone.

The tests (`npm test`) run all of this against a stand-in GitHub that holds a test private key: every saved value
opens to exactly what was typed; no value appears in any request other than sealed; the key is destroyed without a
login header; and with a rejected, read-only or wrong-account key nothing is saved.

## Security

Strict Content Security Policy: only this site's own scripts and styles, connections only to `api.github.com`,
no third-party scripts, no fonts from elsewhere. Alert text and anything else from outside is shown as plain text.
GitHub Pages cannot send the header that forbids framing, so the site refuses to run inside another page itself.

## Local check

```
npm run check   # syntax of every module
npm test        # market clock, the building, the sealed box against libsodium's own output, the bundled libraries, the secret drop
```
