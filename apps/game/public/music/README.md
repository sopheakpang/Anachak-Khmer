# Your own music for the Kingdom tab (D76)

The Kingdom tab plays **original generated music** in the pinpeat / mahori style by itself.
You can play your own music instead.

**Only use audio you own or have permission to use (and to stream on TikTok LIVE).**
Do not download songs from YouTube or other sites you have no rights to.

## How to add songs

1. Put the files in this folder (`apps/game/public/music/`): **mp3, ogg or m4a**.
   Use plain file names, for example `pinpeat-morning.mp3`.
2. List them in `config/kingdom/music.json` under `tracks` (Khmer and English names):

   ```json
   "tracks": [
     { "file": "pinpeat-morning.mp3", "km": "ពិណពាទ្យពេលព្រឹក", "en": "Pinpeat morning" }
   ]
   ```

3. Restart the game (or rebuild: `npm run build`). The songs play in a loop, shuffled.

- A file that is missing or cannot be played is skipped (a warning in the console); if none
  can be played, the generated music plays instead.
- The phone build leaves the songs out (they would make the offline app big). To include
  them, set `"tracksOnMobile": true` in `music.json`.
- Audio files here are **not** added to git (see `.gitignore`), so they are not published by
  accident. Remove those lines if you want them in the repository.
