# Bounce Blitz V2 Design Roadmap

This document turns the current design review into an implementation-facing plan.

The goal is not to turn Bounce Blitz into a clone of another survivor or arena game.
The goal is to sharpen what is already special here:

- high-speed drift and wall-bounce movement
- dash-driven kill routing
- authored boss and stage identity
- powers that read clearly and combine into memorable runs

The next step is to make the game feel more like a tactical arena action game and less like a purely scaling survival game.

## Reference Direction

Use these games as directional references, not templates to copy:

- Hades: each encounter has a readable tactical thesis
- Returnal: arenas create movement questions, not just danger
- Enter the Gungeon: spatial reads matter as much as reflexes
- Nuclear Throne: target priority and route commitment matter
- Brotato: builds become legible archetypes early
- Vampire Survivors: escalation is readable and satisfying

## Core Design Pillars

1. Every wave should ask a question.
2. Every arena template should support a tactical verb.
3. Every build should feel like a lane, not just a pile of upgrades.
4. Difficulty should come from composition and space, not only scalar pressure.
5. The player should increasingly think "I know what this wave wants from me."

## Current Strength To Preserve

- Drift plus dash plus bounce creates real expression.
- Arena modifiers already hint at tactical combat spaces.
- Enemy roster has strong behavioral contrast.
- Bosses have authored identity.
- Powers and evolutions are flavorful and readable.

## Main Problems To Solve

### 1. Wave identity flattens too early

After the early game, the mix becomes more about "more things, faster" than "different problem."

### 2. Arena templates decorate more than they define

Templates are strong shapes, but wave compositions are not yet tightly paired to them.

### 3. Build strategy is too front-loaded

Once the player reaches the slot cap, they mostly reinforce early choices instead of pivoting into late-run solutions.

### 4. Logic-solving moments are too rare

The player often wins by execution and raw build power. We want more moments where the right route, target, and angle are the answer.

## Encounter Grammar

Use these tactical verbs across wave and stage design:

- Funnel: force enemies into predictable lanes
- Rotate: make the player cycle around the arena
- Hold Center: center is strong but dangerous
- Break Formation: kill priority enemies before the pack collapses
- Reflect: use pads or bouncers as intentional tools
- Kite: keep distance while preserving a future escape path
- Collapse: a space gets worse over time and must be abandoned

Use these pressure verbs for enemy composition:

- Chase: trackers, bombers
- Zone: pulsers, hazard fields, snipers
- Scatter: splitters, teleporters
- Flood: spawners, minions
- Ambush: teleporters plus snipers
- Screen Control: shields plus bombers plus hazards

The best wave setups combine one tactical verb with one pressure verb.

## Arena Design Revision

Each template should have:

- one obvious safe route
- one greedy route with higher kill potential
- one environmental tool that rewards mastery
- one failure case that is readable before it kills you

### Existing Template Notes

- Corridor: good for lane timing, sniper reads, tracker funnels
- FourCorners: good for perimeter rotation and center risk
- Cross: good for center denial and teleporter pressure
- Ring: good for splitter cleanup and escape planning
- Gauntlet: good for route commitment and hazard prediction
- Fortress: good for spawner shells and shell-cracking decisions
- Labyrinth: good for late-game rotation pressure, but should become more legible

### New Template Set To Add

#### SplitField

Intent:
- two mostly safe halves
- one exposed crossing lane

Best with:
- snipers
- bombers
- shielded elites

Question:
- when do I cross, and what must die before I do?

#### Spiral

Intent:
- smooth survival path
- dangerous inner shortcuts

Best with:
- trackers
- splitters
- teleporters

Question:
- do I play safe on the outer route or cut inward for tempo?

#### Pinch

Intent:
- center is lethal over time
- perimeter is safe but slow

Best with:
- pulsers
- spawners
- bombers

Question:
- when do I give up center control?

#### Reflection Chamber

Intent:
- flat bouncers and pads matter as tools

Best with:
- snipers
- teleporters
- bombers

Question:
- can I solve this faster by using the arena instead of avoiding it?

## Arena Event Layer

Add a light "wave mutation" layer for selected mid and late waves.

Rules:

- only one event at a time
- telegraph clearly
- event should change routing, not create chaos for its own sake

Event types:

- Shift: one obstacle slides to a new position
- Ignite: one hazard zone pulses active and inactive
- Collapse: a safe lane becomes bad after a delay
- Open: a pillar breaks or retracts, creating a new route
- Revector: a bounce pad changes launch direction

