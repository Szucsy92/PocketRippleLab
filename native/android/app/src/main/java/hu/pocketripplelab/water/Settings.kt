package hu.pocketripplelab.water

import android.content.Context
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class Swatch(val name: String, val hex: String)

/** Max 5 colors each. Liquid index 0 = transparent (the default). */
val BACKGROUNDS = listOf(
    Swatch("Éjfél", "#0a0a14"),
    Swatch("Mélytenger", "#04201e"),
    Swatch("Éjrózsa", "#220a18"),
    Swatch("Borostyán", "#1e1606"),
    Swatch("Erdőmély", "#08200c"),
)
val LIQUIDS = listOf(
    Swatch("Átlátszó", "transparent"),
    Swatch("Türkiz", "#36f1cd"),
    Swatch("Rózsa", "#ff5fa2"),
    Swatch("Méz", "#ffd166"),
    Swatch("Lime", "#7cff6b"),
)
val GLOWS = LIQUIDS.drop(1) + Swatch("Hold", "#9ad7ff")

const val WATER_SHALLOW = "#7fffd4"
const val WATER_DEEP = "#003366"
const val WATER_OPACITY = 0.85f

enum class Mood(val id: String, val label: String) {
    POOL("pool", "Medence"),
    LAKE("lake", "Tavacska"),
    SEA("sea", "Tengerfenék"),
}

enum class RainMode { AUTO, TOUCH }

data class Settings(
    val bg: Int = 0,
    val liquid: Int = 0,
    val glowOn: Boolean = true,
    val glowAmount: Float = 0.55f, // 0..1
    val glowColor: Int = 0,
    val waveSpeed: Float = 1f, // 1..3
    val waveLife: Float = 1f, // 0..1
    val tiltOn: Boolean = true,
    val tiltZeroX: Float = 0f,
    val tiltZeroY: Float = 0f,
    val mood: Mood? = null,
    val rainMode: RainMode = RainMode.AUTO,
    val depth: Float = 1f,
    val lightX: Float = -0.45f,
    val lightY: Float = -0.55f,
    /** Kiosk: the app pins itself (screen pinning) so a child cannot leave it. */
    val kiosk: Boolean = true,
)

private fun idx(v: Int, n: Int) = min(n - 1, max(0, v))
private fun unit(v: Float, fallback: Float) = if (v.isNaN() || v.isInfinite()) fallback else min(1f, max(0f, v))

/** The light direction as a unit vector (or the default when it is not a finite number). */
fun lightFromDisk(x: Float, y: Float): Pair<Float, Float> {
    val len = max(1f, hypot(x, y))
    return Pair(x / len, y / len)
}

fun clampSettings(s: Settings): Settings {
    val d = Settings()
    val lx = if (s.lightX.isNaN() || s.lightX.isInfinite()) d.lightX else s.lightX
    val ly = if (s.lightY.isNaN() || s.lightY.isInfinite()) d.lightY else s.lightY
    val l = lightFromDisk(lx, ly)
    return s.copy(
        bg = idx(s.bg, BACKGROUNDS.size),
        liquid = idx(s.liquid, LIQUIDS.size),
        glowColor = idx(s.glowColor, GLOWS.size),
        glowAmount = min(1f, max(0f, s.glowAmount)),
        waveSpeed = min(3f, max(1f, s.waveSpeed)),
        waveLife = min(1f, max(0f, s.waveLife)),
        depth = unit(s.depth, d.depth),
        lightX = l.first,
        lightY = l.second,
    )
}

fun applyMood(s: Settings, mood: Mood): Settings = clampSettings(
    when (mood) {
        Mood.POOL -> s.copy(bg = 1, liquid = 0, glowOn = false, mood = mood)
        Mood.LAKE -> s.copy(bg = 4, liquid = 0, glowOn = false, mood = mood)
        Mood.SEA -> s.copy(bg = 1, liquid = 1, glowOn = false, mood = mood)
    },
)

/** Wave life slider -> per-step damping factor (0.982 .. 0.998). */
fun dampingFor(life: Float): Float = 0.982f + life * 0.016f

/** "#rrggbb" -> floats 0..1 (anything else is black). */
fun hexToRgb(hex: String): FloatArray {
    if (!hex.startsWith("#") || hex.length < 7) return floatArrayOf(0f, 0f, 0f)
    val n = hex.substring(1, 7).toInt(16)
    return floatArrayOf(((n shr 16) and 255) / 255f, ((n shr 8) and 255) / 255f, (n and 255) / 255f)
}

/** Settings live in SharedPreferences, so they survive restarts. */
object SettingsStore {
    private const val FILE = "pocketripplelab"

    fun load(ctx: Context): Settings {
        val p = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        val d = Settings()
        val mood = Mood.entries.firstOrNull { it.id == p.getString("mood", null) }
        return clampSettings(
            Settings(
                bg = p.getInt("bg", d.bg),
                liquid = p.getInt("liquid", d.liquid),
                glowOn = p.getBoolean("glowOn", d.glowOn),
                glowAmount = p.getFloat("glowAmount", d.glowAmount),
                glowColor = p.getInt("glowColor", d.glowColor),
                waveSpeed = p.getFloat("waveSpeed", d.waveSpeed),
                waveLife = p.getFloat("waveLife", d.waveLife),
                tiltOn = p.getBoolean("tiltOn", d.tiltOn),
                tiltZeroX = p.getFloat("tiltZeroX", d.tiltZeroX),
                tiltZeroY = p.getFloat("tiltZeroY", d.tiltZeroY),
                mood = mood,
                rainMode = if (p.getString("rainMode", "auto") == "touch") RainMode.TOUCH else RainMode.AUTO,
                depth = p.getFloat("depth", d.depth),
                lightX = p.getFloat("lightX", d.lightX),
                lightY = p.getFloat("lightY", d.lightY),
                kiosk = p.getBoolean("kiosk", d.kiosk),
            ),
        )
    }

    fun save(ctx: Context, s: Settings) {
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putInt("bg", s.bg).putInt("liquid", s.liquid).putBoolean("glowOn", s.glowOn)
            .putFloat("glowAmount", s.glowAmount).putInt("glowColor", s.glowColor)
            .putFloat("waveSpeed", s.waveSpeed).putFloat("waveLife", s.waveLife)
            .putBoolean("tiltOn", s.tiltOn).putFloat("tiltZeroX", s.tiltZeroX).putFloat("tiltZeroY", s.tiltZeroY)
            .putString("mood", s.mood?.id).putString("rainMode", if (s.rainMode == RainMode.TOUCH) "touch" else "auto")
            .putFloat("depth", s.depth).putFloat("lightX", s.lightX).putFloat("lightY", s.lightY).putBoolean("kiosk", s.kiosk)
            .apply()
    }
}

/** Roundings used by the UI. */
fun Float.pct(): Int = (this * 100f).roundToInt()
