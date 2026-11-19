package hu.pocketripplelab.water

import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.min

/** Silent rainfall: interaction adds intensity, then relaxes back to drizzle. */
class Rainfall {
    var intensity = 0f
    private var budget = 0f

    fun touch(amount: Float = 0.1f) {
        intensity = min(1f, intensity + amount)
    }

    private fun rate(mode: RainMode, touching: Boolean): Float {
        if (mode == RainMode.TOUCH && !touching) return 0f
        return (if (mode == RainMode.AUTO) 5f else 8f) + intensity * 32f
    }

    /** Number of drops to spawn in this step. */
    fun step(dt: Float, mode: RainMode, touching: Boolean): Int {
        if (touching) touch(dt * 0.3f) else intensity *= exp(-dt * 0.65f)
        budget += rate(mode, touching) * dt
        val drops = floor(budget).toInt()
        budget -= drops
        return drops
    }

    fun reset() {
        intensity = 0f
        budget = 0f
    }
}
