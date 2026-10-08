# सर्वोदय अहिंसा — Games Platform

**https://sarvodayahinsa.web.app**

One site for every game. You build a game once in the Studio, then host it live — on one
stage or in five cities at the same time.

**कौन बनेगा सिद्धात्मा and अक्षय निधि are not modified.** They sit on the new site as they
are, and KBS also still works at its old address, `kounbanegasiddhatma.web.app`.

---

## What the audience sees

Just the logo, a box for the code, and a **Host sign in** link. That is deliberate — the
game library, the Studio and the dashboard are not the audience's business, and hiding
them stops anyone wandering into the host panel.

Everything else appears **on that same page** once a host signs in.

### Language

The whole interface is **English**, with **हिंदी** one tap away in the top bar. The choice is
remembered on that device.

**Your content is never translated.** Game titles, questions, options, jumble answers,
tambola facts, group names, venue names — all appear exactly as you typed them, in whatever
language you wrote them. Only the buttons and labels change.

### Profile (optional)

An audience member can tap **Save my details** once, and from then on they join any game
without filling a form. It is saved on their own phone — no account, no password, nothing
on a server. They can still join as a guest instead, and clear it any time.

---

## The pages

| Page | Who opens it |
|---|---|
| `/` | Everyone. Code box, profile, host sign-in. |
| `/studio` | You. Where games are built. |
| `/host` | You and other hosts. One per venue. |
| `/screen` | Nobody — it just displays. Opens from the host panel. |
| `/play` | The audience. No login. |
| `/dashboard` | You. Every venue side by side. |
| `/tickets` | You. Prints paper tambola tickets. |

Sign in with **the same email and password you use for कौन बनेगा सिद्धात्मा**.

---

## Building a game

**Studio → New game.** Five types:

| Type | What it does |
|---|---|
| **Quiz** | Four options, timer, 50:50 and audience poll, reveal, explanation. |
| **Jumble word** | Letters or words scrambled; players type the answer. Handles Devanagari properly — matras and conjuncts stay whole. |
| **Buzzer / rapid fire** | Fastest finger — buzz, or put items in order. Ranked by speed. |
| **Tambola** | See its own section below. |
| **Build your own** | See below. |

Then set **Details** (who plays, group names, points), **Look** (eight ready themes or your
own colours — every game can look completely different), **Rounds**, **Content**, and
**Backup**.

Use **Add many at once** to paste a whole question bank in one go.
**Download a backup before every show.**

---

## Build your own — the deep options

A custom round is five sets of choices:

**1 · Projector** — add blocks in any order: Title, Main text, Image, Options, Timer,
Answer (large), Top 10, Group scores, Spacer. **Each block has its own size (4 steps),
alignment (left/centre/right) and colour (5 choices).** Then pick the page layout (one
column / two columns / centred), how many columns the options use, whether options are
labelled A B C / 1 2 3 / nothing, and whether things animate in.

**2 · Phone** — what the player is asked for: nothing, pick one, **pick several**, true/false,
type an answer, type a number, **slide to a number**, **give a star rating**, put in order, or
hit a buzzer. Plus: shuffle options per player, and whether they may change their answer.

**3 · Timer** — length, when it turns red, whether it shows at all, whether it closes by
itself, and whether the answer reveals automatically.

**4 · Scoring** — points right, points wrong, speed bonus, first-correct-only, **position
points** (1st gets more than 10th), **part marks** for a partly-right multi-select or
ordering, case sensitivity, and a **tolerance** for number answers.

**5 · Per item** — any single question can override the round's timer and points.

---

## Tambola — hybrid play

### Hybrid mode

**Some people play on their phone, some on a printed ticket, in the same game.** Set this in
the round settings: Phones only / Paper only / **Hybrid**.

> **Ticket numbers must not overlap.** The same number produces the same ticket, so if
> printed tickets run 1–200, phone tickets must start at 201. The settings screen warns you
> in red if you get this wrong. Defaults: paper 1–200, phones from 201.

### Levels

Each number can carry a different fact at **Level 1, 2 or 3** (up to 5). During the show the
host switches level with one tap, or picks **Mixed** to draw from every level at once.
In the Studio, each item has a Level; bulk paste takes `number | fact | level`.

### Checkpoints

Six of them: **Early five, Top line, Middle line, Bottom line, Four corners, Full house.**
Each is worth points you set, can be switched off, and can be won only once. The board shows
who won each one, live — on the host panel, on the projector, and on every phone.

