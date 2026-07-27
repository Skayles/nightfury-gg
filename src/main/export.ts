import { SHEET_HEADER, toRow, MatchRecord } from './stats'

/**
 * Send matches to the user's Google Apps Script web app.
 *
 * The app holds NO Google credentials and NO secret: it just POSTs the rows to
 * a URL the user created from their own Sheet. Nothing else is accessible.
 */
export async function exportToSheet(
  matches: MatchRecord[],
  scriptUrl: string,
  token: string | null
): Promise<{ added: number }> {
  if (!scriptUrl) throw new Error('Aucune URL de script configurée.')
  if (!matches.length) return { added: 0 }

  const payload = {
    header: SHEET_HEADER,
    rows: matches.map(toRow),
    token: token ?? undefined
  }

  let res: Response
  try {
    res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    })
  } catch (e: any) {
    throw new Error(`Impossible de joindre le script : ${e?.message ?? e}`)
  }

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Le script a répondu ${res.status}. Vérifie le déploiement (accès « Tout le monde »).`)
  }
  // Apps Script returns our JSON ({ ok, added }); tolerate non-JSON responses.
  try {
    const data = JSON.parse(text)
    if (data && data.ok === false) {
      throw new Error(data.error ?? 'Le script a refusé la requête (jeton ?).')
    }
    return { added: data?.added ?? matches.length }
  } catch {
    return { added: matches.length }
  }
}
