package hu.pocketripplelab.water

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.max
import kotlin.math.min

/**
 * Reads the device tilt as a gravity vector in screen space (-1..1 per axis; x right, y down).
 * The app is locked to portrait, so the accelerometer axes map straight onto the screen axes.
 */
class Tilt(private val ctx: Context) : SensorEventListener {
    @Volatile var rawX = 0f
    @Volatile var rawY = 0f
    @Volatile var available = false
    var valueX = 0f
    var valueY = 0f

    private val manager = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager

    fun start() {
        val s = manager.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        if (s != null) manager.registerListener(this, s, SensorManager.SENSOR_DELAY_GAME)
    }

    fun stop() {
        manager.unregisterListener(this)
    }

    override fun onSensorChanged(e: SensorEvent) {
        val g = SensorManager.GRAVITY_EARTH
        // The sensor reports the "up" direction: tilting the right edge down gives a negative x,
        // holding the phone upright gives a positive y. Gravity in screen space is the opposite for x.
        rawX = max(-1f, min(1f, -e.values[0] / g))
        rawY = max(-1f, min(1f, e.values[1] / g))
        available = true
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    /** Smooths the reading toward the (zeroed) tilt; call once per frame. */
    fun update(dt: Float, zeroX: Float, zeroY: Float, enabled: Boolean) {
        val tx = if (enabled) rawX - zeroX else 0f
        val ty = if (enabled) rawY - zeroY else 0f
        val k = min(1f, dt * 8f)
        valueX += (tx - valueX) * k
        valueY += (ty - valueY) * k
    }
}
