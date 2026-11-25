package hu.pocketripplelab.gl

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.opengl.GLES30
import android.opengl.GLUtils
import hu.pocketripplelab.water.Shaders
import hu.pocketripplelab.water.link
import hu.pocketripplelab.world.Kind
import hu.pocketripplelab.world.Thing
import hu.pocketripplelab.world.poseOf
import hu.pocketripplelab.world.swimAmp
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.ShortBuffer
import kotlin.math.max

private class Model(
    val pack: Pack,
    val vao: Int,
    val posBuf: Int,
    val nrmBuf: Int,
    val animated: Boolean,
    val posArr: FloatArray,
    val nrmArr: FloatArray,
    val posData: FloatBuffer,
    val nrmData: FloatBuffer,
    /** Animated fish: the neutral (mean) pose the swim amplitude blends toward. */
    val neutral: NeutralPose?,
)

/** Which mesh pack a kind uses; the clown fish (koi / tang / perch) is one mesh in three colours. */
fun modelKey(k: Kind): String = when (k) {
    Kind.KOI, Kind.TANG, Kind.PERCH -> "clown"
    Kind.DUCK -> "duck"
    Kind.BOAT -> "boat"
    Kind.BALL -> "ball"
    Kind.RING -> "ring"
    Kind.ALIEN -> "alien"
}

/** Which entry of a texture list (colour variant) this object uses. */
fun variantOf(k: Kind, skin: Int): Int = when (k) {
    Kind.TANG -> 1
    Kind.PERCH -> 2
    Kind.BALL, Kind.RING -> if (skin != 0) 1 else 0
    else -> 0
}

private fun directFloats(n: Int): FloatBuffer = ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

/** Draws toys and fish as real 3D meshes, seen from the tilt-driven eye of the box view. GL thread only. */
class ObjectRenderer(private val ctx: Context) {
    private var prog = 0
    private val u = HashMap<String, Int>()
    private val models = HashMap<String, Model?>()
    private val failed = HashSet<String>()
    private val textures = HashMap<String, Int>()
    private var white = 0
    private val model = FloatArray(16)
    private val vp = FloatArray(16)
    private val rot3 = FloatArray(9)

