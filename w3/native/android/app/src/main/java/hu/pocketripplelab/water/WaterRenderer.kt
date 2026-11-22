package hu.pocketripplelab.water

import android.graphics.Bitmap
import android.opengl.GLES30
import android.opengl.GLUtils
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/** Everything the water shader needs for one frame. */
class WaterFrame {
    var height: FloatArray = FloatArray(1)
    var bg = floatArrayOf(0f, 0f, 0f)
    var liquid = floatArrayOf(0f, 0f, 0f)
    var liquidAmt = 0f
    var glow = floatArrayOf(0f, 0f, 0f)
    var glowAmt = 0f
    var time = 0f
    var shallow = floatArrayOf(0f, 0f, 0f)
    var deep = floatArrayOf(0f, 0f, 0f)
    var depth = 1f
    var lightX = 0f
    var lightY = 0f
    var mood = 0f
    var slosh = 0f
    var lightGlow = 0f
    var parallaxX = 0f
    var parallaxY = 0f
}

/** The full-screen water shader (floor, walls, refraction, caustics, highlights). Must be used on the GL thread. */
class WaterRenderer {
    private var prog = 0
    private val tex = IntArray(2) // 0 = height field, 1 = floor shadows
    private val u = HashMap<String, Int>()
    private var simW = 1
    private var simH = 1
    private var width = 1
    private var height = 1
    private var heightBuf: FloatBuffer = ByteBuffer.allocateDirect(4).order(ByteOrder.nativeOrder()).asFloatBuffer()
    private var quad = 0

    fun init() {
        prog = link(Shaders.WATER_VERT, Shaders.WATER_FRAG)
        GLES30.glUseProgram(prog)
        val ids = IntArray(1)
        GLES30.glGenBuffers(1, ids, 0)
        quad = ids[0]
        val verts = floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)
        val fb = ByteBuffer.allocateDirect(verts.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
        fb.put(verts).position(0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quad)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, verts.size * 4, fb, GLES30.GL_STATIC_DRAW)
        for (n in listOf("uH", "uObj", "uTexel", "uBg", "uLiquid", "uLiquidAmt", "uGlow", "uGlowAmt", "uAspect", "uTime", "uShallow", "uDeep", "uDepth", "uLight", "uMood", "uSlosh", "uLightGlow", "uParallax")) {
            u[n] = GLES30.glGetUniformLocation(prog, n)
        }
        GLES30.glGenTextures(2, tex, 0)
        for (t in tex) {
            GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, t)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        }
        GLES30.glPixelStorei(GLES30.GL_UNPACK_ALIGNMENT, 1)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex[1])
        clearObjects()
    }

    fun resize(w: Int, h: Int, sw: Int, sh: Int) {
        width = w
        height = h
        simW = sw
        simH = sh
        heightBuf = ByteBuffer.allocateDirect(sw * sh * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
    }

    private fun clearObjects() {
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex[1])
        val px = ByteBuffer.allocateDirect(4).order(ByteOrder.nativeOrder())
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, 1, 1, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, px)
    }

    /** The floor shadows, drawn on a bitmap in screen space (the shader refracts and parallax-shifts them). */
    fun uploadObjects(bmp: Bitmap?) {
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex[1])
        if (bmp != null) GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bmp, 0) else clearObjects()
    }

    fun draw(f: WaterFrame) {
        GLES30.glViewport(0, 0, width, height)
        GLES30.glDisable(GLES30.GL_DEPTH_TEST)
        GLES30.glDisable(GLES30.GL_BLEND)
        GLES30.glUseProgram(prog)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quad)
        val loc = GLES30.glGetAttribLocation(prog, "aPos")
        GLES30.glEnableVertexAttribArray(loc)
        GLES30.glVertexAttribPointer(loc, 2, GLES30.GL_FLOAT, false, 0, 0)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex[0])
        heightBuf.clear()
        heightBuf.put(f.height, 0, simW * simH)
        heightBuf.position(0)
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_R16F, simW, simH, 0, GLES30.GL_RED, GLES30.GL_FLOAT, heightBuf)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex[1])
        GLES30.glUniform1i(l("uH"), 0)
        GLES30.glUniform1i(l("uObj"), 1)
        GLES30.glUniform2f(l("uTexel"), 1f / simW, 1f / simH)
        GLES30.glUniform3fv(l("uBg"), 1, f.bg, 0)
        GLES30.glUniform3fv(l("uLiquid"), 1, f.liquid, 0)
        GLES30.glUniform1f(l("uLiquidAmt"), f.liquidAmt)
        GLES30.glUniform3fv(l("uGlow"), 1, f.glow, 0)
        GLES30.glUniform1f(l("uGlowAmt"), f.glowAmt)
        GLES30.glUniform1f(l("uAspect"), width.toFloat() / height.toFloat())
        GLES30.glUniform1f(l("uTime"), f.time)
        GLES30.glUniform3fv(l("uShallow"), 1, f.shallow, 0)
        GLES30.glUniform3fv(l("uDeep"), 1, f.deep, 0)
        GLES30.glUniform1f(l("uDepth"), f.depth)
        GLES30.glUniform2f(l("uLight"), f.lightX, f.lightY)
        GLES30.glUniform1f(l("uMood"), f.mood)
        GLES30.glUniform1f(l("uSlosh"), f.slosh)
        GLES30.glUniform1f(l("uLightGlow"), f.lightGlow)
        GLES30.glUniform2f(l("uParallax"), f.parallaxX, f.parallaxY)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
        GLES30.glDisableVertexAttribArray(loc)
    }

    private fun l(name: String): Int = u[name] ?: -1
}

/** Compiles and links a GLSL ES 3.00 program; throws with the driver's log on error. */
fun link(vs: String, fs: String): Int {
    fun shader(type: Int, src: String): Int {
        val s = GLES30.glCreateShader(type)
        GLES30.glShaderSource(s, src)
        GLES30.glCompileShader(s)
        val ok = IntArray(1)
        GLES30.glGetShaderiv(s, GLES30.GL_COMPILE_STATUS, ok, 0)
        if (ok[0] == 0) throw RuntimeException("shader: " + GLES30.glGetShaderInfoLog(s))
        return s
    }
    val p = GLES30.glCreateProgram()
    GLES30.glAttachShader(p, shader(GLES30.GL_VERTEX_SHADER, vs))
    GLES30.glAttachShader(p, shader(GLES30.GL_FRAGMENT_SHADER, fs))
    GLES30.glLinkProgram(p)
    val ok = IntArray(1)
    GLES30.glGetProgramiv(p, GLES30.GL_LINK_STATUS, ok, 0)
    if (ok[0] == 0) throw RuntimeException("link: " + GLES30.glGetProgramInfoLog(p))
    return p
}
