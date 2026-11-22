package hu.pocketripplelab.water

import android.content.Context
import android.opengl.GLES30
import android.opengl.GLSurfaceView
import android.os.SystemClock
import android.view.MotionEvent
import hu.pocketripplelab.gl.ObjectRenderer
import hu.pocketripplelab.gl.eyeFor
import hu.pocketripplelab.world.Kind
import hu.pocketripplelab.world.ShadowPainter
import hu.pocketripplelab.world.Touch
import hu.pocketripplelab.world.World
import hu.pocketripplelab.world.makeThing
import hu.pocketripplelab.world.tumble
import hu.pocketripplelab.world.updateThings
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlin.random.Random

/** One finger on the screen: its position (dp), when it last moved, the toy it holds (if any) and a smoothed speed. */
private class Pointer(var x: Float, var y: Float, var t: Long, var grab: Int?, var speed: Float)

/**
 * The whole pool: wave simulation, toys, fish, shadows and the OpenGL drawing. Everything runs on the GL thread;
 * the UI thread only reads and writes the @Volatile settings and queues events (GLSurfaceView.queueEvent).
 */
class WaterScene(private val ctx: Context, private val view: GLSurfaceView) : GLSurfaceView.Renderer {
    @Volatile var settings: Settings = Settings()
    val tilt = Tilt(ctx)

    private val density = ctx.resources.displayMetrics.density
    private val water = WaterRenderer()
    private val objects = ObjectRenderer(ctx)
    private val shadows = ShadowPainter()
    private val rain = Rainfall()
    private val frame = WaterFrame()
    private var sim = WaterSim(2, 2)
    private val world = World(1f, 1f, 1f)
    private val pointers = HashMap<Int, Pointer>()
    private var widthPx = 1
    private var heightPx = 1
    private var underScale = 1f
    private var activeMood: Mood? = null
    private var lightGlow = 0f
    private var lastLightX = 0f
    private var lastLightY = 0f
    private var acc = 0f
    private var lastNanos = 0L
    private var startNanos = 0L
    private var ready = false
    private val deep = hexToRgb(WATER_DEEP)
    private val shallow = hexToRgb(WATER_SHALLOW)

