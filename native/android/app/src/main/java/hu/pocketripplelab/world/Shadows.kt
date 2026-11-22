package hu.pocketripplelab.world

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.RadialGradient
import android.graphics.Shader
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Soft shadows cast onto the floor (the water shader refracts them). They follow the light and the object's
 * height, never the phone's tilt (tilt only moves the eye). The light uses the settings convention (x right, y up).
 */
class ShadowPainter {
    private var bmp: Bitmap? = null
    private var canvas: Canvas? = null
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    private fun black(a: Float): Int = Color.argb((max(0f, min(1f, a)) * 255f).toInt(), 0, 0, 0)

    /** Paints the shadows for the current things and returns the bitmap to upload (width x height dp at `scale` px per dp). */
    fun draw(things: List<Thing>, width: Float, height: Float, scale: Float, depth: Float, lightX: Float, lightY: Float): Bitmap {
        val bw = max(1, ceil(width * scale).toInt())
        val bh = max(1, ceil(height * scale).toInt())
        var b = bmp
        if (b == null || b.width != bw || b.height != bh) {
            b = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888)
            bmp = b
            canvas = Canvas(b)
        }
        val c = canvas!!
        c.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
        c.save()
        c.scale(scale, scale)
        val off = 10f + depth * 30f
        val len = max(1e-6f, hypot(lightX, lightY))
        val dirX = -lightX / len * 0.57f // away from the light, in screen px (y down)
        val dirY = lightY / len * 0.57f
        for (t in things) {
            // A fish deep in the water is close to the floor: its shadow is tight and dark; at the surface it floats away and blurs.
            val fz = if (t.kind.isFish) t.z else 0f
            val high = if (t.kind.isFish) 0f else max(0f, t.h - hEq(t)) / max(1f, t.r)
            val lifted = (1f + min(2.5f, high * 1.2f)) * (1f - fz * 0.75f)
            val x = t.x + dirX * off * lifted
            val y = t.y + dirY * off * lifted
            val blur = t.r * (0.5f + depth * 0.6f) * lifted * (1f - fz * 0.3f)
            val alpha = (0.42f - depth * 0.14f) * (1f + fz * 0.15f) / (1f + high * 0.5f)
            val long = when (t.kind) {
                Kind.DUCK -> 1.05f
                Kind.BOAT -> 1.15f
                else -> if (t.kind.isFish) 1.3f else 1f
            }
            val wide = when (t.kind) {
                Kind.DUCK -> 0.78f
                Kind.BOAT -> 0.5f
                else -> if (t.kind.isFish) 0.4f else 1f
            }
            val radius = t.r + blur
            val shader = if (t.kind == Kind.RING) {
                val inner = (t.r * 0.32f) / radius
                RadialGradient(
                    0f, 0f, radius,
                    intArrayOf(black(0f), black(0.02f), black(alpha), black(0f)),
                    floatArrayOf(0f, inner, 0.62f, 1f),
                    Shader.TileMode.CLAMP,
                )
            } else {
                RadialGradient(
                    0f, 0f, radius,
                    intArrayOf(black(alpha), black(alpha * 0.7f), black(0f)),
                    floatArrayOf(0f, 0.55f, 1f),
                    Shader.TileMode.CLAMP,
                )
            }
            c.save()
            c.translate(x, y)
            c.rotate(t.angle * 180f / PI.toFloat())
            c.scale(long, wide)
            paint.shader = shader
            c.drawCircle(0f, 0f, radius, paint)
            c.restore()
        }
        c.restore()
        return b
    }
}
