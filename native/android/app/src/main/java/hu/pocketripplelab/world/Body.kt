package hu.pocketripplelab.world

import hu.pocketripplelab.gl.Eye
import hu.pocketripplelab.gl.Quat
import hu.pocketripplelab.gl.Vec3
import hu.pocketripplelab.gl.cross
import hu.pocketripplelab.gl.normalize
import hu.pocketripplelab.gl.qAxisAngle
import hu.pocketripplelab.gl.qIntegrate
import hu.pocketripplelab.gl.qMul
import hu.pocketripplelab.gl.qNorm
import hu.pocketripplelab.gl.qRot
import hu.pocketripplelab.gl.qYawPitchRoll
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

private const val G = 2400f // px/s^2

/** Water surface normal (world frame) from the sim's height gradient (gx along x, gy along screen-down y). */
fun surfaceNormal(gx: Float, gy: Float): Vec3 {
    val k = 0.3f
    val m = 0.5f // small objects ride the wave slope, but only so far
    return normalize(Vec3(clamp(-gx * k, -m, m), clamp(gy * k, -m, m), 1f))
}

/** Yaw of the body's forward axis in the world frame (0 = +x, counter-clockwise with y up). */
fun yawOf(q: Quat): Float {
    val f = qRot(q, Vec3(1f, 0f, 0f))
    return atan2(f.y, f.x)
}

/** World-z rotation of the whole body, keeping its tilt. */
fun turnBy(q: Quat, dyaw: Float): Quat = qNorm(qMul(qAxisAngle(0f, 0f, 1f, dyaw), q))

/** A thrown / dropped toy tumbles a little in the direction it moves; harder when it is fast. */
fun tumble(t: Thing, speedScale: Float = 1f) {
    val k = speedScale / (1.8f * t.r)
    t.w = Vec3(
        t.w.x + t.vy * k * 0.9f + (Random.nextFloat() - 0.5f) * 2f,
        t.w.y + t.vx * k * 0.9f + (Random.nextFloat() - 0.5f) * 2f,
        t.w.z,
    )
}

/**
 * One physics step of a floating toy's body: buoyancy along z, a righting torque toward the water surface
 * (or, while held, toward a lean opposite to the motion), free rolling for the ball and yaw that follows the heading.
 * The phone's tilt is deliberately not an input: it only moves the camera.
 */
fun stepBody(t: Thing, dt: Float, gx: Float, gy: Float, splash: (Float) -> Unit) {
    val b = bodyOf(t.kind)
    val speed = hypot(t.vx, t.vy)
    val vx = t.vx
    val vy = -t.vy // world frame (y up)
    val rest = hEq(t)
    val held = t.grabbed != null

    // --- vertical: buoyancy / free fall / being held up
    if (held) {
        val lift = rest + t.r * (0.7f + min(0.6f, speed / 900f))
        t.h += (lift - t.h) * min(1f, dt * 14f)
        t.hv = 0f
        t.air = true
    } else {
        val hT = rest + clamp(t.lift * 0.015f, -0.06f, 0.08f) * t.r * 2f // bobs with the wave under it
        val dr = max(1f, b.draft * t.r)
        val n = max(1, ceil(dt / (1f / 120f)).toInt())
        val hs = dt / n
        for (i in 0 until n) {
            val buoy = G * clamp(1f + (hT - t.h) / dr, 0f, 7f)
            val submerged = t.h < hT + dr
            val drag = if (submerged) 9f + 0.006f * abs(t.hv) else 0.05f
            t.hv += (-G + buoy - drag * t.hv) * hs
            t.h += t.hv * hs
            if (!submerged && !t.air) t.air = true
            if (submerged && t.air) {
                // Back in the water: splash and a kick that depends on how hard it came down.
                t.air = false
                val hit = max(0f, -t.hv)
                if (hit > 120f) {
                    splash(clamp(hit * 0.012f, 1.5f, 8f))
                    val a = Random.nextFloat() * 2f * PI.toFloat()
                    val k = min(3f, hit * 0.0035f) * (if (b.kr > 0f) 1f else 0.4f)
                    t.w = Vec3(t.w.x + cos(a) * k, t.w.y + sin(a) * k, t.w.z)
                    t.hv *= 0.35f
                }
            }
        }
    }

    // --- orientation
    val n = if (gx == 0f && gy == 0f) Vec3(0f, 0f, 1f) else surfaceNormal(gx, gy)
    // while held, the top lags behind the hand
    val target = if (held) normalize(Vec3(n.x - vx * 0.0006f, n.y - vy * 0.0006f, 1f)) else n
    val sub = 6
    val hs = dt / sub
    var wx = t.w.x
    var wy = t.w.y
    var wz = t.w.z
    var q = t.q
    for (i in 0 until sub) {
        if (b.kr > 0f) {
            val up = qRot(q, Vec3(0f, 0f, 1f))
            val tau = cross(up, target)
            val k = if (held) b.kr * 1.4f else b.kr
            wx += tau.x * k * hs
            wy += tau.y * k * hs
            wz += tau.z * k * hs
        }
        val dxy = exp(-b.cd * hs)
        val dz = exp(-b.cy * hs)
        wx *= dxy
        wy *= dxy
        wz *= dz
        q = qIntegrate(q, Vec3(wx, wy, wz), hs)
    }
    if (t.kind == Kind.BALL && !held && !t.air) {
        // A floating ball rolls along with its drift: spin follows the motion.
        val r = 0.9f * t.r
        val wantX = -vy / r * 0.85f
        val wantY = vx / r * 0.85f
        val k = 1f - exp(-3f * dt)
        wx += (wantX - wx) * k
        wy += (wantY - wy) * k
    }
    t.w = Vec3(wx, wy, wz)
    t.q = q
    // heading: the duck, boat and ring turn (about the vertical axis) toward the heading the physics picked
    if (t.kind != Kind.BALL) {
        val d = angDiff(yawOf(t.q), -t.angle)
        t.q = turnBy(t.q, d * min(1f, dt * (if (held) 12f else 6f)))
    }
}

/** How much of the baked swim motion a fish shows: a gentle sway at rest, the full swing only when it speeds up. */
fun swimAmp(speed: Float): Float = clamp(0.15f + speed / 190f, 0.15f, 1f)

/** Where a thing is in the world and how it is oriented. */
class Pose(val px: Float, val py: Float, val pz: Float, val q: Quat, val scale: Float)

/** Fish: heading, pitch with their climb, bank into turns. Toys: their body state. */
fun poseOf(t: Thing, eye: Eye): Pose {
    if (t.kind.isFish) {
        val depth = t.z * eye.floor * 0.85f
        val pitch = clamp(t.zv * 0.9f, -0.5f, 0.5f)
        val roll = clamp(t.turn * 0.2f, -0.7f, 0.7f)
        return Pose(t.x, -t.y, -(depth + 0.12f * t.r), qYawPitchRoll(-t.angle, pitch, roll), t.r * fishLen(t.kind))
    }
    return Pose(t.x, -t.y, t.h, t.q, t.r)
}
