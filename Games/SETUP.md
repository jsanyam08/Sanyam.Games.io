# कौन बनेगा सिद्धात्मा — Setup Guide

Read this once, top to bottom. Nothing works until Part 1 is done.

---

## The three portals

| File | Who opens it | Where |
|---|---|---|
| `NEWKBSHOST.html` | You (the operator) | Your laptop |
| `PROJECTOR.html` | Nobody — it just displays | The PC driving the projector/TV |
| `MOBILE.html` | The audience | Their own phones, via a web link |

They talk to each other through Firebase. The host writes commands; the other two listen and react.
**The host is the only one that can change anything.** Phones can only submit their own answers.

---

# PART 1 — Three things only you can do

## Step 1 · Turn on Anonymous sign-in

1. Go to https://console.firebase.google.com and open your project **kounbanegasiddhatma**
2. Left menu → **Authentication** → **Get started** (if you see it)
3. **Sign-in method** tab → click **Anonymous** → toggle **Enable** → **Save**

Without this, nothing connects — every portal will sit on "Connecting…".

## Step 2 · Publish the security rules

1. Left menu → **Realtime Database** → **Rules** tab
2. Open `FIREBASE_RULES.json` (in this folder) in Notepad, select all, copy
3. Paste it into the rules box, replacing everything there
4. Click **Publish**

**Why this matters:** without rules, anyone who opens the audience link can delete your entire
question bank or push fake questions to the projector mid-show. With them, phones can only write
their own answer, once, and can't read anyone else's.

## Step 3 · Make yourself the admin

1. Open `NEWKBSHOST.html` (double-click it)
2. It will say **"This device is not an admin yet"** and show a long code like `k3Jf9x...`. Copy it.
3. Back in Firebase → **Realtime Database** → **Data** tab
4. Hover the top row (the database name) → click the **+**
5. Name: `admins` — leave the value empty → click **+** again on the new `admins` row
6. Name: *paste your code* — Value: type `true`
7. Click **Add**
8. Go back to the host page and click **Reload**

It should now open straight into the controller.

> **Doing this on a second laptop?** Repeat step 3 with that laptop's code. Each device gets its own.
> **This is also your backup plan** — if your laptop dies mid-show, a second admin laptop takes over instantly.

---

# PART 2 — Getting the link onto phones

`MOBILE.html` on your hard drive has no web address, so phones can't reach it.
Pick one:

### Option A — Firebase Hosting (free, best)
In a Command Prompt:
```
npm install -g firebase-tools
cd D:\Games
firebase login
firebase init hosting
firebase deploy
```
When it asks for the public folder, type `.` (a single dot). Say **No** to "single-page app".
You get a link like `https://kounbanegasiddhatma.web.app/MOBILE.html`.

### Option B — Anything that hosts a file
Netlify Drop, GitHub Pages, your own website. Upload `MOBILE.html`, share that URL.

**Then:** make a QR code of that link (any free QR generator), print it big, put it on every table
and on the projector before the show starts.

---

# PART 3 — Before every single show

- [ ] **Download a backup.** Host → Settings & CMS → Backup/Restore → Download. Do this *every time*.
- [ ] Load your questions for every level you'll actually use
- [ ] Open the CMS → each level → confirm the pool isn't empty
- [ ] Click **Reset Used Pool** for each level, so old questions come back
- [ ] Open `PROJECTOR.html` on the projector PC, **click once** (browsers block audio until you do), then press **F11** for full screen
- [ ] Test from your own phone: open the audience link, join, check your name appears in the host's "phones" counter
- [ ] Run one full practice question end to end

---

# PART 4 — Running the show

### The loop for each question

1. **L** — load a random unused question (you see it; the room does not)
2. **1** — put the question on screen, options still hidden
3. Read it aloud
4. **2** — reveal the options
5. **5** — start the timer
6. Contestant decides. If they use a lifeline, click it in the Lifelines box.
7. **A / B / C / D** — lock their answer
8. **3** (correct) or **4** (wrong)
9. **7** — show the explanation, and read the host script from your left panel
10. **Level Up ▶**, then back to step 1

### Keyboard shortcuts
Press **⌨️ Shortcuts** in the header any time. They're off while you're typing in a box.

### Lifelines
- **50:50** — hides the two options you marked in the CMS. If you never set them, it picks two wrong ones at random and warns you.
- **📊 Poll** — opens voting on all phones automatically. Watch the bars fill in the host panel, then **Push Bars to Projector** when you want the room to see them.
- **💡 Expert** — just puts a screen up. The actual expert is a person on your stage.
- **📞 Call** — puts a screen up and starts a 60-second timer.

### Audience rounds (between contestants)
- **FFF** — pick a round, **Send to Phones**. Phones get the items *shuffled*. Close entries, then **Show Top 10**. Points: 1st = 50 down to 10th = 5.
- **Audience Question** — send, then **Reveal Answer**. Everyone who got it right gets +10.
- **Blank All Screens** (key **0**) — phones go quiet. Use this whenever you're not running an audience round, so nobody is staring at a stale screen.

---

# Things that will go wrong, and what to do

**"This device is not an admin yet"**
Step 3 wasn't completed, or you're on a different laptop/browser than the one you registered.

**Phones say "Sign-in failed"**
Step 1 wasn't done. Enable Anonymous auth.

**"Write failed: PERMISSION_DENIED" on the host**
Step 2 or 3 is wrong. Check the `admins` entry is spelled exactly right and its value is `true`, not `"true"`.

**Projector shows nothing / stuck on the logo**
Check the little dot at bottom-left says `live`. If not, it's the internet. The projector only ever
*reads* — you can refresh it mid-show and it'll jump straight back to the current state.

**No sound**
The projector page needs one click before browsers allow audio. Refresh and click once.
For real music, drop MP3 files into this folder named exactly: `theme.mp3`, `suspense.mp3`,
`lock.mp3`, `correct.mp3`, `wrong.mp3`. Without them you get simple synthesised beeps.

**Internet dies mid-show**
Everything freezes where it is; nothing is lost. When it reconnects, all three portals catch up
automatically. **Have a phone hotspot ready as backup.**

**You lost the question bank**
Settings & CMS → Backup/Restore → choose your backup file → Restore. This is why you download one before every show.

---

# What you can safely edit yourself

Open `NEWKBSHOST.html` in Notepad and search for `PRIZE LADDER`. You'll see:

```
{n:1,  name:"दर्शन प्रतिमा",  prize:1000},
```

Change the `prize` numbers to whatever your show pays. **Change them in `PROJECTOR.html` too** —
there's an identical list near the top of its script. The two must match.

`safe:true` marks a guaranteed level. Right now that's 7, 12 and 14.

---

# Still to decide

**Levels 12, 13, 14** are currently `मुनि दीक्षा`, `केवलज्ञान`, `सिद्ध पद`. There are only eleven
श्रावक प्रतिमा, so those last three were a guess to carry the ladder up to the show's title.
If they should be something else, tell Claude and they'll be changed in all three files at once.
