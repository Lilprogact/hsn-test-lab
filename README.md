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
* **Paper** — the VPS paper desk's live snapshot (every 5 minutes): positions, today's pips and money, equity,
  alerts acted on or skipped with the reason, the backtest check, and "Paper testing paused" with the last alert and
  price times whenever anything stops arriving. Up to 5 paper strategies, each with its own balance and money plan.
* **HSN Capital** — the building (original art; every movement is a real event), the firm page (staff pyramid,
  leaderboard by Month Score, Ideas Board, minutes, reports, memos, level-ups and swaps, budget meters, data
  coverage) and the CEO's office (open any agent's file, ask anyone a question answered from their real file, set
  the monthly focus, commend, approve or reject the Head of Trading's memo, pause the firm, run a cycle now).
* **Runs** — every past run and what GitHub is running right now.
* **Settings** — token, password, budgets and limits, HSN Capital's size and budgets, Actions minutes and AI
  costs this month, data coverage, the TradingView match check, animations on/off.

The header always shows the market clock: gold and NAS100 open or closed with the time to the next change in UK
time (including the weeks when UK and US clocks differ), the Sydney, Tokyo, London and New York sessions, and a
note when forex is open but gold is frozen.

## Security

Strict Content Security Policy: only this site's own scripts and styles, connections only to `api.github.com`,
no third-party scripts, no fonts from elsewhere. Alert text and anything else from outside is shown as plain text.

## Local check

```
npm run check   # syntax of every module
npm test        # market-clock tests (DST weeks, Friday close, sessions)
```
