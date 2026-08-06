<div align="center">

# 🐉 Nightfury.gg

**A keyless League of Legends desktop companion.**
*Compagnon de bureau keyless pour League of Legends.*

Electron · React · TypeScript · Tailwind

[English](#english) · [Français](#français)

</div>

---

## Screenshots

|                   Profile                    |             Live / Lobby             |
| :------------------------------------------: | :----------------------------------: |
|        ![Profile](docs/profile.png)         |     ![Live / Lobby](docs/live.png)     |
|              **Match detail**               |            **Scoreboard**            |
|   ![Match detail](docs/match-detail.png)    |  ![Scoreboard](docs/scoreboard.png)  |

---

## English

### What is Nightfury.gg?

**Nightfury.gg** is a desktop companion for League of Legends that reads your data
**directly from the game client** (the LCU) — so it needs **no Riot API key, no
login, and no secrets**. You just launch it while League is running and it works.

The name is a nod to *Toothless*, the **Night Fury** dragon — and the `.gg`
suffix follows the naming convention of LoL tools (op.gg, u.gg…), so it instantly
reads as a stats companion.

> Built to be shared publicly: **no secret in the code**, no access to anyone's
> account. Every user stays in control of their own data.

### Features

- **Profile** — an op.gg-style match history with **filters** (queue, champion,
  result, period), aggregate stats (winrate, KDA, CS/min, KP, vision) and
  per-champion breakdowns, split into two sub-tabs:
  - **Overview** — the summoner header (icon, level, rank), aggregates and the
    clickable match history. Each row also shows the **summoner spells, items and
    runes** used (with hover tooltips).
  - **Charts** — recent form, a cumulative **winrate trend**, **win/loss** and
    **by-queue** donut charts, and your most-played champions.
  - Click any match to open it in three tabs: **My game** (full stats + a
    **highlights timeline**: first blood, kills & deaths, dragons, Baron, towers…),
    **Runes** (a full LoL-style rune page with stat shards and tooltips), and
    **Scoreboard** (all 10 players with KDA, CS, damage, gold and items).
  - **Session analysis** — groups your games into play sessions (detected from
    your own cadence) and surfaces trends: fatigue over a session, form after a
    break, best time of day, tilt after a loss, weekend vs weekday, and more.
- **Live / Lobby** — a **loading-screen view** of the 10 players, sorted by role
  (top → jungle → mid → adc → support), each shown with the champion's art (right
  skin), Riot ID and **rank**. Includes an **Open on Porofessor** button, and the
  cards are **clickable** to open a player's profile in the app.
- **Friends list** — a side drawer showing your Riot friends, their status and
  which game they're on, with the champion for those in a LoL game.
- **Google Sheet export** — send your history to a Google Sheet with **no Google
  login**: you paste a small Apps Script URL bound to *your* sheet. Manual or
  automatic (on game end), with an export filter, plus a zero-config **CSV** export.
- **Update notifier** — checks GitHub Releases on launch and shows a banner when a
  newer version is available.
- **Discord Rich Presence** *(optional, off by default)* — shows "Nightfury.gg"
  in your Discord status with your current champion and a game timer.
- **Options** — switch language (🇫🇷 / 🇬🇧), toggle Discord presence, manage
  storage, and add an optional Riot API key (see *Advanced mode* below).
- **Bilingual** — full French / English interface, with times shown in your PC's
  local time zone.

### Keyless by design

The app never connects to any account and holds no secret. For the Sheet export,
the data flow is *your app → your script → your sheet* — nothing passes through a
third party. Rank data for other players comes from **your own client's session**,
the same way the game client itself talks to Riot's servers.

> **Note on player winrate:** showing *other* players' winrate / per-champion
> stats reliably isn't possible from the client session alone. To stay 100%
> keyless, Nightfury.gg shows other players' **rank** only — unless you opt into
> *Advanced mode* with your own key (below).

### Advanced mode (optional Riot API key)

By default the app is fully keyless and shows other players' **rank** only. If you
add **your own Riot API key** in **Options** (a free 24h development key, or a
personal / production key), you unlock:

- **Real winrate** and account **level** for the 10 players in the Live view.
- **Smurf detection** — a badge flags likely smurfs (low level and/or high winrate
  over few games).
- **Premade detection** — teammates who often queue together are grouped with a
  coloured dot.
- **Player search** — look up **any** player: their live game (loading-screen view)
  and their full **profile** (rank, history with *load more*, stats, charts).

