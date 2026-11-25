package hu.pocketripplelab.world

import hu.pocketripplelab.water.WaterSim
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign
import kotlin.math.sin
import kotlin.random.Random

/** Fish personalities: cruise / flee speeds. */
class FishSpeed(val cruise: Float, val flee: Float)

fun fishSpeed(k: Kind): FishSpeed = if (k == Kind.ALIEN) FishSpeed(48f, 420f) else FishSpeed(55f, 480f)

enum class Mode { FLEE, COME, CRUISE }

class Intent(val vx: Float, val vy: Float, val mode: Mode)

/** Pure decision: where does a fish want to go? Returns a desired velocity. */
fun fishIntent(kind: Kind, fx: Float, fy: Float, touches: List<Touch>, fear: Float): Intent {
    val sp = fishSpeed(kind)
    var near: Touch? = null
    var nd = Float.POSITIVE_INFINITY
    for (t in touches) {
        val d = hypot(t.x - fx, t.y - fy)
        if (d < nd) { nd = d; near = t }
    }
    if (near != null && near.speed > 60f && nd < 420f) {
        val k = sp.flee / max(1f, nd)
        return Intent((fx - near.x) * k, (fy - near.y) * k, Mode.FLEE)
    }
    if (fear > 0.25f) return Intent(0f, 0f, Mode.FLEE)
    if (near != null) {
        val k = min(1f, max(0f, nd - 60f) / 200f) * 160f / max(1f, nd)
        return Intent((near.x - fx) * k, (near.y - fy) * k, Mode.COME)
    }
    return Intent(0f, 0f, Mode.CRUISE)
}

/** Fish personalities beyond speed: turning, schooling, how often they surface, rest or investigate, and depth range. */
class Trait(val turn: Float, val school: Float, val surface: Float, val rest: Float, val curious: Float, val zMin: Float, val zMax: Float)

fun fishTrait(k: Kind): Trait =
    if (k == Kind.ALIEN) Trait(1.9f, 0.3f, 0.12f, 0.18f, 0.3f, 0.4f, 0.9f)
    else Trait(2.4f, 0.8f, 0.22f, 0.14f, 0.25f, 0.35f, 0.85f)

enum class Action { SURFACE, REST, INSPECT, SWIM }

class Decision(val action: Action, val z: Float)

/**
 * Pure: what does an idle fish do next? Rolls r1 / r2 are in 0..1.
 * SURFACE = come up for a gulp, REST = hover, INSPECT = follow a toy.
 */
fun fishDecision(kind: Kind, r1: Float, r2: Float, hasTarget: Boolean): Decision {
    val tr = fishTrait(kind)
    val depth = tr.zMin + (tr.zMax - tr.zMin) * r2
    if (r1 < tr.surface) return Decision(Action.SURFACE, 0.03f)
    if (r1 < tr.surface + tr.rest) return Decision(Action.REST, depth)
    if (hasTarget && r1 < tr.surface + tr.rest + tr.curious) return Decision(Action.INSPECT, 0.55f)
    return Decision(Action.SWIM, depth)
}

private fun nearest(t: Thing, list: List<Thing>, maxD: Float, ok: (Thing) -> Boolean): Thing? {
    var best: Thing? = null
    var bd = maxD
    for (o in list) {
        if (o === t || !ok(o)) continue
        val d = hypot(o.x - t.x, o.y - t.y)
        if (d < bd) { bd = d; best = o }
    }
    return best
}

private val grad = FloatArray(2)
private val flowV = FloatArray(2)

