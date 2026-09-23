# Newsdesk

A clean, remote-friendly news app for the Fire TV Stick. No clutter, just news.

Headlines on the left, a large preview on the right, and a full-screen reader. Everything is driven by the D-pad.

## Sources

| Source | How it's read |
| --- | --- |
| Citadel Wire | Nostr notes from `npub1q8g803ajr0lw3xngs0k6hn2q3mejf6dtgv05d06h6krqgv9uh97q5382kp`, with the site's RSS feeds as backup. Each wire is split into its individual stories. |
| Kagi News | RSS per category: UK, World, Technology, Science and Bitcoin. UK stories are given priority. Summaries are licensed CC BY-NC. |

## Tabs

- **Breaking news** — everything from the last 3 hours, newest first. A red dot marks unseen stories.
- **Today** — an optional AI briefing, then the day's biggest stories, local news, and Bitcoin and markets.
- **All** — everything, taking turns between sources so none of them floods the list.

## Remote

| Button | Does |
| --- | --- |
| ◀ ▶ | Switch tab, or move between stories in the reader |
| ▲ ▼ | Move through headlines, or scroll |
| OK | Read a story |
| ☰ Menu | Sources panel: what loaded, from where, and any errors. OK refreshes. |
| Back | Top of list, then Today, then exit |

After 3 idle minutes it shows one story at a time, dimmed and drifting to protect the screen. Any button wakes it.

## Build

The whole project is embedded in `.github/workflows/build-newsdesk.yml`, so that one file is all the repo needs. No laptop required.

1. Push the workflow file, or run it from the **Actions** tab.
2. Download the `newsdesk-apk-<run>` artifact.
3. Install it:

```
adb install -r newsdesk-<run>.apk
```

It's signed with a fixed key, so each build installs over the last one.

## AI briefing (optional)

Add a repository secret named `PPQ_API_KEY` with a [PPQ.ai](https://ppq.ai) key and rebuild. The app then writes a short briefing each morning from that day's stories, rewriting it at most every 3 hours and never more than 6 times a day.

Optionally add a repository variable `PPQ_MODEL` to pick a model. The default is `claude-sonnet-4-5`.

**Keep this repo private.** The key is built into the APK.

## Settings

Near the top of `app/src/main/assets/index.html`:

| Setting | Does |
| --- | --- |
| `HOME_TAB` | Which tab opens first |
| `BREAKING_HOURS` | How new a story must be to count as breaking |
| `KAGI_WANT` | Which Kagi categories to pull |
| `KAGI_BOOST` | How much of a head start UK stories get |
| `CW_RELAYS` | Which Nostr relays to ask |
| `IDLE_AFTER_MS` | How long before the idle screen starts |

## Requirements

Fire OS 5 or newer (Android 5.1+). Built with Gradle 8.9, Java 17 and AGP 8.5.