    fun init() {
        prog = link(Shaders.OBJECT_VERT, Shaders.OBJECT_FRAG)
        for (n in listOf("uModel", "uVP", "uRot", "uTex", "uRMap", "uNMap", "uEye", "uLight", "uWater", "uDepthK", "uRough", "uSpec", "uGain", "uGamma", "uNStr", "uHasTex", "uHasR", "uHasN", "uVCol", "uCut", "uFish", "uAlpha")) {
            u[n] = GLES30.glGetUniformLocation(prog, n)
        }
        val ids = IntArray(1)
        GLES30.glGenTextures(1, ids, 0)
        white = ids[0]
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, white)
        val px = ByteBuffer.allocateDirect(4).order(ByteOrder.nativeOrder())
        px.put(byteArrayOf(-1, -1, -1, -1)).position(0)
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, 1, 1, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, px)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_NEAREST)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_NEAREST)
    }

    /** The GL context was lost (the app went to the background): every GL object is gone. */
    fun reset() {
        models.clear()
        failed.clear()
        textures.clear()
    }

    private fun l(name: String): Int = u[name] ?: -1

    private fun texture(name: String?, nearest: Boolean): Int {
        if (name == null) return white
        val key = if (nearest) "$name#n" else name
        val have = textures[key]
        if (have != null) return have
        var id = white
        try {
            val opts = BitmapFactory.Options()
            opts.inPremultiplied = false // straight alpha, like the browser: the shader cuts fins on it
            val bmp: Bitmap? = ctx.assets.open("models/$name").use { BitmapFactory.decodeStream(it, null, opts) }
            if (bmp != null) {
                val ids = IntArray(1)
                GLES30.glGenTextures(1, ids, 0)
                id = ids[0]
                GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, id)
                GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bmp, 0)
                if (nearest) {
                    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_NEAREST)
                    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_NEAREST)
                    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
                    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
                } else {
                    GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
                    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR_MIPMAP_LINEAR)
                    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
                    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_REPEAT)
                    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_REPEAT)
                }
                bmp.recycle()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        textures[key] = id
        return id
    }

    private fun loadModel(key: String): Model? {
        if (key in failed) return null
        try {
            val bytes = ctx.assets.open("models/$key.prm").use { it.readBytes() }
            val pack = parsePack(bytes)
            val ids = IntArray(1)
            GLES30.glGenVertexArrays(1, ids, 0)
            val vao = ids[0]
            GLES30.glBindVertexArray(vao)
            val animated = pack.frames > 1
            val posArr = FloatArray(pack.verts * 3)
            val nrmArr = FloatArray(pack.verts * 3)
            framePositions(pack, 0, 0, 0f, posArr)
            frameNormals(pack, 0, 0, 0f, nrmArr)
            val posData = directFloats(posArr.size)
            val nrmData = directFloats(nrmArr.size)
            posData.put(posArr).position(0)
            nrmData.put(nrmArr).position(0)
            val usage = if (animated) GLES30.GL_DYNAMIC_DRAW else GLES30.GL_STATIC_DRAW

            val bufs = IntArray(5)
            GLES30.glGenBuffers(5, bufs, 0)
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, bufs[0])
            GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, posArr.size * 4, posData, usage)
            GLES30.glEnableVertexAttribArray(0)
            GLES30.glVertexAttribPointer(0, 3, GLES30.GL_FLOAT, false, 0, 0)
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, bufs[1])
            GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, nrmArr.size * 4, nrmData, usage)
            GLES30.glEnableVertexAttribArray(1)
            GLES30.glVertexAttribPointer(1, 3, GLES30.GL_FLOAT, false, 0, 0)
            val uvData = directFloats(pack.uv.size)
            uvData.put(pack.uv).position(0)
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, bufs[2])
            GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, pack.uv.size * 4, uvData, GLES30.GL_STATIC_DRAW)
            GLES30.glEnableVertexAttribArray(2)
            GLES30.glVertexAttribPointer(2, 2, GLES30.GL_FLOAT, false, 0, 0)
            val col = pack.col
            if (col != null) {
                val cd = ByteBuffer.allocateDirect(col.size).order(ByteOrder.nativeOrder())
                cd.put(col).position(0)
                GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, bufs[3])
                GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, col.size, cd, GLES30.GL_STATIC_DRAW)
                GLES30.glEnableVertexAttribArray(3)
                GLES30.glVertexAttribPointer(3, 4, GLES30.GL_UNSIGNED_BYTE, true, 0, 0)
            } else {
                GLES30.glVertexAttrib4f(3, 1f, 1f, 1f, 1f)
            }
            val idxData: ShortBuffer = ByteBuffer.allocateDirect(pack.idx.size * 2).order(ByteOrder.nativeOrder()).asShortBuffer()
            idxData.put(pack.idx).position(0)
            GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, bufs[4])
            GLES30.glBufferData(GLES30.GL_ELEMENT_ARRAY_BUFFER, pack.idx.size * 2, idxData, GLES30.GL_STATIC_DRAW)
            GLES30.glBindVertexArray(0)
            val swimClip = pack.clips["swim"]
            val neutral = if (animated && swimClip != null) clipMean(pack, swimClip) else null
            return Model(pack, vao, bufs[0], bufs[1], animated, posArr, nrmArr, posData, nrmData, neutral)
        } catch (e: Exception) {
            e.printStackTrace()
            failed.add(key)
            return null
        }
    }

    private fun modelFor(kind: Kind): Model? {
        val key = modelKey(kind)
        if (models.containsKey(key)) return models[key]
        val m = loadModel(key)
        models[key] = m
        return m
    }

    private fun setEye(w: Float, h: Float, e: Eye) {
        viewProj(vp, w, h, e.x, e.y, e.h)
        GLES30.glUniformMatrix4fv(l("uVP"), 1, false, vp, 0)
        GLES30.glUniform3f(l("uEye"), e.x, -e.y, e.h)
    }

    /** Draws all things over the already rendered water. w / h are the world size in dp, the viewport is the whole surface. */
    fun draw(things: List<Thing>, eye: Eye, w: Float, h: Float, lightX: Float, lightY: Float, water: FloatArray, widthPx: Int, heightPx: Int) {
        if (things.isEmpty()) return
        GLES30.glViewport(0, 0, widthPx, heightPx)
        GLES30.glClear(GLES30.GL_DEPTH_BUFFER_BIT)
        GLES30.glUseProgram(prog)
        GLES30.glEnable(GLES30.GL_DEPTH_TEST)
        GLES30.glDepthFunc(GLES30.GL_LEQUAL)
        GLES30.glDepthMask(true)
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE_MINUS_SRC_ALPHA)
        GLES30.glDisable(GLES30.GL_CULL_FACE)
        var lx = lightX
        var ly = lightY
        var lz = 0.48f
        val ln = Math.sqrt((lx * lx + ly * ly + lz * lz).toDouble()).toFloat()
        lx /= ln; ly /= ln; lz /= ln
        GLES30.glUniform3f(l("uLight"), lx, ly, lz)
        GLES30.glUniform3f(l("uWater"), water[0], water[1], water[2])
        GLES30.glUniform1f(l("uDepthK"), 2.2f / max(60f, eye.floor))
        GLES30.glUniform1i(l("uTex"), 0)
        GLES30.glUniform1i(l("uRMap"), 1)
        GLES30.glUniform1i(l("uNMap"), 2)

        setEye(w, h, toyEye(w, h, eye))
        for (t in things) if (!t.kind.isFish) drawThing(t, eye, false)
        setEye(w, h, eye)
        val fish = things.filter { it.kind.isFish }.sortedByDescending { it.z }
        for (t in fish) drawThing(t, eye, true)
        GLES30.glBindVertexArray(0)
        GLES30.glDisable(GLES30.GL_DEPTH_TEST)
        GLES30.glDisable(GLES30.GL_BLEND)
    }

    private fun bindMat(mat: PackMat, t: Thing, fish: Boolean) {
        val tex: String? = if (mat.tex.isEmpty()) null else mat.tex[minOf(mat.tex.size - 1, variantOf(t.kind, t.skin))]
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texture(tex, mat.nearest))
        GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texture(mat.rmap, false))
        GLES30.glActiveTexture(GLES30.GL_TEXTURE2)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texture(mat.nmap, false))
        GLES30.glUniform1f(l("uHasTex"), if (tex != null) 1f else 0f)
        GLES30.glUniform1f(l("uHasR"), if (mat.rmap != null) 1f else 0f)
        GLES30.glUniform1f(l("uHasN"), if (mat.nmap != null) 1f else 0f)
        GLES30.glUniform1f(l("uRough"), mat.rough)
        GLES30.glUniform1f(l("uSpec"), mat.spec)
        GLES30.glUniform1f(l("uGain"), mat.gain)
        GLES30.glUniform1f(l("uGamma"), mat.gamma)
        GLES30.glUniform1f(l("uNStr"), mat.nstrength)
        GLES30.glUniform1f(l("uVCol"), if (mat.vcol) 1f else 0f)
        GLES30.glUniform1f(l("uCut"), if (mat.cut) 1f else 0f)
        GLES30.glUniform1f(l("uFish"), if (fish) 1f else 0f)
    }

    private fun drawThing(t: Thing, eye: Eye, fish: Boolean) {
        val m = modelFor(t.kind) ?: return
        val pose = poseOf(t, eye)
        modelMatrix(model, pose.px, pose.py, pose.pz, pose.q, pose.scale)
        rotationMatrix3(rot3, pose.q)
        GLES30.glUniformMatrix4fv(l("uModel"), 1, false, model, 0)
        GLES30.glUniformMatrix3fv(l("uRot"), 1, false, rot3, 0)
        GLES30.glUniform1f(l("uAlpha"), 1f)
        GLES30.glBindVertexArray(m.vao)
        if (m.animated) {
            var f0 = 0
            var f1 = 0
            var blend = 0f
            val swim = m.pack.clips["swim"]
            if (swim != null) {
                // One tail phase (2 pi) plays 1 / cycles of the loop: the alien's long loop holds several tail beats.
                val f = clipFrame(swim, (t.tail / (2f * Math.PI.toFloat() * swim.cycles)) * (swim.count / swim.fps))
                f0 = f.f0; f1 = f.f1; blend = f.t
            }
            framePositions(m.pack, f0, f1, blend, m.posArr)
            frameNormals(m.pack, f0, f1, blend, m.nrmArr)
            val neutral = m.neutral
            if (neutral != null) {
                // A slow fish bends only a little; the full baked swing is for a fish that really speeds up.
                val amp = swimAmp(t.speed)
                scaleBend(m.posArr, neutral.pos, amp, false)
                scaleBend(m.nrmArr, neutral.nrm, amp, true)
            }
            m.posData.position(0)
            m.posData.put(m.posArr).position(0)
            m.nrmData.position(0)
            m.nrmData.put(m.nrmArr).position(0)
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, m.posBuf)
            GLES30.glBufferSubData(GLES30.GL_ARRAY_BUFFER, 0, m.posArr.size * 4, m.posData)
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, m.nrmBuf)
            GLES30.glBufferSubData(GLES30.GL_ARRAY_BUFFER, 0, m.nrmArr.size * 4, m.nrmData)
        }
        for (part in m.pack.parts) {
            bindMat(part.mat, t, fish)
            GLES30.glDrawElements(GLES30.GL_TRIANGLES, part.count, GLES30.GL_UNSIGNED_SHORT, part.start * 2)
        }
    }
}