    // ---- GLSurfaceView.Renderer -------------------------------------------------------------

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        water.init()
        objects.reset()
        objects.init()
        lastNanos = System.nanoTime()
        if (startNanos == 0L) startNanos = lastNanos
        ready = true
    }

    override fun onSurfaceChanged(gl: GL10?, w: Int, h: Int) {
        widthPx = max(1, w)
        heightPx = max(1, h)
        val wDp = widthPx / density
        val hDp = heightPx / density
        val cell = max(wDp, hDp) / 420f
        val sw = max(8, Math.round(wDp / cell))
        val sh = max(8, Math.round(hDp / cell))
        val old = sim
        sim = WaterSim(sw, sh)
        if (old.w == sw && old.h == sh) {
            System.arraycopy(old.cur, 0, sim.cur, 0, old.cur.size)
            System.arraycopy(old.prev, 0, sim.prev, 0, old.prev.size)
        }
        world.width = wDp
        world.height = hDp
        world.cell = wDp / sw
        water.resize(widthPx, heightPx, sw, sh)
        underScale = min(density, 1.25f)
        for (t in world.things) {
            t.x = min(wDp - t.r, t.x)
            t.y = min(hDp - t.r, t.y)
        }
    }

    override fun onDrawFrame(gl: GL10?) {
        if (!ready) return
        val now = System.nanoTime()
        val dt = min(0.05f, (now - lastNanos) / 1_000_000_000f)
        lastNanos = now
        val s = settings
        tilt.update(dt, s.tiltZeroX, s.tiltZeroY, s.tiltOn)
        sim.damping = dampingFor(s.waveLife)
        sim.ageCurrents(dt)
        if (activeMood != s.mood) {
            sim.clear()
            rain.reset()
            activeMood = s.mood
        }
        if (Math.abs(s.lightX - lastLightX) + Math.abs(s.lightY - lastLightY) > 1e-4f) lightGlow = 1f
        else lightGlow *= exp(-dt * 1.2f)
        lastLightX = s.lightX
        lastLightY = s.lightY

        world.touches.clear()
        for (p in pointers.values) {
            if (p.grab == null) world.touches.add(Touch(p.x, p.y, p.speed))
            p.speed *= exp(-dt * 6f)
        }
        updateThings(world, sim, dt)

        acc += dt * 60f * s.waveSpeed
        var steps = 0
        while (acc >= 1f && steps < 8) {
            sim.step()
            acc -= 1f
            steps++
        }
        if (acc > 1f) acc = 0f

        val parX = if (s.tiltOn) tilt.valueX else 0f
        val parY = if (s.tiltOn) tilt.valueY else 0f
        val things = world.things
        water.uploadObjects(if (things.isNotEmpty()) shadows.draw(things, world.width, world.height, underScale, s.depth, s.lightX, s.lightY) else null)

        val liq = LIQUIDS[s.liquid]
        val clear = liq.hex == "transparent"
        frame.height = sim.cur
        frame.bg = hexToRgb(BACKGROUNDS[s.bg].hex)
        frame.liquid = if (clear) floatArrayOf(0f, 0f, 0f) else hexToRgb(liq.hex)
        frame.liquidAmt = if (clear) 0f else WATER_OPACITY
        frame.glow = hexToRgb(GLOWS[s.glowColor].hex)
        frame.glowAmt = if (s.glowOn) s.glowAmount * 1.65f else 0f
        frame.time = (now - startNanos) / 1_000_000_000f
        frame.shallow = shallow
        frame.deep = deep
        frame.depth = s.depth
        frame.lightX = s.lightX
        frame.lightY = s.lightY
        frame.mood = if (s.mood == Mood.SEA) 1f else if (s.mood == Mood.LAKE) 2f else 0f
        frame.slosh = 0f
        frame.lightGlow = lightGlow
        frame.parallaxX = parX
        frame.parallaxY = parY
        water.draw(frame)
        objects.draw(things, eyeFor(world.width, world.height, parX, parY, s.depth, s.mood), world.width, world.height, s.lightX, s.lightY, deep, widthPx, heightPx)
    }

    // ---- called from the UI thread ------------------------------------------------------------

    private fun objScale(): Float = max(0.8f, min(1.6f, min(world.width, world.height) / 390f))

    /** Drops a toy or fish in at a random spot. */
    fun add(kind: Kind) {
        view.queueEvent {
            val m = 120f
            val x = m + Random.nextFloat() * max(1f, world.width - 2f * m)
            val y = m + Random.nextFloat() * max(1f, world.height - 2f * m)
            val t = makeThing(kind, x, y, objScale())
            world.things.add(t)
            // Toys are dropped in from above (splash on impact); fish are lowered in with a ripple.
            if (kind.isFish) sim.disturb(x / world.cell, y / world.cell, max(5.5f, (t.r / world.cell) * 1.65f), -7f * 1.45f)
            if (world.things.size > 40) world.things.removeAt(0)
        }
    }

    fun clearThings() {
        view.queueEvent { world.things.clear() }
    }

    fun touch(e: MotionEvent) {
        val action = e.actionMasked
        val idx = e.actionIndex
        // Copy what we need now: the MotionEvent is recycled after this call returns.
        val ids = IntArray(e.pointerCount) { e.getPointerId(it) }
        val xs = FloatArray(e.pointerCount) { e.getX(it) / density }
        val ys = FloatArray(e.pointerCount) { e.getY(it) / density }
        val time = e.eventTime
        val downId = e.getPointerId(idx)
        view.queueEvent {
            when (action) {
                MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                    for (i in ids.indices) if (ids[i] == downId) onDown(downId, xs[i], ys[i], time)
                }
                MotionEvent.ACTION_MOVE -> for (i in ids.indices) onMove(ids[i], xs[i], ys[i], time)
                MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> onUp(downId)
                MotionEvent.ACTION_CANCEL -> for (id in ids) onUp(id)
            }
        }
    }

    // ---- pointer handling (GL thread) ---------------------------------------------------------

    private fun onDown(id: Int, x: Float, y: Float, time: Long) {
        var grab: Int? = null
        for (i in world.things.indices.reversed()) {
            val t = world.things[i]
            if (!t.kind.isFish && t.grabbed == null && hypot(t.x - x, t.y - y) < t.r * 1.3f) {
                t.grabbed = id
                t.vx = 0f
                t.vy = 0f
                grab = t.id
                break
            }
        }
        pointers[id] = Pointer(x, y, time, grab, 0f)
        if (grab == null) {
            sim.disturb(x / world.cell, y / world.cell, 8.5f, -5.5f)
            rain.touch(0.12f)
        }
    }

    private fun onMove(id: Int, x: Float, y: Float, time: Long) {
        val p = pointers[id] ?: return
        val dt = max(1L, time - p.t) / 1000f
        val grab = p.grab
        if (grab != null) {
            val t = world.things.firstOrNull { it.id == grab }
            if (t != null) {
                t.vx = t.vx * 0.5f + ((x - t.x) / dt) * 0.5f
                t.vy = t.vy * 0.5f + ((y - t.y) / dt) * 0.5f
                t.x = x
                t.y = y
                if (hypot(t.vx, t.vy) > 10f) t.angle = atan2(t.vy, t.vx)
            }
        } else {
            val dx = x - p.x
            val dy = y - p.y
            val dist = hypot(dx, dy)
            val stepPx = world.cell * 1.5f
            val n = max(1, ceil(dist / stepPx).toInt())
            val speed = dist / dt
            p.speed = p.speed * 0.5f + speed * 0.5f
            rain.touch(min(0.12f, dist * 0.001f))
            val c = world.cell
            sim.swirl(x / c, y / c, dx / c, dy / c)
            val sGain = -min(3.2f, 0.4f + speed * 0.0017f)
            for (i in 1..n) {
                val f = i.toFloat() / n
                sim.disturb((p.x + dx * f) / c, (p.y + dy * f) / c, 6.2f, sGain / sqrt(n.toFloat()) * 2f)
            }
        }
        p.x = x
        p.y = y
        p.t = time
    }

    private fun onUp(id: Int) {
        val p = pointers[id]
        val grab = p?.grab
        if (grab != null) {
            val t = world.things.firstOrNull { it.id == grab }
            if (t != null) {
                t.grabbed = null
                // let go: it falls back into the water, splashes on impact and tumbles with the throw
                tumble(t)
            }
        }
        pointers.remove(id)
    }

    @Suppress("unused")
    private fun uptime(): Long = SystemClock.uptimeMillis()
}
