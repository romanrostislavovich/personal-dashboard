# Desktop app

Installers for Windows, macOS and Linux are attached to [GitHub Releases](https://github.com/romanrostislavovich/personal-dashboard/releases). On the
first start the app asks for the server URL — your server or a local Docker (`http://localhost:3300`).
The tray menu has “Start with the system” and “Change server”. The app starts with the system
(switch it off in the tray) and stays in the tray when its window is closed.

On Windows it can also record the time at the computer for the Activity section: switch it on in
Activity → Setup. The tracker notes which program and window is in front, sends it to your server
every minute and keeps it on the computer while there is no connection; the tray menu pauses it.
The tray also runs focus sessions (Pomodoro: notifications wait until the work part ends, time in
games and messengers is noted), reminds to take a break after an hour at the computer and reports
the computer's disks and load; daily limits (games, the whole day, one program) are set in
Activity → Setup.

More from the tray app: Ctrl+Alt+C sends the copied text, and Ctrl+Alt+S a piece of the screen,
to a task, a reminder or the diary; a bank statement saved to Downloads is offered for import into
Finance through the AI; calls (Zoom, Teams, Google Meet) count as meetings and keep
notifications quiet; private browser windows and your private words are recorded without their
titles; a summary of the day comes at 21:00; internet outages and battery care show up too.

When a disk fills up, Activity → Computers analyzes it on request: the app scans the disk
(about a minute), the AI — or built-in rules without one — says what can go and why, with the
exact command for Docker, npm and the like, and what to move to another disk. Buttons move
items to the Recycle Bin (and empty it), run the app's own cleanup for npm, pip, NuGet and Docker,
or show a path in Explorer. The
AI sees paths and sizes only, with your profile folder written as `%USERPROFILE%`; the system,
programs and virtual disks are never deleted, whatever the advice.

The app updates itself. Its own code is a few small files that every server hands out together
with the dashboard (`/desktop-updates`): the app compares them with what it runs, downloads a
newer version, checks it against the hashes of its manifest and restarts into it while its window
is in the tray. No installer is run, so nothing asks for administrator rights. A new installer is
needed only when the app moves to a newer Electron — the tray menu says so.

```bash
npm run dev:desktop           # Electron on top of the dev server
npm run desktop:package       # build an installer → dist/desktop-installers
```
