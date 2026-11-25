package hu.pocketripplelab

import hu.pocketripplelab.app.TapGate
import hu.pocketripplelab.gl.Quat
import hu.pocketripplelab.gl.Vec3
import hu.pocketripplelab.gl.eyeFor
import hu.pocketripplelab.gl.qAxisAngle
import hu.pocketripplelab.gl.qMul
import hu.pocketripplelab.gl.qRot
import hu.pocketripplelab.water.Mood
import hu.pocketripplelab.water.WaterSim
import hu.pocketripplelab.world.Action
import hu.pocketripplelab.world.Kind
import hu.pocketripplelab.world.fishDecision
import hu.pocketripplelab.world.hEq
import hu.pocketripplelab.world.makeThing
import hu.pocketripplelab.world.World
import hu.pocketripplelab.world.stepBody
import hu.pocketripplelab.world.swimAmp
import hu.pocketripplelab.world.updateThings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/** The pure logic of the app (no Android, no OpenGL): taps, waves, body physics, camera, fish brain. */
class NativeLogicTest {
    private fun upZ(q: Quat): Float = qRot(q, Vec3(0f, 0f, 1f)).z

    @Test
    fun fiveQuickTapsOpenTheSettings() {
        val g = TapGate(5, 1200L)
        var t = 1000L
        for (i in 1..4) { assertFalse(g.tap(t)); t += 300L }
        assertTrue(g.tap(t))
        assertEquals(0, g.count) // and it starts over
    }

    @Test
    fun aSlowTapRestartsTheCount() {
        val g = TapGate(5, 1200L)
        g.tap(0L); g.tap(300L); g.tap(600L); g.tap(900L)
        assertFalse(g.tap(5000L)) // too late: this is tap number 1 again
        assertEquals(1, g.count)
    }

    @Test
    fun wavesSpreadAndDieOut() {
        val sim = WaterSim(40, 40)
        sim.disturb(20f, 20f, 6f, -4f)
        var peak = 0f
        for (i in 0 until 60) { sim.step(); peak = maxOf(peak, abs(sim.sample(30f, 20f))) }
        assertTrue(peak > 0.05f) // the ripple reached the side
        for (i in 0 until 3000) sim.step()
        assertTrue(abs(sim.sample(20f, 20f)) < 0.05f)
    }

    @Test
    fun aDroppedDuckSettlesUprightAtItsWaterline() {
        val d = makeThing(Kind.DUCK, 200f, 300f, 1f)
        assertTrue(d.h > hEq(d) + d.r)
        var splashed = false
        for (i in 0 until 60 * 6) stepBody(d, 1f / 60f, 0f, 0f) { splashed = true }
        assertTrue(splashed)
        assertTrue(abs(d.h - hEq(d)) < d.r * 0.3f)
        assertTrue(upZ(d.q) > 0.9f)
    }

    @Test
    fun aToyThatLandsUpsideDownFlipsBack() {
        for (k in listOf(Kind.DUCK, Kind.BOAT, Kind.RING)) {
            val t = makeThing(k, 200f, 300f, 1f)
            t.h = hEq(t)
            t.hv = 0f
            t.air = false
            t.q = qMul(qAxisAngle(1f, 0f, 0f, 3.1416f * 0.97f), t.q)
            t.w = Vec3(0.3f, 0.2f, 0f)
            assertTrue(upZ(t.q) < -0.9f)
            for (i in 0 until 60 * 4) stepBody(t, 1f / 60f, 0f, 0f) { }
            assertTrue(upZ(t.q) > 0.85f)
        }
    }

    @Test
    fun theEyeSitsOverTheMiddleWithoutTilt() {
        val e = eyeFor(390f, 844f, 0f, 0f, 0.5f, null)
        assertEquals(195f, e.x, 0.01f)
        assertEquals(422f, e.y, 0.01f)
        val t = eyeFor(390f, 844f, 0.6f, 0f, 0.5f, Mood.SEA)
        assertTrue(abs(t.x - 195f) > 10f) // tilting moves the eye
    }

    @Test
    fun theDeepAlienSurfacesLessAndNobodyInspectsWithoutATarget() {
        assertEquals(Action.SURFACE, fishDecision(Kind.KOI, 0.1f, 0.5f, false).action)
        assertTrue(fishDecision(Kind.ALIEN, 0.15f, 0.5f, false).action != Action.SURFACE)
        assertEquals(Action.SWIM, fishDecision(Kind.KOI, 0.9f, 0.5f, true).action)
    }

    @Test
    fun fishSwimSmoothlyWithoutTwitchingOrDashing() {
        val sim = WaterSim(200, 360)
        val w = World(460f, 800f, 2.3f)
        for (k in listOf(Kind.KOI, Kind.TANG, Kind.ALIEN)) {
            w.things.add(makeThing(k, 150f + Random.nextFloat() * 160f, 250f + Random.nextFloat() * 300f, 1f))
        }
        val dt = 1f / 60f
        val angles = List(3) { ArrayList<Float>() }
        val tails = List(3) { ArrayList<Float>() }
        var maxSpeed = 0f
        for (i in 0 until 60 * 30) {
            updateThings(w, sim, dt)
            sim.step()
            if (i < 60 * 5) continue
            for (j in 0 until 3) {
                angles[j].add(w.things[j].angle)
                tails[j].add(w.things[j].tail)
                maxSpeed = maxOf(maxSpeed, w.things[j].speed)
            }
        }
        for (j in 0 until 3) {
            val a = angles[j]
            val turn = ArrayList<Float>()
            for (i in 1 until a.size) turn.add(atan2(sin(a[i] - a[i - 1]), cos(a[i] - a[i - 1])) / dt)
            var sum = 0f
            for (i in 1 until turn.size) { val acc = (turn[i] - turn[i - 1]) / dt; sum += acc * acc }
            val rms = Math.sqrt((sum / (turn.size - 1)).toDouble()).toFloat()
            assertTrue("angular acceleration rms $rms", rms < 10f) // it was ~30 with the twitchy steering
            var lo = 1e9f
            var hi = -1e9f
            for (i in 1 until tails[j].size) {
                val r = (tails[j][i] - tails[j][i - 1]) / dt
                lo = minOf(lo, r)
                hi = maxOf(hi, r)
            }
            assertTrue("tail rate $lo..$hi", lo > 2f && hi < 7.5f) // under ~1.2 beats per second
        }
        assertTrue("max speed $maxSpeed", maxSpeed < 110f) // walls and schooling steer, they do not make it dash
    }

    @Test
    fun theSwimAmplitudeGrowsWithTheSpeed() {
        assertEquals(0.15f, swimAmp(0f), 0.001f)
        assertTrue(swimAmp(55f) > 0.3f && swimAmp(55f) < 0.6f)
        assertEquals(1f, swimAmp(480f), 0.0001f)
        assertTrue(swimAmp(80f) > swimAmp(40f))
    }
}
