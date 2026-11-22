package hu.pocketripplelab.gl

import hu.pocketripplelab.water.Mood
import kotlin.math.max
import kotlin.math.min

/** Eye position (screen px) and height above the surface, plus the depth of the floor in px. */
class Eye(val x: Float, val y: Float, val h: Float, val floor: Float)

/**
 * The same box view the floor shader uses: the screen is the opening of a box, tilting the phone only moves the eye.
 * Objects float, hang and swim in exactly the same space as the floor and walls drawn by the water shader.
 */
fun eyeFor(w: Float, h: Float, parallaxX: Float, parallaxY: Float, depth: Float, mood: Mood?): Eye {
    val boxD = 0.25f + depth * 0.75f
    val relief = if (mood == Mood.SEA || mood == Mood.LAKE) 0.6f else 1f
    fun cl(v: Float) = max(-0.6f, min(0.6f, v))
    val sx = cl(parallaxX * boxD * 0.7f * relief)
    val sy = cl(parallaxY * boxD * 0.7f * relief)
    val persp = boxD * 0.45f * relief
    return Eye(w / 2f - (sx * h) / persp, h / 2f - (sy * h) / persp, h * boxD * (1f / persp - 1f), boxD * h)
}

/** Toys move their eye only part of the way (a full window projection would smear a ball into an egg). */
const val TOY_VIEW_GAIN = 0.5f

fun toyEye(w: Float, h: Float, e: Eye): Eye =
    Eye(w / 2f + (e.x - w / 2f) * TOY_VIEW_GAIN, h / 2f + (e.y - h / 2f) * TOY_VIEW_GAIN, e.h, e.floor)
