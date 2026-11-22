package hu.pocketripplelab.water

import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

private fun smoothstep(edge0: Float, edge1: Float, x: Float): Float {
    val t = max(0f, min(1f, (x - edge0) / (edge1 - edge0)))
    return t * t * (3f - 2f * t)
}

/**
 * Height-field wave simulation (discrete wave equation, c^2 = 0.5, stable for this stencil).
 * The edges mirror their own value (Neumann boundary), so waves reflect off the screen edges.
 */
class WaterSim(val w: Int, val h: Int) {
    var cur = FloatArray(w * h)
    var prev = FloatArray(w * h)
    var damping = 0.994f

    private class Current(val x: Float, val y: Float, val radius: Float, val strength: Float, var age: Float)

    private val currents = ArrayList<Current>()

    fun step() {
        val c = cur
        val p = prev
        for (y in 0 until h) {
            val row = y * w
            val up = if (y > 0) -w else 0
            val dn = if (y < h - 1) w else 0
            for (x in 0 until w) {
                val i = row + x
                val l = if (x > 0) i - 1 else i
                val r = if (x < w - 1) i + 1 else i
                p[i] = ((c[l] + c[r] + c[i + up] + c[i + dn]) * 0.5f - p[i]) * damping
            }
        }
        cur = p
        prev = c
    }

    /** A broad, soft impact bowl with a subtle displaced-water lip. A negative strength pushes the centre down. */
    fun disturb(cx: Float, cy: Float, radius: Float, strength: Float) {
        val r = max(1f, radius)
        val extent = r * 1.18f
        val x0 = max(0, floor(cx - extent).toInt())
        val x1 = min(w - 1, ceil(cx + extent).toInt())
        val y0 = max(0, floor(cy - extent).toInt())
        val y1 = min(h - 1, ceil(cy + extent).toInt())
        for (y in y0..y1) {
            for (x in x0..x1) {
                val d = hypot(x - cx, y - cy) / r
                if (d >= 1.18f) continue
                val bowl = 1f - smoothstep(0.28f, 1.0f, d)
                val rimDist = (d - 0.88f) / 0.19f
                val rim = exp(-rimDist * rimDist) * 0.24f
                cur[y * w + x] += strength * (bowl - rim)
            }
        }
    }

    /** A localized tangential current accompanies a moving finger, without foam. */
    fun swirl(x: Float, y: Float, dx: Float, dy: Float) {
        val speed = hypot(dx, dy)
        if (speed < 0.05f) return
        val sign = if (dx + dy >= 0f) 1f else -1f
        currents.add(Current(x, y, 20f, sign * min(20f, speed * 0.9f), 0f))
        if (currents.size > 48) currents.removeAt(0)
        val nx = -dy / speed
        val ny = dx / speed
        val force = min(0.5f, speed * 0.025f)
        disturb(x + nx * 4f, y + ny * 4f, 5f, force)
        disturb(x - nx * 4f, y - ny * 4f, 5f, -force)
    }

    fun ageCurrents(dt: Float) {
        for (c in currents) c.age += dt
        currents.removeAll { it.age >= 3.5f }
    }

    /** Current velocity at (x, y) in sim cells; written into out[0], out[1]. */
    fun flow(x: Float, y: Float, out: FloatArray) {
        var vx = 0f
        var vy = 0f
        for (c in currents) {
            val dx = x - c.x
            val dy = y - c.y
            val falloff = exp(-(dx * dx + dy * dy) / (c.radius * c.radius) - c.age * 1.4f)
            vx -= dy / c.radius * c.strength * falloff
            vy += dx / c.radius * c.strength * falloff
        }
        out[0] = vx
        out[1] = vy
    }

    fun sample(x: Float, y: Float): Float {
        val fx = min(w - 1.001f, max(0f, x))
        val fy = min(h - 1.001f, max(0f, y))
        val ix = fx.toInt()
        val iy = fy.toInt()
        val tx = fx - ix
        val ty = fy - iy
        val i = iy * w + ix
        val a = cur[i] + (cur[i + 1] - cur[i]) * tx
        val b = cur[i + w] + (cur[i + w + 1] - cur[i + w]) * tx
        return a + (b - a) * ty
    }

    /** Height gradient at (x, y); written into out[0], out[1]. */
    fun gradient(x: Float, y: Float, out: FloatArray) {
        out[0] = (sample(x + 1f, y) - sample(x - 1f, y)) * 0.5f
        out[1] = (sample(x, y + 1f) - sample(x, y - 1f)) * 0.5f
    }

    fun clear() {
        cur.fill(0f)
        prev.fill(0f)
        currents.clear()
    }
}