Get a key at <https://developer.riotgames.com/>. Your key is stored **locally** in
the app's user-data folder and is **never** bundled in the app or committed to the
repo. These are best-effort heuristics (like Porofessor/Blitz), and a development
key expires every 24h.

> **Never** ship a production key inside a distributed desktop app — client-side
> code can always be read, so the key would leak. The only safe place for a shared
> production key is a backend you host. The "everyone brings their own key" model
> above avoids that problem entirely.

### Performance

- **API response cache** — Riot API calls are cached in memory with per-type
  lifetimes (finished match details are kept for hours, ranks/levels for minutes,
  live games for seconds), so reopening a profile or re-scouting is near-instant
  and uses far fewer requests.
- **Data Dragon disk cache** — champion/item/rune/spell data is cached on disk per
  patch, so after the first launch startup only fetches the tiny version file and
  loads everything locally. It also keeps working offline from the cached copy.

### ⚠️ Windows SmartScreen / antivirus warning

Nightfury.gg is an open-source Electron app that isn't code-signed (a signing
certificate is expensive for a free project). Because the executable is new and
unsigned, Windows **SmartScreen** or your browser may warn that it's "not
commonly downloaded" or flag it as suspicious. **This is a reputation/heuristic
warning, not an actual virus** — the app only makes local requests to your
League client and to Riot's public servers (Data Dragon), and holds no secret.

