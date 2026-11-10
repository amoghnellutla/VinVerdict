# Usability test: five people, about 20 minutes each

**Goal:** find out whether someone who has never seen VinVerdict can check a real listing, understand the answer, and say what they'd do next, with no help.

## Who

Five people who are shopping for a used car now, or did in the last year. Mix phones and computers: at least two on a phone.

## Setup (2 minutes)

- Use their own device and a listing they're actually considering. If they have none, have them pick a car on Facebook Marketplace or Craigslist they'd plausibly buy.
- Say: *"I'm testing the website, not you. Please think out loud. I can't help during the tasks, so if you get stuck, tell me what you expected to happen."*
- Open https://vinverdict.vercel.app and start a timer.

## Tasks (say each one, then stay quiet)

1. **"Check this listing with VinVerdict."** Watch how they get the listing in (copy the page, screenshots, VIN).
2. **"In your own words: what does VinVerdict say about this car?"**
3. **"Why does it say that? Show me the evidence."**
4. **"What is it not sure about?"**
5. **"What would you do next with this seller?"**
6. **"Is the price fair? How do you know?"**
7. *(If there's time)* **"Save it so you can compare it with another car later."**

## Write down for each task

| | Person 1 | Person 2 | Person 3 | Person 4 | Person 5 |
| --- | --- | --- | --- | --- | --- |
| Device | | | | | |
| 1. Got the listing in? Time, how, where they got stuck | | | | | |
| 2. Their summary (their words) | | | | | |
| 3. Found the evidence? | | | | | |
| 4. Named something still unknown? | | | | | |
| 5. Their next step (reasonable?) | | | | | |
| 6. Read the price correctly (estimate, not a sale price)? | | | | | |
| 7. Saved it? | | | | | |
| Anything that confused, alarmed or annoyed them | | | | | |

## After each session (2 minutes)

- *"What was the most useful thing?"*
- *"What would stop you using it again?"*
- *"Would you tell a friend about it? Why or why not?"*

## What counts as success

- 4 of 5 get a listing in without help, in under 2 minutes.
- 4 of 5 can say why the verdict is what it is, and name one thing still unknown.
- 5 of 5 give a reasonable next step. Nobody reads "worth investigating" as "safe", or an estimate as a sale price.

## Afterwards

Fix the problem that tripped the most people first. Add any listing it got wrong as a test case (`src/lib/listing/corpus/`), and note the results with the date in `docs/PLAN.md`.
