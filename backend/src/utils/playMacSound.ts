import { exec } from "child_process";

const MAX_PLAYS_PER_SECOND = 5; // max number of sounds to play per second
const MIN_INTERVAL_MS = 1000 / MAX_PLAYS_PER_SECOND; // minimum interval between sounds in milliseconds
const PLAY_SOUNDS =
  process.env.PLAY_SOUNDS !== "0" && process.env.PLAY_SOUNDS !== "false"; // whether to actually play sounds, controlled by environment variable
// sounds ordered from least-annoying (quietest) to loudest (most in-your-face)
const sounds = [
  "Tink.aiff", // very short, light tap
  "Purr.aiff", // gentle cat-purr
  "Ping.aiff", // soft single ping
  "Pop.aiff", // quick little pop
  "Sosumi.aiff", // playful ding, still quite mild
  "Bottle.aiff", // hollow “bottle” click
  "Frog.aiff", // frog-like ribbit
  "Morse.aiff", // rapid series of beeps
  "Glass.aiff", // clinking glass
  "Submarine.aiff", // sonar-style ping sequence
  "Funk.aiff", // funky bass-y tone
  "Hero.aiff", // bold, heroic flourish
  "Blow.aiff", // trumpet-like blast
  "Basso.aiff", // deep bass thump
];

let lastPlayedAt = [] as number[]; // array to track last played time for each sound level
let lastPlayedSound = 0;

export function playMacSound(level: number = 0) {
  if (!PLAY_SOUNDS) return; // if sound playing is disabled

  if (
    !lastPlayedAt[level] ||
    Date.now() - lastPlayedAt[level] > MIN_INTERVAL_MS
  ) {
    lastPlayedAt[level] = Date.now();
    lastPlayedSound = level;
    exec(
      `afplay /System/Library/Sounds/${sounds[level % sounds.length]}`,
      (err) => {
        if (err) console.error("Error playing sound:", err);
      }
    );
  }
}