fun updateFish(t: Thing, world: World, sim: WaterSim, dt: Float) {
    val kind = t.kind
    val width = world.width
    val height = world.height
    val cell = world.cell
    val things = world.things
    val touches = world.touches
    val tr = fishTrait(kind)
    val spd = fishSpeed(kind)
    val sx = t.x / cell
    val sy = t.y / cell
    t.phase += dt
    val h = abs(sim.sample(sx, sy))
    sim.gradient(sx, sy, grad)
    val gx = grad[0]
    val gy = grad[1]
    sim.flow(sx, sy, flowV)
    val fx = flowV[0]
    val fy = flowV[1]
    // Rough water scares the gentle fish; deep fish feel the surface less.
    t.fear = min(1f, t.fear + max(0f, h * (1f - 0.5f * t.z) - 0.8f) * dt * 3f)
    t.fear *= exp(-dt * 0.8f)
    t.mind -= dt
    t.restT = max(0f, t.restT - dt)
    t.boost = max(0f, t.boost - dt)

    val intent = fishIntent(kind, t.x, t.y, touches, t.fear)
    var mode = intent.mode
    var dvx = intent.vx
    var dvy = intent.vy
    var nearFinger = Float.POSITIVE_INFINITY
    for (p in touches) nearFinger = min(nearFinger, hypot(p.x - t.x, p.y - t.y))

    // Idle brain: now and then surface for a gulp, hover, follow a toy or pick a new depth.
    if (t.mind <= 0f && mode == Mode.CRUISE) {
        t.mind = 2f + Random.nextFloat() * 4f
        val target = nearest(t, things, 600f) { o -> !o.kind.isFish }
        val d = fishDecision(kind, Random.nextFloat(), Random.nextFloat(), target != null)
        t.focus = null
        t.zGoal = d.z
        when {
            d.action == Action.SURFACE -> t.surfT = 1.6f + Random.nextFloat() * 2.2f
            d.action == Action.REST -> t.restT = 1.5f + Random.nextFloat() * 3f
            d.action == Action.INSPECT && target != null -> {
                t.focus = target.id
                t.mind = 5f + Random.nextFloat() * 3f
            }
        }
    }

    if (mode == Mode.CRUISE) {
        val fid = t.focus
        val tgt: Thing? = if (fid == null) null else things.firstOrNull { it.id == fid }
        if (fid != null && tgt == null) t.focus = null
        if (tgt != null) {
            // Curious: circle slowly around a toy floating above.
            val ang = atan2(t.y - tgt.y, t.x - tgt.x) + 0.9f
            val rr = tgt.r * 0.9f
            dvx = (tgt.x + cos(ang) * rr - t.x) * 1.4f
            dvy = (tgt.y + sin(ang) * rr - t.y) * 1.4f
            val m = hypot(dvx, dvy)
            val cap = spd.cruise * 1.4f
            if (m > cap) { dvx *= cap / m; dvy *= cap / m }
        } else {
            // A smooth meander: the turn rate eases toward a new random target every couple of seconds (no per-frame noise).
            t.wanderT -= dt
            if (t.wanderT <= 0f) {
                t.wanderT = 1.5f + Random.nextFloat() * 2.5f
                t.wanderTarget = (Random.nextFloat() - 0.5f) * 0.9f
            }
            t.wanderRate += (t.wanderTarget - t.wanderRate) * min(1f, dt * 1.2f)
            t.wander += (t.wanderRate + sin(t.phase * 0.37f + t.id) * 0.12f) * dt
            val v = spd.cruise * (if (t.restT > 0f) 0.08f else 1f)
            dvx = cos(t.wander) * v
            dvy = sin(t.wander) * v
            // Light schooling with the own kind at a similar depth.
            var cx = 0f
            var cy = 0f
            var ax = 0f
            var ay = 0f
            var n = 0
            for (o in things) {
                if (o === t || !o.kind.isFish || abs(o.z - t.z) > 0.45f) continue
                val d = hypot(o.x - t.x, o.y - t.y)
                if (d > 320f || d == 0f) continue
                if (o.kind == kind) { cx += o.x; cy += o.y; ax += o.vx; ay += o.vy; n++ }
                val sep = (t.r + o.r) * 1.1f
                if (d < sep) {
                    dvx += ((t.x - o.x) / d) * (sep - d) * 4f
                    dvy += ((t.y - o.y) / d) * (sep - d) * 4f
                }
            }
            if (n > 0) {
                dvx += ((cx / n - t.x) * 0.35f + (ax / n - t.vx) * 0.8f) * tr.school
                dvy += ((cy / n - t.y) * 0.35f + (ay / n - t.vy) * 0.8f) * tr.school
            }
        }
    } else if (mode == Mode.FLEE && dvx == 0f && dvy == 0f) {
        val a = if (hypot(gx, gy) > 1e-3f) atan2(gy, gx) else t.angle
        dvx = cos(a) * spd.flee * 0.8f
        dvy = sin(a) * spd.flee * 0.8f
        t.wander = t.angle
    } else {
        t.wander = t.angle
    }

    // Depth goals: bolt to the deep when scared, rise to a still finger.
    if (mode == Mode.FLEE) { t.surfT = 0f; t.focus = null; t.zGoal = max(t.zGoal, 0.85f) }
    else if (mode == Mode.COME && nearFinger < 260f) { t.zGoal = 0.06f; t.mind = min(t.mind, 1.5f) }
    else if (t.surfT > 0f) t.zGoal = 0.03f

    // Steer away from walls early; a wandering fish also turns its heading back toward open water.
    val m = t.r * 1.9f
    var wpx = 0f
    var wpy = 0f
    if (t.x < m) wpx += (m - t.x) * 5f
    if (t.x > width - m) wpx -= (t.x - width + m) * 5f
    if (t.y < m) wpy += (m - t.y) * 5f
    if (t.y > height - m) wpy -= (t.y - height + m) * 5f
    dvx += wpx
    dvy += wpy
    if (mode == Mode.CRUISE && (wpx != 0f || wpy != 0f)) {
        t.wander += angDiff(t.wander, atan2(wpy + sin(t.wander) * 20f, wpx + cos(t.wander) * 20f)) * min(1f, dt * 3f)
    }

    // Swimming: the desired velocity is smoothed (walls, schooling and the finger would otherwise make the heading
    // twitch; a scared fish reacts fast), the turn rate eases toward what is needed, a sharp turn slows the fish down.
    val fast = mode == Mode.FLEE || t.boost > 0f
    val ks = min(1f, dt * (if (fast) 12f else 3f))
    t.dsx += (dvx - t.dsx) * ks
    t.dsy += (dvy - t.dsy) * ks
    val ds = hypot(t.dsx, t.dsy)
    // Walls, schooling and the finger steer the fish, but cruising never makes it dash: its speed stays near its cruise speed.
    val cap = if (mode == Mode.FLEE) spd.flee else if (mode == Mode.COME) 180f else spd.cruise * 1.4f
    var want = min(ds, cap)
    val turnMax = tr.turn * (if (fast) 3.5f else 1f)
    if (ds > 4f) {
        val dd = angDiff(t.angle, atan2(t.dsy, t.dsx))
        val wd = clamp(dd * (if (fast) 6f else 3f), -turnMax, turnMax) // desired turn rate
        t.turn += (wd - t.turn) * min(1f, dt * (if (fast) 12f else 5f))
        t.angle += t.turn * dt
        if (abs(t.turn) > 0.25f) t.side = sign(t.turn).toInt()
        want *= 0.25f + 0.75f * cos(min(abs(dd), (PI / 2).toFloat()))
    } else {
        t.turn *= exp(-dt * 4f)
        want = 0f
    }
    val kick = if (want > 20f) 1f + 0.08f * sin(t.tail * 2f - 0.8f) else 1f // a faint kick-and-glide
    t.speed += (want * kick - t.speed) * min(1f, dt * (if (fast) 8f else if (want > t.speed) 2.6f else 1.4f))
    t.vx = cos(t.angle) * t.speed
    t.vy = sin(t.angle) * t.speed
    // Only fish near the surface are carried by currents.
    val drift = (1f - t.z) * (1f - t.z) * cell * 1.2f
    t.x = clamp(t.x + (t.vx + fx * drift) * dt, t.r * 0.5f, width - t.r * 0.5f)
    t.y = clamp(t.y + (t.vy + fy * drift) * dt, t.r * 0.5f, height - t.r * 0.5f)
    // Tail beat: slow and steady while cruising, quicker only when the fish really speeds up.
    val hz = min(1.6f, 0.42f + t.speed * 0.005f + (if (fast) 0.3f else 0f))
    t.tail += dt * 2f * PI.toFloat() * hz

    // Depth: a damped spring toward the goal.
    t.zv += ((t.zGoal - t.z) * 6f - t.zv * 3.5f) * dt
    t.z = clamp(t.z + t.zv * dt, 0f, 1f)
    if (t.z <= 0f || t.z >= 1f) t.zv = 0f

    // At the surface: gulps ring the water, a moving fish leaves a faint wake, then it dives back.
    t.bite = max(0f, t.bite - dt * 3f)
    if (t.z < 0.1f) {
        t.popT -= dt
        if (t.popT <= 0f) {
            t.popT = 1.2f + Random.nextFloat() * 0.8f
            t.bite = max(t.bite, 0.7f)
            sim.disturb((t.x + cos(t.angle) * t.r) / cell, (t.y + sin(t.angle) * t.r) / cell, (t.r / cell) * 0.5f, -0.6f)
        }
        t.wakeT -= dt
        if (t.speed > 25f && t.wakeT <= 0f) {
            t.wakeT = 0.09f
            sim.disturb((t.x - cos(t.angle) * t.r * 0.8f) / cell, (t.y - sin(t.angle) * t.r * 0.8f) / cell, (t.r / cell) * 0.45f, -min(0.3f, t.speed * 0.0015f))
        }
    } else if (t.z > 0.3f) {
        t.popT = 0.2f
    }
    if (t.surfT > 0f && t.z < 0.12f) {
        t.surfT -= dt
        if (t.surfT <= 0f) t.zGoal = tr.zMin + (tr.zMax - tr.zMin) * Random.nextFloat()
    }
}
