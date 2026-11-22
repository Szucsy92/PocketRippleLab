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
import hu.pocketripplelab.world.stepBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

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
    fun theSharkRarelySurfacesAndNobodyInspectsWithoutATarget() {
        assertEquals(Action.SURFACE, fishDecision(Kind.KOI, 0.1f, 0.5f, false).action)
        assertTrue(fishDecision(Kind.SHARK, 0.1f, 0.5f, false).action != Action.SURFACE)
        assertEquals(Action.SWIM, fishDecision(Kind.KOI, 0.9f, 0.5f, true).action)
    }
}