### Claims

**Phones**: claim buttons light up only when the claim is genuinely complete, so a false
claim can't even be sent. A checkpoint someone else already won shows their name instead.

**Paper**: press **Register a paper claim**, type the ticket number and the player's name,
pick the claim. The exact ticket is rebuilt on screen with the drawn numbers marked, and the
claim is checked against what has actually been drawn.

### Lucky draw

**Lucky draw** picks a random ticket — from printed tickets, phone players, or both
(weighted so 200 paper tickets aren't out-drawn by 5 phones). The winning number fills the
projector until you clear it.

### Printing tickets — `/tickets`

Two styles:

- **Standard housie** (3 × 9, fifteen numbers) — matches the phone tickets, and **the host can
  verify a claim just by typing the ticket number**.
- **Simple grid** — the अक्षय निधि layout: choose rows, columns and a number range per row.
  With custom ranges the host can't look a ticket up by number; the page says so plainly.

Type the **same code the host panel shows**. Layouts: 2, 4 or 6 per page.

---

## Running a show

1. **Studio → Run a show**, or **Host panel → Start a new show**.
2. A 5-letter code appears. **Link** copies it, **QR** makes a printable code.
3. **Take the show live.**
4. Open the projector from the host panel on the venue PC, click once, press **F**.
5. Run each item: **Load a new item → Show → Open answers → Close → Reveal → Give points.**

**Keyboard:** `L` load · `1`–`5` the steps · `9` leaderboard · `0` blank · `←` `→` prev/next.

**Stage groups** have a row of A B C D buttons on the host panel. Correct groups get their
points automatically when you reveal.

---

## Several venues at once

**Host panel → Venues → +.** Each venue gets its own projector, host and stage groups, and
runs at its own speed. **Bring all venues here** lines everyone up for a finale.
**Dashboard** shows every venue side by side and whether its host and screen are connected.

---

## Rehearsal — no internet, no login

`REHEARSE.bat`, or add `?demo=1` to any page. Everything is stored on that computer only.
Open the host in one window and the projector and a phone-sized window beside it — they talk
to each other exactly like the real thing.

---

## Staying free

You are on the Blaze plan, but this platform is built to **never generate a bill**:

- **No Cloud Functions and no Cloud Storage** — those are the parts that actually charge.
  Only Hosting and Realtime Database are used, and both keep their free allowances on Blaze.
- Free each month: 10 GB database download, 1 GB stored, 10 GB hosting transfer. A show of a
  few hundred phones uses a small fraction of that.
- **Delete finished shows now and then** (Dashboard) to keep stored data small.
- Don't turn on Storage, Functions or Firestore in the console.

---

## Before every show

- [ ] Studio → Backup → **download the backup**
- [ ] Check every round has content
- [ ] Tambola: check paper and phone ticket numbers don't overlap
- [ ] Open the projector, click once, press **F**
- [ ] Join from your own phone and check your name appears
- [ ] Run one full item end to end
- [ ] Print the QR big; keep a phone hotspot ready

---

## When something goes wrong

**Asked to "add this UID to admins" instead of a login box** — fixed; you now get a proper
sign-in form. If a real account still shows it, that account isn't in `admins` yet.

**Hindi letters look broken on the projector** (मात्रा missing, "शामिल" → "शाामल") — that is a
font falling back over a slow connection. This site names Devanagari fonts already installed
on the machine, so it renders correctly even with no internet. *Your old KBS projector page
still has this fault — say the word and I'll apply the same one-line fix there.*

**Audience says the code doesn't work** — codes never use O, I or S, so a "0" is a zero.

**Projector blank** — it only ever reads, so refresh it; it jumps straight back.

**Internet dies mid-show** — everything freezes where it is; nothing is lost.

---

## Files

| File | What it does |
|---|---|
| `DEPLOY-SA.bat` | Publishes the games platform |
| `DEPLOY.bat` | Publishes KBS to its old address (pinned to that site only) |
| `REHEARSE.bat` | Offline rehearsal |
| `sarvodayahinsa\assets\i18n.js` | Every interface word, English + Hindi |
| `sarvodayahinsa\assets\types\` | One file per game type |
| `FIREBASE_RULES.json` | The `sa` section is new; KBS's rules are byte-identical |
| `*.backup-before-sa.json` | The three config files as they were before |
