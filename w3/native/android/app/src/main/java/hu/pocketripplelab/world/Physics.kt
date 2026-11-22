package hu.pocketripplelab.world

import hu.pocketripplelab.water.WaterSim
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

private val tGrad = FloatArray(2)
private val tFlow = FloatArray(2)

/**
 * One step of the whole world. Toys drift with waves and currents and have a real 3D body (buoyancy, wobble, flipping,
 * see Body.kt); fish swim (Fish.kt). The phone's tilt never enters the physics: it only moves the camera.
 */
fun updateThings(world: World, sim: WaterSim, dt: Float) {
    val things = world.things
    val width = world.width
    val height = world.height
    val cell = world.cell
    for (t in things) {
        if (t.kind.isFish) {
            updateFish(t, world, sim, dt)
            continue
        }
        val sx = t.x / cell
        val sy = t.y / cell
        t.phase += dt
        sim.gradient(sx, sy, tGrad)
        val gx = tGrad[0]
        val gy = tGrad[1]
        t.lift += (sim.sample(sx, sy) - t.lift) * min(1f, dt * 12f)
        stepBody(t, dt, gx, gy) { s -> sim.disturb(sx, sy, max(6f, (t.r / cell) * 1.5f), -s) }
        if (t.grabbed != null) continue

        val ph = physOf(t.kind)
        sim.flow(sx, sy, tFlow)
        val fx = tFlow[0]
        val fy = tFlow[1]
        // Wave push grows with the crest's slope, so bigger sweeps carry toys further.
        val ax = -gx * ph.push + fx * cell * ph.flow
        val ay = -gy * ph.push + fy * cell * ph.flow
        val sp0 = hypot(t.vx, t.vy)
        t.wakeT -= dt
        if (sp0 > 25f && t.wakeT <= 0f && !t.air) {
            t.wakeT = 0.05f
            sim.disturb(sx, sy, (t.r / cell) * 1.2f, -min(2.2f, sp0 * 0.005f))
        }

        t.vx += ax * dt
        t.vy += ay * dt
        val k = exp(-ph.drag * dt * (if (t.air) 0.15f else 1f))
        t.vx *= k
        t.vy *= k
        val sp = hypot(t.vx, t.vy)
        if (sp > 1400f) {
            t.vx *= 1400f / sp
            t.vy *= 1400f / sp
        }
        t.x += t.vx * dt
        t.y += t.vy * dt

        fun bounce(v: Float): Float {
            if (abs(v) > 120f) sim.disturb(t.x / cell, t.y / cell, (t.r / cell) * 1.3f, -min(4f, abs(v) * 0.005f))
            if (abs(v) > 200f) tumble(t, 0.25f)
            return -v * 0.45f
        }
        if (t.x < t.r) { t.x = t.r; if (t.vx < 0f) t.vx = bounce(t.vx) }
        if (t.x > width - t.r) { t.x = width - t.r; if (t.vx > 0f) t.vx = bounce(t.vx) }
        if (t.y < t.r) { t.y = t.r; if (t.vy < 0f) t.vy = bounce(t.vy) }
        if (t.y > height - t.r) { t.y = height - t.r; if (t.vy > 0f) t.vy = bounce(t.vy) }

        if (t.kind == Kind.DUCK || t.kind == Kind.BOAT) {
            // Turn to face where it is going.
            if (sp > 12f) {
                var d = atan2(t.vy, t.vx) - t.angle
                d = atan2(sin(d), cos(d))
                t.angle += d * min(1f, dt * (if (t.kind == Kind.BOAT) 2f else 2.6f))
            }
        } else if (t.kind == Kind.RING) {
            // The ring just drifts and turns slowly with the current.
            t.angle += (fx - fy) * dt * 0.02f
        }
    }

    for (i in 0 until things.size) {
        val a = things[i]
        for (j in i + 1 until things.size) {
            val b = things[j]
            if (a.kind.isFish != b.kind.isFish) continue
            if (a.kind.isFish && abs(a.z - b.z) > 0.35f) continue // swimming at different depths: no bump
            val dx = b.x - a.x
            val dy = b.y - a.y
            val d = hypot(dx, dy)
            val minD = a.r + b.r
            if (d > 0f && d < minD) {
                val nx = dx / d
                val ny = dy / d
                val o = (minD - d) / 2f
                a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o
                val rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
                if (rv < 0f) {
                    val imp = -rv * 0.8f
                    a.vx -= nx * imp * 0.5f; a.vy -= ny * imp * 0.5f
                    b.vx += nx * imp * 0.5f; b.vy += ny * imp * 0.5f
                    if (!a.kind.isFish) { tumble(a, 0.2f); tumble(b, 0.2f) }
                }
            }
        }
    }
}
