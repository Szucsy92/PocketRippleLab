package hu.pocketripplelab.world

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

fun clamp(v: Float, lo: Float, hi: Float): Float = max(lo, min(hi, v))

/** Signed shortest angle from a to b. */
fun angDiff(a: Float, b: Float): Float = atan2(sin(b - a), cos(b - a))

fun smooth(a: Float, b: Float, x: Float): Float {
    val u = clamp((x - a) / (b - a), 0f, 1f)
    return u * u * (3f - 2f * u)
}
