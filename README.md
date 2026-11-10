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
* **HSN Capital** — the building (original art): all 100 agents at their own desks, coloured by level with a level
  number, a mood face and three bars for their progress to the next level (Day Score, pips, risk to reward). Nothing
  moves unless something real happened: the live status of a running cycle, or a finished cycle's real events
  (**Replay**): typing, result chips, meetings, the Audit desk, transfers, the lift. Tap a desk for that agent's file
  (level, how it got there, rules in plain English, real results, group, mood, research notes, code) or a room for its
  group and its challenge played day by day on the real candles. Below it: the Staff grid (a tile per agent), the firm
  page (staff pyramid, floors and their challenges, budget meters, leaderboard, Ideas Board, events, minutes,
  discussions, reports, memos), how the agents research and code, and the CEO's office.
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
