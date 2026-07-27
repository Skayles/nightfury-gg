import { DISCORD_CLIENT_ID, isConfigured } from './discord-config'

/**
 * Discord Rich Presence. Everything is wrapped defensively: if Discord isn't
 * running, the dep is missing, or the client ID is a placeholder, this quietly
 * does nothing and never affects the rest of the app.
 */

let client: any = null
let ready = false
let pending: { details: string; state: string; ts: number } | null = null
let starting = false
const appStart = Date.now()

export async function initDiscord(): Promise<void> {
  if (!isConfigured() || client || starting) return
  starting = true
  try {
    const mod: any = await import('@xhayper/discord-rpc')
    const Client = mod.Client
    client = new Client({ clientId: DISCORD_CLIENT_ID })
    client.on('ready', () => {
      ready = true
      apply()
    })
    client.on('disconnected', () => {
      ready = false
    })
    await client.login()
  } catch {
    client = null
    ready = false
    setTimeout(() => {
      starting = false
      initDiscord()
    }, 30000)
    return
  }
  starting = false
}

export function setPresence(details: string, state: string, ts: number = appStart): void {
  pending = { details, state, ts }
  apply()
}

function apply(): void {
  if (!client || !ready || !pending) return
  try {
    client.user?.setActivity({
      details: pending.details,
      state: pending.state,
      largeImageKey: 'logo',
      largeImageText: 'Nightfury.gg',
      startTimestamp: pending.ts,
      instance: false
    })
  } catch {
    /* ignore */
  }
}

export async function stopDiscord(): Promise<void> {
  try {
    await client?.user?.clearActivity?.()
    await client?.destroy?.()
  } catch {
    /* ignore */
  }
  client = null
  ready = false
}
