# Bounce Blitz

**[Play Now](https://x2r0.github.io/bounce-blitz/)**

A fast-paced roguelike arena game where you're a glowing orb bouncing off walls, dashing through enemies, and building wild power combos to survive escalating waves of chaos.

## How to Play

The game is live at **https://x2r0.github.io/bounce-blitz/** — just open it in any modern browser.

For local development, start the dev server:

```bash
python3 serve.py        # serves on http://localhost:8080
python3 serve.py 3000   # or pick a custom port
```

The game uses ES modules so a local server is required — opening `index.html` directly from the filesystem won't work.

You control a bouncing orb in a compact arena. Drift into position, then **dash** through enemies to destroy them. Chain kills together for combo multipliers and collect power-ups to grow stronger each wave.

## Controls

| Action             | Keyboard               | Touch                              |
|--------------------|------------------------|------------------------------------|
| Move               | W/A/S/D or Arrow Keys  | Drag left side of screen (joystick)|
| Tap Dash           | Tap Spacebar           | Tap right side of screen           |
| Charged Dash       | Hold Spacebar          | Hold right side of screen          |
| Pause              | P or Escape            | —                                  |
| Pick Power         | 1 / 2 / 3 / 4          | Tap the card                       |
| Glossary           | G (from title/pause)   | —                                  |
| Upgrades           | U (from title)         | —                                  |
| Loadout            | L (from title)         | —                                  |
| Continue Run       | C (from title)         | —                                  |

## Game Modes

### Story Mode

Fight through **30 waves** of increasingly dangerous enemies. Every 10 waves, face a powerful boss. Clear Wave 30 to complete the story.

### Endless Mode

Unlocked by purchasing the **Endless Mode** upgrade (1000 shards). After Wave 30, the waves keep going — enemies get tougher, bosses cycle back with more HP and speed, and shard rewards increase.

### Hardcore Mode

Unlocked after reaching Wave 15 (costs 250 shards). One hit and you're done — no revives, no healing. Enemies are faster and shields appear earlier, but you earn a **2x score multiplier** and a **1.75x shard bonus** at run end.

## Core Mechanics

**Dashing** is your weapon. Dash into enemies during the brief grace window to destroy them. Each dash costs stamina, which regenerates automatically after a short delay.

**Variable Dash** — tap Space for a quick, low-cost dash, or hold Space to charge up. Charging for up to 0.6 seconds increases dash speed (from 700 to 1100 px/s), widens the kill grace window, and amplifies power effects. The ball glows blue → gold as it charges, and pulses gold at maximum charge. Held longer charges drain more stamina. After releasing a charged dash, there's a brief **recovery window** (green flash) during which only knockback applies — plan your next move before it expires.

**Bouncing** off arena walls preserves most of your speed, keeping you in motion. Upgrades can make your bounces even bouncier.

**Combos** build when you kill enemies in quick succession. Each combo level adds to your score multiplier — chain kills together before the timer runs out.

**Shielded enemies** appear in later waves. They take two hits: one to break the shield, another to kill. Certain powers can pierce shields outright.

## Loadouts

| Loadout       | HP | Stamina | Perk                                        | Score Mult | Unlock          |
|---------------|----|---------|----------------------------------------------|------------|-----------------|
| Standard      | 3  | 100     | —                                            | 1.0x       | Default         |
| Glass Cannon  | 2  | 130     | Starts with Surge L1                         | 1.3x       | 600 shards      |
| Tank          | 5  | 80      | Starts with Shield L1 + Shell Guard L1       | 0.8x       | 1500 shards     |
| Hardcore      | 1  | 100     | No revives, no healing, enemies tougher       | 2.0x       | 250 shards + reach Wave 15 |

## Powers

You collect up to **6 powers** per run. Powers level up (L1 to L3) and persist across waves.

### Common Powers
- **Shield** — Absorbs hits each wave (1/2/3 charges per level)
- **Magnet** — Pulls nearby shard pickups toward you
- **Dash Burst** — Creates an explosion where you start each dash
- **Shell Guard** — Orbiting shells that block hits and detonate on contact; destroyed shells regenerate over time (L1: 8s, L2: 5.5s, L3: 4s)
- **Stamina Overflow** — Increases your max stamina and regen speed
- **Heart** — Instant heal (one-time pickup)

### Rare Powers
- **Surge** — Massive speed boost for several seconds, pierces shields
- **Multi-Pop** — Kills trigger area explosions that chain to nearby enemies
- **Chain Lightning** — Kills bounce to the nearest enemy, then the next
- **Time Warp** — Enemies near you move in slow motion

### Epic Powers
- **Overdrive** — Total invincibility with speed and score bonuses
- **Life Steal** — Chance to heal on kills (disabled in Hardcore)

### Evolution Powers

When you have two specific powers at L2 or higher, you can **evolve** them into a single, devastating ability:

| Evolution          | Requires                     | Effect                                      |
|--------------------|------------------------------|----------------------------------------------|
| Reflective Shield  | Shield + Surge               | Shield blocks emit a kill shockwave           |
| Gravity Bomb       | Magnet + Multi-Pop           | Kills create gravity wells that pull and detonate |
| Thunder Dash       | Surge + Chain Lightning      | Dashes leave a lightning trail that kills on contact |
| Nova Core          | Shell Guard + Dash Burst     | Dashing detonates all orbiting shells         |

## Loot Crate Boosts

Random pickups drop during waves:

- **Screen Nuke** — Damages everything on screen
- **Invincibility** — 5 seconds of total immunity
- **Health Restore** — Heal 2 HP (or bonus score at full health)
- **Point Frenzy** — 3x score multiplier for 8 seconds
- **Stamina Burst** — Full stamina + free dashes for 6 seconds

## Enemies

| Enemy      | Behavior                                                |
|------------|---------------------------------------------------------|
| Drifter    | Floats randomly — your basic target                      |
| Tracker    | Homes in on you — stay moving                            |
| Splitter   | Splits into two smaller enemies on death                 |
| Pulser     | Stationary but dangerous — dash through carefully        |
| Teleporter | Blinks around the arena unpredictably                    |
| Bomber     | Chases you and explodes on death — dash and dodge the blast |
| Spawner    | Tough (2 HP) and spawns minions over time                |
| Sniper     | Hugs the walls and fires a beam after aiming at you       |

## Bosses

Three bosses guard the path through Story Mode:

**The Hive Queen** (Wave 10) — *Mother of Swarms.* Summons waves of minions and charges with devastating swarm dives. Survive the brood.

**The Nexus Core** (Wave 20) — *All Things Combined.* Fires shockwaves, teleports, and spawns mirror copies of itself. Adapts through multiple phases.

**The Void Warden** (Wave 30) — *End of All Runs.* Warps space itself with gravity wells, lightning storms, shrinking safe zones, and mirror clones. Five phases of cosmic mayhem.

In Endless Mode, bosses cycle back every 10 waves with increased HP and speed.

### Boss Arena Templates

Each boss has a dedicated arena layout designed around its attack patterns:

- **The Nest** (Wave 10) — Three pillars for cover, side bounce pads, top hazard zone
- **The Processor** (Wave 20) — Central pillar with diamond-pattern flat bouncers, top/bottom escape pads
- **The Rift** (Wave 30) — Corner void rifts, diagonal launch pads, central deflector corridor

## Stage Arcs (Background Progression)

The arena's visual atmosphere evolves across 6 named stage arcs as you progress:

| Waves | Arc Name | Visual Theme |
|-------|----------|-------------|
| 1–9 | The Awakening | Dark with green grid, faint data motes |
| 10 | Hive Queen's Nest | Warm amber grid, orange spore particles |
| 11–19 | The Deep Grid | Cold blue-black, blue-purple rectangular fragments |
| 20 | Nexus Chamber | Neutral dark, white electrical sparks |
| 21–29 | The Void Approaches | Deep purple-black, slow purple void wisps |
| 30 | The Void | Near-black purple, dark embers rising upward |

Each arc has a unique base fill color, grid color, tint overlay, and ambient particle style. The grid crossfades smoothly at arc boundaries during wave transitions. In Endless Mode, arcs cycle every 10 waves with gradually increasing tint intensity.

## Upgrades & Progression

Earn **shards** by defeating enemies and completing waves. Spend them on permanent upgrades between runs.

Upgrades are organized into 4 tiers — unlock earlier tiers to access later ones:

| Tier | Upgrade          | Cost  | Effect                                    |
|------|------------------|-------|-------------------------------------------|
| 1    | Thick Skin       | 100   | +1 max HP                                 |
| 1    | Quick Feet       | 100   | Faster drift speed                        |
| 1    | Deep Breath      | 75    | +15 max stamina                           |
| 2    | Power Sight      | 200   | See rarity colors on power cards           |
| 2    | Lucky Start      | 250   | Start each run with a random power         |
| 2    | Bouncy Walls     | 150   | Retain more speed on wall bounces          |
| 2    | Shard Magnet     | 300   | +25% shards earned, larger pickup range    |
| 3    | Iron Skin        | 425   | +1 more max HP                            |
| 3    | Dash Master      | 375   | Faster dash cooldown + quicker charge activation |
| 3    | Rare Luck        | 500   | Better chance for rare and epic powers     |
| 3    | Second Wind      | 575   | Revive once per run                        |
| 4    | Evolution Sense  | 700   | See evolution recipes on power cards        |
| 4    | Starting Arsenal | 800   | Choose your starting power                 |
| 4    | Combo King       | 600   | Longer combo timer                         |
| 4    | Endless Mode     | 1000  | Play past Wave 30                          |

## Save System

Your run auto-saves after each wave. If you close the browser, press **C** from the title screen to resume where you left off. Shards and upgrades are saved permanently.
