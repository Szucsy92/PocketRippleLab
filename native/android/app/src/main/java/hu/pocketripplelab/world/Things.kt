package hu.pocketripplelab.world

import hu.pocketripplelab.gl.Q_IDENTITY
import hu.pocketripplelab.gl.Quat
import hu.pocketripplelab.gl.Vec3
import hu.pocketripplelab.gl.qRandom
import hu.pocketripplelab.gl.qYawPitchRoll
import kotlin.math.PI
import kotlin.random.Random

enum class Kind(val isFish: Boolean) {
    DUCK(false), BOAT(false), BALL(false), RING(false),
    KOI(true), TANG(true), PERCH(true), SHARK(true);
}

val FISH_KINDS = listOf(Kind.KOI, Kind.TANG, Kind.PERCH, Kind.SHARK)

/** Drawn nose-to-tail length of each fish in radii (the fish meshes are normalised to length 1). */
fun fishLen(k: Kind): Float = when (k) {
    Kind.KOI -> 2.8f
    Kind.TANG -> 2.5f
    Kind.PERCH -> 2.7f
    else -> 3.4f
}

/** Every toy and fish is 3x the original size. */
const val SIZE_FACTOR = 3f

/** Feel constants: lighter toys get carried further by the waves. */
class Phys(val push: Float, val drag: Float, val size: Float, val flow: Float)

fun physOf(k: Kind): Phys = when (k) {
    Kind.BALL -> Phys(3400f, 0.7f, 20f, 12f)
    Kind.RING -> Phys(3000f, 0.85f, 30f, 11f)
    Kind.DUCK -> Phys(2000f, 1.25f, 26f, 8f)
    Kind.BOAT -> Phys(1700f, 1.1f, 32f, 7f)
    Kind.KOI -> Phys(500f, 2.2f, 18f, 3f)
    Kind.TANG -> Phys(500f, 2.2f, 14f, 3f)
    Kind.PERCH -> Phys(500f, 2.2f, 15f, 3f)
    Kind.SHARK -> Phys(250f, 1.8f, 30f, 1.5f)
}

/**
 * How each toy sits in the water. waterline = model-space height of the water plane when it floats upright (in radii,
 * must match the mesh pack), draft = how far it can rise out of the water before it is fully airborne (radii),
 * kr = righting stiffness (rad/s)^2 (0 = a ball rolls freely), cd = tilt damping, cy = yaw damping.
 */
class Body(val waterline: Float, val draft: Float, val kr: Float, val cd: Float, val cy: Float)

fun bodyOf(k: Kind): Body = when (k) {
    Kind.BALL -> Body(-0.72f, 0.35f, 0f, 0.4f, 0.6f)
    Kind.RING -> Body(-0.08f, 0.25f, 60f, 3.4f, 1.2f)
    Kind.DUCK -> Body(0.62f, 0.5f, 48f, 3.2f, 1.6f)
    Kind.BOAT -> Body(0.16f, 0.45f, 34f, 3.4f, 1.8f)
    else -> Body(0f, 0f, 0f, 0f, 0f)
}

class Touch(val x: Float, val y: Float, val speed: Float)

class Thing(val kind: Kind, var x: Float, var y: Float, val r: Float) {
    val id: Int = nextId++
    var vx = 0f
    var vy = 0f
    var angle = Random.nextFloat() * 2f * PI.toFloat()
    var phase = Random.nextFloat() * 10f
    var lift = 0f

    /** Toys: 3D orientation (world frame: x right, y up, z toward the viewer) and angular velocity (rad/s). */
    var q: Quat = Q_IDENTITY
    var w: Vec3 = Vec3(0f, 0f, 0f)

    /** Toys: height of the model origin above the water surface (px) and its vertical speed; air while out of the water. */
    var h = 0f
    var hv = 0f
    var air = false
    var grabbed: Int? = null
    var wakeT = 0f

    /** Fish: wander target heading, fear (0..1), tail beat phase, bite animation 0..1. */
    var wander = Random.nextFloat() * 2f * PI.toFloat()
    var fear = 0f
    var tail = Random.nextFloat() * 6f
    var bite = 0f

    /** Fish: depth under the surface (0 = at the surface, 1 = deep), its goal and vertical speed. */
    var z = 0f
    var zGoal = 0f
    var zv = 0f

    /** Fish brain: decision timer, rest / surfacing / gulp timers, panic boost, swim speed, turn rate, focus target id. */
    var mind = Random.nextFloat() * 2f
    var restT = 0f
    var surfT = 0f
    var popT = 0.2f
    var boost = 0f
    var speed = 0f
    var turn = 0f
    var focus: Int? = null

    /** Fish: last turn direction; ball / ring: colour variant 0 or 1. */
    var side = if (Random.nextBoolean()) 1 else -1
    var skin = if (Random.nextBoolean()) 0 else 1

    companion object {
        var nextId = 1
    }
}

/** Height (px) of a toy's model origin above the water surface when it floats at rest. */
fun hEq(t: Thing): Float = -bodyOf(t.kind).waterline * t.r

fun makeThing(kind: Kind, x: Float, y: Float, scale: Float): Thing {
    val r = physOf(kind).size * SIZE_FACTOR * scale * (0.92f + Random.nextFloat() * 0.16f)
    val t = Thing(kind, x, y, r)
    if (kind.isFish) {
        val z0 = (if (kind == Kind.SHARK) 0.6f else 0.35f) + Random.nextFloat() * 0.3f
        t.z = z0
        t.zGoal = z0
    } else {
        // A new toy is dropped in from a little above the water: it splashes, wobbles and settles.
        t.q = if (kind == Kind.BALL) qRandom() else qYawPitchRoll(-t.angle, 0f, 0f)
        t.h = hEq(t) + t.r * 2.2f
        t.air = true
    }
    return t
}

class World(var width: Float, var height: Float, var cell: Float) {
    val things = ArrayList<Thing>()
    val touches = ArrayList<Touch>()
}