- The full source code is in this repository — you can read exactly what it does.
- You can scan the release yourself, e.g. on [VirusTotal](https://www.virustotal.com/).

To run it anyway:
- **SmartScreen:** click *More info* → *Run anyway*.
- **Chrome / Edge download:** open the *⋯* menu next to the download → *Keep*.

The warning fades on its own as more people download and keep the app — reputation
builds over time.

### Getting started (development)

Requirements: **Node.js 18+** and the League client installed.

```bash
npm install
npm run dev
```

### Build a distributable

```bash
npm run build      # type-check + bundle
npm run dist       # package a Windows .exe (via electron-builder)
```

The build uses the icon in `build/` and produces a portable executable named
**Nightfury.gg**.

### Optional setup

<details>
<summary><b>Riot API key (advanced mode)</b></summary>

1. Sign in at <https://developer.riotgames.com/> with your Riot account.
2. Copy your **Development API Key** (free, expires every 24h) — or register a
   project for a **Personal / Production** key.
3. Paste it into the app's **Options → Riot API key** and click *Save and validate*.
</details>

<details>
<summary><b>Discord Rich Presence</b></summary>

1. Create an app at <https://discord.com/developers/applications> named "Nightfury.gg".
2. Copy its **Application ID** into `src/main/discord-config.ts` (it is *not* a secret).
3. In **Rich Presence → Art Assets**, upload the dragon icon as an asset named `logo`.
4. Enable Discord presence in the app's **Options** tab.
</details>

<details>
<summary><b>Google Sheet export</b></summary>

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Paste the script shown in the app's **Google Sheet** tab, and save.
3. **Deploy → New deployment → Web app**, access "Anyone".
4. Copy the deployment URL and paste it into the app.
</details>

### Tech stack

Electron + [electron-vite](https://electron-vite.org) · React + TypeScript ·
Tailwind CSS · [league-connect](https://github.com/matsjla/league-connect) for the
LCU · pure-JSON local storage (no native modules).

### Disclaimer

Nightfury.gg isn't endorsed by Riot Games and doesn't reflect the views or
opinions of Riot Games or anyone officially involved in producing or managing
League of Legends. League of Legends and Riot Games are trademarks or registered
trademarks of Riot Games, Inc.

### License

Released under the [MIT License](LICENSE).

---

## Français

### C'est quoi Nightfury.gg ?

**Nightfury.gg** est un compagnon de bureau pour League of Legends qui lit vos
données **directement depuis le client du jeu** (le LCU) — donc **aucune clé API
Riot, aucune connexion, aucun secret**. Vous le lancez pendant que League tourne,
et ça fonctionne.

Le nom est un clin d'œil à *Krokmou* (Toothless), le dragon **Night Fury** — et le
suffixe `.gg` reprend la convention des outils LoL (op.gg, u.gg…), pour qu'on
comprenne tout de suite qu'il s'agit d'un compagnon de stats.

> Conçu pour être partagé publiquement : **aucun secret dans le code**, aucun
> accès au compte de qui que ce soit. Chaque utilisateur reste maître de ses données.

### Fonctionnalités

- **Profil** — un historique façon op.gg avec **filtres** (file, champion,
  résultat, période), des stats agrégées (winrate, KDA, CS/min, KP, vision) et
  le détail par champion, réparti en deux sous-onglets :
  - **Vue d'ensemble** — l'en-tête d'invocateur (icône, niveau, rang), les
    agrégats et l'historique cliquable. Chaque ligne montre aussi les **sorts
    d'invocateur, objets et runes** utilisés (avec infobulles au survol).
  - **Graphiques** — la forme récente, une **courbe de winrate**, des camemberts
    **victoires/défaites** et **par file**, et vos champions les plus joués.
  - Cliquez sur une partie pour l'ouvrir en trois onglets : **Ma partie** (stats
    détaillées + une **frise des faits marquants** : first blood, kills et morts,
    dragons, Baron, tours…), **Runes** (une page de runes façon LoL avec les
    fragments de stats et des infobulles) et **Scoreboard** (les 10 joueurs avec
    KDA, CS, dégâts, or et objets).
  - **Analyse de session** — regroupe vos parties en sessions (détectées d'après
    votre propre cadence) et fait ressortir des tendances : fatigue en fin de
    session, forme après une pause, meilleure heure de jeu, tilt après une
    défaite, week-end vs semaine, etc.
- **Live / Lobby** — une **vue écran de chargement** des 10 joueurs, **triés par
  rôle** (top → jungle → mid → adc → support), chacun avec l'art du champion (bon
  skin), son Riot ID et son **rang**. Avec un bouton **Ouvrir sur Porofessor**, et
  les cartes sont **cliquables** pour ouvrir le profil d'un joueur dans l'app.
- **Liste d'amis** — un tiroir latéral montrant vos amis Riot, leur statut et le
  jeu sur lequel ils sont, avec le champion pour ceux en partie sur LoL.
- **Export Google Sheet** — envoie votre historique vers un Google Sheet **sans
  connexion Google** : vous collez une petite URL Apps Script rattachée à *votre*
  sheet. Manuel ou automatique (fin de partie), avec un filtre d'export, plus un
  export **CSV** sans configuration.
- **Notification de mise à jour** — vérifie les releases GitHub au lancement et
  affiche une bannière quand une nouvelle version est disponible.
- **Présence Discord** *(optionnelle, désactivée par défaut)* — affiche
  « Nightfury.gg » dans votre statut Discord, avec votre champion et le chrono.
- **Options** — changez de langue (🇫🇷 / 🇬🇧), activez/désactivez la présence
  Discord, gérez le stockage, et ajoutez une clé API Riot optionnelle (voir
  *Mode avancé* ci-dessous).
- **Bilingue** — interface complète français / anglais, avec les heures affichées
  dans le fuseau horaire local de votre PC.

### Keyless par conception

L'application ne se connecte à aucun compte et ne détient aucun secret. Pour
l'export Sheet, le flux est *votre application → votre script → votre sheet* —
rien ne transite par un tiers. Le rang des autres joueurs provient de **la session
de votre propre client**, de la même façon que le client du jeu communique avec
les serveurs de Riot.

> **À propos du winrate des joueurs :** afficher de façon fiable le winrate /
> les stats par champion des *autres* joueurs n'est pas possible depuis la seule
> session du client. Pour rester 100 % keyless, Nightfury.gg affiche uniquement
> leur **rang** — sauf si vous activez le *Mode avancé* avec votre propre clé
> (ci-dessous).

### Mode avancé (clé API Riot optionnelle)

Par défaut, l'application est entièrement keyless et n'affiche que le **rang** des
autres joueurs. Si vous ajoutez **votre propre clé API Riot** dans les **Options**
(une clé de développement gratuite valable 24 h, ou une clé personnelle /
production), vous débloquez :

- Le **winrate réel** et le **niveau** de compte des 10 joueurs en Live.
- La **détection de smurf** — un badge signale les smurfs probables (niveau bas
  et/ou winrate élevé sur peu de parties).
- La **détection de premade** — les coéquipiers qui jouent souvent ensemble sont
  regroupés par une pastille de couleur.
- La **recherche de joueur** — consultez **n'importe quel** joueur : sa partie en
  cours (vue écran de chargement) et son **profil** complet (rang, historique avec
  *charger plus*, stats, graphiques).

Obtenez une clé sur <https://developer.riotgames.com/>. Votre clé est stockée
**localement** dans le dossier de données de l'application ; elle n'est **jamais**
incluse dans l'app ni poussée sur le dépôt. Ce sont des heuristiques best-effort
(comme Porofessor/Blitz), et une clé de développement expire toutes les 24 h.

> N'intégrez **jamais** une clé de production dans une app de bureau distribuée :
> le code côté client est toujours lisible, la clé fuiterait. Le seul endroit sûr
> pour une clé de production partagée est un backend que vous hébergez. Le modèle
> « chacun sa clé » ci-dessus évite totalement ce problème.

### Performances

- **Cache des réponses API** — les appels à l'API Riot sont mis en cache en
  mémoire avec une durée adaptée à chaque type (détails de parties terminées
  gardés plusieurs heures, rangs/niveaux quelques minutes, parties en cours
  quelques secondes) : rouvrir un profil ou re-scouter devient quasi instantané
  et consomme beaucoup moins de requêtes.
- **Cache disque de Data Dragon** — les données champions/objets/runes/sorts sont
  mises en cache sur le disque par patch : après le premier lancement, le
  démarrage ne récupère plus que le petit fichier de version et charge tout en
  local. L'app reste aussi utilisable **hors-ligne** grâce à cette copie.


### ⚠️ Avertissement SmartScreen / antivirus (Windows)

Nightfury.gg est une application Electron open-source **non signée** (un certificat
de signature coûte cher pour un projet gratuit). Comme l'exécutable est récent et
non signé, Windows **SmartScreen** ou votre navigateur peuvent prévenir qu'il est
« peu téléchargé » ou le signaler comme suspect. **C'est un avertissement de
réputation/heuristique, pas un vrai virus** — l'application ne fait que des
requêtes locales vers votre client League et vers les serveurs publics de Riot
(Data Dragon), et ne détient aucun secret.

- Le code source complet est dans ce dépôt — vous pouvez vérifier exactement ce qu'il fait.
- Vous pouvez analyser le fichier vous-même, par exemple sur [VirusTotal](https://www.virustotal.com/).

Pour le lancer malgré tout :
- **SmartScreen :** cliquez sur *Informations complémentaires* → *Exécuter quand même*.
- **Téléchargement Chrome / Edge :** ouvrez le menu *⋯* à côté du téléchargement → *Conserver*.

L'avertissement disparaît de lui-même à mesure que l'application est téléchargée et
conservée par plus de monde — la réputation se construit avec le temps.

### Démarrage (développement)

Prérequis : **Node.js 18+** et le client League installé.

```bash
npm install
npm run dev
```

### Générer un exécutable

```bash
npm run build      # vérification des types + bundle
npm run dist       # empaquette un .exe Windows (via electron-builder)
```

Le build utilise l'icône du dossier `build/` et produit un exécutable portable
nommé **Nightfury.gg**.

### Configuration optionnelle

<details>
<summary><b>Clé API Riot (mode avancé)</b></summary>

1. Connectez-vous sur <https://developer.riotgames.com/> avec votre compte Riot.
2. Copiez votre **Development API Key** (gratuite, expire toutes les 24 h) — ou
   enregistrez un projet pour une clé **Personal / Production**.
3. Collez-la dans **Options → Clé API Riot** et cliquez sur *Enregistrer et valider*.
</details>

<details>
<summary><b>Présence Discord</b></summary>

1. Créez une application sur <https://discord.com/developers/applications> nommée « Nightfury.gg ».
2. Copiez son **Application ID** dans `src/main/discord-config.ts` (ce n'est *pas* un secret).
3. Dans **Rich Presence → Art Assets**, uploadez l'icône dragon sous le nom `logo`.
4. Activez la présence Discord dans l'onglet **Options**.
</details>

<details>
<summary><b>Export Google Sheet</b></summary>

1. Ouvrez votre Google Sheet → **Extensions → Apps Script**.
2. Collez le script affiché dans l'onglet **Google Sheet** de l'application, puis enregistrez.
3. **Déployer → Nouveau déploiement → Application web**, accès « Tout le monde ».
4. Copiez l'URL du déploiement et collez-la dans l'application.
</details>

### Avertissement

Nightfury.gg n'est pas approuvé par Riot Games et ne reflète pas les opinions de
Riot Games ni de quiconque impliqué officiellement dans la production ou la gestion
de League of Legends. League of Legends et Riot Games sont des marques ou des
marques déposées de Riot Games, Inc.

### Licence

Distribué sous [licence MIT](LICENSE).
