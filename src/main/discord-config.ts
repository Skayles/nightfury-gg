/**
 * Discord Rich Presence — application client ID.
 *
 * This shows "Nightfury.gg" in the user's Discord status (with the dragon icon
 * and the current state). It's optional and only works when Discord is running.
 *
 * Setup (once, by you the developer):
 *   1. https://discord.com/developers/applications → New Application → name it
 *      "Nightfury.gg".
 *   2. Copy the "Application ID" and paste it below (it is NOT a secret).
 *   3. In the app → Rich Presence → Art Assets, upload the dragon icon as an
 *      asset named exactly "logo" (that's the image shown in the status).
 *
 * You can also override at runtime with the env var DISCORD_CLIENT_ID.
 */
export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? '1530939798204977262'

export function isConfigured(): boolean {
  return !DISCORD_CLIENT_ID.startsWith('PASTE_') && DISCORD_CLIENT_ID.length > 5
}
