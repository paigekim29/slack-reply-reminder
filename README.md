# Cookie Nudge

A Slack bot that sends you a DM during working hours when you have not replied to a message that mentions you.

## How it works

- Tracks mentions of `TARGET_USER_ID` in public and private channels the bot has joined.
- Sends a DM if you have not replied in the message thread after 20 minutes by default.
- Sends reminders on weekdays from 07:00–16:00 in Korea (`Asia/Seoul`) and 09:00–18:00 in US timezones.
- Refreshes your Slack profile timezone every hour, so timezone changes while traveling are picked up.
- Provides `Open message`, `In 30 minutes`, `Done`, and `No reply needed` buttons.
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
- Your Slack Member ID (open your profile → three-dot menu → Copy member ID)

## 2. Run it

Node.js 20 or newer is required.

```bash
cd ~/slack-reply-reminder
npm install
cp .env.example .env
```

Add the tokens and `TARGET_USER_ID` to `.env`, then run:

```bash
npm test
npm run dev
```

The app uses Socket Mode, so it does not need a public server or Request URL. For continuous operation, deploy it as a persistent service on a small server, Railway, Render, or a similar platform. The file-based store is intended for a single instance with persistent disk storage.

## Commands

```text
/cookie-nudge
/cookie-nudge timezone Asia/Seoul
/cookie-nudge timezone America/Los_Angeles
/cookie-nudge timezone auto
```

`timezone auto` uses the timezone from your Slack profile. A timezone changed with this command is temporary; restarting the process restores the `TIMEZONE_OVERRIDE` value from `.env`.

## Customize working hours

Override working hours for each timezone in `.env`:

```dotenv
WORK_SCHEDULES_JSON={"Asia/Seoul":{"start":"07:00","end":"16:00"},"America/*":{"start":"09:00","end":"18:00"},"default":{"start":"09:00","end":"18:00"}}
```
