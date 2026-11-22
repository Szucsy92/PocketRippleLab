package hu.pocketripplelab.gl

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/** Tiny vector / quaternion / matrix helpers. World = right-handed: x right, y up on screen, z toward the viewer. */
class Vec3(val x: Float, val y: Float, val z: Float)

class Quat(val x: Float, val y: Float, val z: Float, val w: Float)

val Q_IDENTITY = Quat(0f, 0f, 0f, 1f)

fun qMul(a: Quat, b: Quat): Quat = Quat(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
)

fun qNorm(q: Quat): Quat {
    var l = sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w)
    if (l == 0f) l = 1f
    return Quat(q.x / l, q.y / l, q.z / l, q.w / l)
}

fun qAxisAngle(x: Float, y: Float, z: Float, a: Float): Quat {
    val s = sin(a / 2f)
    return Quat(x * s, y * s, z * s, cos(a / 2f))
}

/** Rotate a vector by a unit quaternion. */
fun qRot(q: Quat, v: Vec3): Vec3 {
    val tx = 2f * (q.y * v.z - q.z * v.y)
    val ty = 2f * (q.z * v.x - q.x * v.z)
    val tz = 2f * (q.x * v.y - q.y * v.x)
    return Vec3(
        v.x + q.w * tx + (q.y * tz - q.z * ty),
        v.y + q.w * ty + (q.z * tx - q.x * tz),
        v.z + q.w * tz + (q.x * ty - q.y * tx),
    )
}

/** Integrate a world-frame angular velocity (rad/s) over dt. */
fun qIntegrate(q: Quat, w: Vec3, dt: Float): Quat {
    val dq = qMul(Quat(w.x, w.y, w.z, 0f), q)
    return qNorm(Quat(q.x + 0.5f * dt * dq.x, q.y + 0.5f * dt * dq.y, q.z + 0.5f * dt * dq.z, q.w + 0.5f * dt * dq.w))
}

/** Yaw about world z, then pitch about the body's left axis (+ = nose down), then roll about its forward axis (+ = right side down). */
fun qYawPitchRoll(yaw: Float, pitch: Float, roll: Float): Quat =
    qNorm(qMul(qMul(qAxisAngle(0f, 0f, 1f, yaw), qAxisAngle(0f, 1f, 0f, pitch)), qAxisAngle(1f, 0f, 0f, roll)))

fun qRandom(): Quat {
    val u1 = Random.nextFloat()
    val u2 = Random.nextFloat() * 2f * PI.toFloat()
    val u3 = Random.nextFloat() * 2f * PI.toFloat()
    val a = sqrt(1f - u1)
    val b = sqrt(u1)
    return Quat(a * sin(u2), a * cos(u2), b * sin(u3), b * cos(u3))
}

fun cross(a: Vec3, b: Vec3): Vec3 = Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)

fun normalize(v: Vec3): Vec3 {
    var l = sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
    if (l == 0f) l = 1f
    return Vec3(v.x / l, v.y / l, v.z / l)
}

/** Model matrix = translate(pos) * rotate(q) * scale(s), written into `out` (column-major, 16 floats). */
fun modelMatrix(out: FloatArray, px: Float, py: Float, pz: Float, q: Quat, s: Float) {
    val x = q.x
    val y = q.y
    val z = q.z
    val w = q.w
    val xx = x * x
    val yy = y * y
    val zz = z * z
    val xy = x * y
    val xz = x * z
    val yz = y * z
    val wx = w * x
    val wy = w * y
    val wz = w * z
    out[0] = (1f - 2f * (yy + zz)) * s; out[1] = 2f * (xy + wz) * s; out[2] = 2f * (xz - wy) * s; out[3] = 0f
    out[4] = 2f * (xy - wz) * s; out[5] = (1f - 2f * (xx + zz)) * s; out[6] = 2f * (yz + wx) * s; out[7] = 0f
    out[8] = 2f * (xz + wy) * s; out[9] = 2f * (yz - wx) * s; out[10] = (1f - 2f * (xx + yy)) * s; out[11] = 0f
    out[12] = px; out[13] = py; out[14] = pz; out[15] = 1f
}

/** Rotation part only, as a 3x3 column-major matrix (9 floats). */
fun rotationMatrix3(out: FloatArray, q: Quat) {
    val x = q.x
    val y = q.y
    val z = q.z
    val w = q.w
    val xx = x * x
    val yy = y * y
    val zz = z * z
    val xy = x * y
    val xz = x * z
    val yz = y * z
    val wx = w * x
    val wy = w * y
    val wz = w * z
    out[0] = 1f - 2f * (yy + zz); out[1] = 2f * (xy + wz); out[2] = 2f * (xz - wy)
    out[3] = 2f * (xy - wz); out[4] = 1f - 2f * (xx + zz); out[5] = 2f * (yz + wx)
    out[6] = 2f * (xz + wy); out[7] = 2f * (yz - wx); out[8] = 1f - 2f * (xx + yy)
}

/**
 * Off-axis "window" projection: the screen rectangle (0..W, 0..H, y down) is the opening of the pool, the eye sits at
 * (ex, ey) in screen px and h px above the surface. A point at height z above the surface lands where the ray from the
 * eye through it crosses the screen plane. World y is up, so a screen y is -y.
 */
fun viewProj(out: FloatArray, w: Float, h: Float, ex: Float, ey: Float, eh: Float) {
    val hw = w / 2f
    val hh = h / 2f
    out[0] = eh / hw; out[4] = 0f; out[8] = -(ex - hw) / hw; out[12] = -eh
    out[1] = 0f; out[5] = eh / hh; out[9] = (ey - hh) / hh; out[13] = eh
    out[2] = 0f; out[6] = 0f; out[10] = -1f; out[14] = 0f
    out[3] = 0f; out[7] = 0f; out[11] = -1f; out[15] = eh
}

fun clampF(v: Float, lo: Float, hi: Float): Float = max(lo, min(hi, v))