These events should begin around wave 12 and become more common from wave 18 onward.

## Authored 30-Wave Progression

This section is the implementation target for story mode.

Columns:

- Template: the arena layout to use
- Composition: primary enemy mix and role
- Tactical Ask: what the player should learn or prove
- Notes: pacing, modifiers, or authored rule

| Wave | Template | Composition | Tactical Ask | Notes |
| --- | --- | --- | --- | --- |
| 1 | None | Drifters | Learn drift and bounce | Keep arena mostly empty |
| 2 | None | Drifters, light Trackers | Dash timing and recovery | Very low spawn density |
| 3 | None | Trackers | Keep moving with intent | End tutorial feel here |
| 4 | Corridor | Trackers, Drifters | Use lanes, do not over-rotate | First real geometry read |
| 5 | FourCorners | Trackers, Splitters | Clean up fragments without losing route | First meaningful split pressure |
| 6 | Tunnels | Splitters, Trackers | Route before kill greed | Introduce route commitment |
| 7 | Cross | Pulsers, Trackers | Respect center denial | First zoning wave |
| 8 | Diamond | Teleporters, Splitters | Read enemy relocation and fragment cleanup | First fake-outs |
| 9 | Corridor | Bombers, Trackers, light Shields | Choose kill priority | Pre-boss exam |
| 10 | The Nest | Hive Queen | Cover, side launch pads, swarm control | Keep intro strong but fast |
| 11 | Ring | Splitters, Snipers | Protect the outer route | Post-boss reset with a new question |
| 12 | Fortress | Spawner, Trackers, Shields | Crack the shell before the arena fills | First special rule wave |
| 13 | Gauntlet | Bombers, Pulsers | Commit to a route and keep it | Add first arena event |
| 14 | Zigzag | Teleporters, Snipers | Cross lines only when safe | Strong positioning wave |
| 15 | Arena | Splitters, Bombers, Shields | Decide between safe path and fast path | End of mid-game arc test |
| 16 | Reflection Chamber | Snipers, Teleporters | Use deflectors and pads intentionally | First explicit geometry-tool wave |
| 17 | Fortress | Spawner, Bombers, Minions | Solve target hierarchy fast | Flood management |
| 18 | SplitField | Snipers, Bombers, Trackers | Time crossings | Add pulsing hazard event |
| 19 | Labyrinth | Teleporters, Pulsers, Shields | Preserve escape vectors | Pre-boss attrition exam |
| 20 | The Processor | Nexus Core | Rotation, shockwave timing, safe repositioning | Should feel sharper than wave 10 |
| 21 | Pinch | Pulsers, Trackers | When to abandon center | Start Void Approaches spatial dread |
| 22 | Spiral | Splitters, Teleporters | Safe route versus tempo route | Faster but legible |
| 23 | Arena | Bombers, Snipers, Shields | Kill the line-breakers first | Strong panic temptation |
| 24 | Reflection Chamber | Snipers, Bombers, Teleporters | Master the environment, not just movement | High clarity special wave |
| 25 | SplitField | Spawner, Minions, Shields | Break the anchor, then cross | One elite anchor composition |
| 26 | Labyrinth | Pulsers, Teleporters, Bombers | Read dead zones before they trap you | Add one obstacle shift |
| 27 | Pinch | Shields, Trackers, Snipers | Risk management under low space | Fewer enemies, harsher decisions |
| 28 | Spiral | Splitters, Bombers, Spawners | Multi-problem solve under tempo | Greedy route should be tempting |
| 29 | The Rift Lite | Teleporters, Pulsers, Snipers, Shields | Final exam before boss | Feels like the world failing |
| 30 | The Rift | Void Warden | Full-space mastery | Final boss should feel earned, not random |

## Special Wave Types

Insert these as authored composition presets, not random modifiers.

### Hunter Wave

- Template: open or lane-based
- Enemies: Trackers, Snipers
- Purpose: movement discipline and line management

### Shield Wall

- Template: Fortress or SplitField
- Enemies: Shielded Drifters, Shielded Trackers, one Spawner
- Purpose: target priority and route patience

### Bomber Escort

- Template: Corridor or Arena
- Enemies: Bombers protected by Trackers or Shielded enemies
- Purpose: identify and remove the actual threat source

### Reflection Test

- Template: Reflection Chamber
- Enemies: Snipers, Teleporters
- Purpose: make the player use geometry on purpose

