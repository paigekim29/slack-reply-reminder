# Cookie Nudge

A Slack bot that reminds each mentioned person when they have not replied during their local working hours.

## How it works

- Tracks every human user mentioned in public and private channels the bot has joined.
- Sends each mentioned person a DM if they have not replied in the message thread after 20 minutes by default.
- Sends reminders on weekdays from 07:00–16:00 in Korea (`Asia/Seoul`) and 09:00–18:00 in US timezones.
- Refreshes each person's Slack profile timezone every hour, so timezone changes while traveling are picked up.
- Provides `Open message`, `In 30 minutes`, `Done`, and `No reply needed` buttons.
- Adds ✅ to the mentioned message for `Done` and ➖ for `No reply needed`.
- Persists state in `data/reminders.json`.

Because of Slack API limitations, the bot cannot see channels it has not joined or your private DMs. Replies must be posted in the original thread to be marked complete automatically.

## 1. Create the Slack app

1. Open [Slack API app management](https://api.slack.com/apps) and select **Create New App → From a manifest**.
2. Paste the contents of `slack-manifest.yaml` and create the app.
3. Under **Basic Information → App-Level Tokens**, create a token with the `connections:write` scope.
4. Go to **OAuth & Permissions → Install to Workspace**.
5. Run `/invite @Cookie Nudge` in every channel you want the bot to monitor.

You will need:

- Bot User OAuth Token (`xoxb-...`)
- App-Level Token (`xapp-...`)
- Signing Secret

## 2. Run it

Node.js 20 or newer is required.

```bash
cd ~/slack-reply-reminder
npm install
cp .env.example .env
```

Add the three Slack credentials to `.env`, then run:

```bash
npm test
npm run dev
```

The app uses Socket Mode, so it does not need a public server or Request URL. For continuous operation, deploy it as a persistent service on a small server, Railway, Render, or a similar platform. The file-based store is intended for a single instance with persistent disk storage.

## Commands

```text
/cookie-nudge
/cookie-nudge status
/cookie-nudge enable
/cookie-nudge disable
/cookie-nudge timezone Asia/Seoul
/cookie-nudge timezone America/Los_Angeles
/cookie-nudge timezone auto
```

`disable` stops future reminders for that user and cancels their pending reminders. `enable` turns them back on. Users are enabled by default.

`timezone auto` uses the command user's Slack profile timezone. Timezone overrides are kept separately for each user and reset when the process restarts.

## Customize working hours

Override working hours for each timezone in `.env`:

```dotenv
WORK_SCHEDULES_JSON={"Asia/Seoul":{"start":"07:00","end":"16:00"},"America/*":{"start":"09:00","end":"18:00"},"default":{"start":"09:00","end":"18:00"}}
```