### Flood Wave

- Template: Fortress or Labyrinth
- Enemies: Spawner, Minions, Splitters
- Purpose: solve tempo, not just survival

### Collapse Wave

- Template: Pinch or Spiral
- Enemies: Pulsers plus hazard event
- Purpose: space degrades over time, forcing proactive rotation

## Build Archetype Rebalance

The game should bias toward build lanes without becoming deterministic.

### Archetypes

#### Dash Assassin

Core:
- Surge
- Dash Burst
- Chain Lightning
- Thunder Dash

Fantasy:
- burst routing and aggressive movement

Need:
- stronger reward for committing to aggressive line-breaking

#### Orb Fortress

Core:
- Shield
- Shell Guard
- Stamina Overflow
- Nova Core

Fantasy:
- safe space control and defensive conversion into offense

Need:
- less passive safety, more "convert defense into chosen timing"

#### Control Mage

Core:
- Magnet
- Time Warp
- Gravity Bomb

Fantasy:
- sculpt enemy movement and create kill fields

Need:
- clearer payoffs for grouping and sequencing

#### Harvest Sustain

Core:
- Soul Harvest
- Shield
- Magnet
- Stamina Overflow

Fantasy:
- win through tempo and consistency

Need:
- avoid being the obvious safe default lane

## Offering System Changes

### Goals

- preserve the joy of discovery
- reduce "safe passive stack is always right"
- let late game still pivot a run

### Recommended Changes

1. Add lane bias, not lane lock.
   - If the player already holds two powers from a lane, increase weight for adjacent lane powers by a moderate amount.

2. Add one "wildcard pivot" slot from wave 12 onward.
   - Even at slot cap, occasionally offer a power that replaces a low-level base power or merges into a reroute choice.

3. Add build rescue offers.
   - If the player is weak on damage, offer tempo or clear.
   - If the player is weak on defense, offer routing or sustain.

4. Reduce passive-defense overrepresentation.
   - Shield, Shell Guard, and Stamina Overflow should not cluster too freely in early runs.

5. Make evolutions more lane-defining.
   - Evolution should feel like a strategic lock-in and power spike, not only a strict upgrade.

## Power Tuning Recommendations

### Shield

Current issue:
- too generically good

Change:
- keep it strong, but make charge refresh or block timing more visible and less "always correct"

### Shell Guard

Current issue:
- very high comfort and strong autopilot defense

Change:
- preserve identity, but make orb spacing, downtime, or detonation timing more meaningful

### Magnet

Current issue:
- utility is strong, but tactical expression could be stronger

Change:
- improve grouping payoff for Gravity Bomb and Time Warp adjacent play

### Stamina Overflow

Current issue:
- almost always attractive because it supports the core fantasy directly

Change:
- keep it desirable, but tune its dash-cost reduction to avoid crowding out more expressive picks

### Soul Harvest

Current issue:
- sustain lane can become a default safety answer

Change:
- make the sustain feel earned through kill rhythm, not passive inevitability

### Time Warp

Current issue:
- strong control identity, but can read as "generic slow field"

Change:
- add stronger combo payoff with hazard and grouped-kill play

## Boss Flow Revision

Keep:

- intro card
- boss-specific arena
- first-time tutorial

Change:

- shorten ready-state downtime
- skip tutorial entirely after first encounter
- let boss intros preserve more immediate momentum

## Implementation Order

### Phase 1: Authored Wave Identity

- revise story-mode wave compositions
- map each wave to a tactical ask
- add special wave presets

### Phase 2: Arena As Tool

- add new templates
- add one event layer
- make bounce pads and bouncers matter more intentionally

### Phase 3: Build Lane Pass

- add offering bias rules
- reduce early passive-stack dominance
- improve lane readability in pause and power select

### Phase 4: Boss Flow Pass

- shorten non-interactive boss flow
- sharpen phase-specific arena asks

## Success Criteria

The redesign is working if:

- players can describe why a wave killed them in tactical terms
- different waves feel meaningfully different even at similar difficulty
- arena layouts change decisions, not just visuals
- builds become recognizable archetypes by the midgame
- late story waves feel authored, not merely inflated

## Short Version

The game does not need more content first.
It needs stronger authored combat language.

The fastest win is:

1. authored 30-wave progression
2. template plus composition pairing
3. special wave types
4. lane-aware offering rebalance

That is the path from "good, stylish survivor" to "memorable tactical action roguelite."
