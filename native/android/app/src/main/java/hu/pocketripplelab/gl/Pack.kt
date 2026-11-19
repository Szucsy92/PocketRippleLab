package hu.pocketripplelab.gl

import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.Inflater

/** One material of a mesh pack (see tools/models/pack.py). tex lists colour variants picked per object. */
class PackMat(
    val tex: List<String>,
    val rmap: String?,
    val nmap: String?,
    val rough: Float,
    val spec: Float,
    val gain: Float,
    val gamma: Float,
    val nstrength: Float,
    val nearest: Boolean,
    val cut: Boolean,
    val vcol: Boolean,
)

class PackPart(val start: Int, val count: Int, val mat: PackMat)

class PackClip(val start: Int, val count: Int, val fps: Float, val loop: Boolean)

/** A mesh pack: one static mesh or per-frame baked animation (positions / normals per frame, shared UVs and indices). */
class Pack(
    val frames: Int,
    val verts: Int,
    val parts: List<PackPart>,
    val clips: Map<String, PackClip>,
    /** frames * verts * 3 floats */
    val pos: FloatArray,
    val nrm: FloatArray,
    val uv: FloatArray,
    val col: ByteArray?,
    val idx: ShortArray,
)

private fun JSONObject.f(name: String, def: Float): Float = if (has(name)) getDouble(name).toFloat() else def

/** Parses a .prm file. "PRMZ" files hold a raw-deflate stream after an 8 byte header (magic + uncompressed size). */
fun parsePack(file: ByteArray): Pack {
    var data = file
    val head = String(file, 0, 4, Charsets.ISO_8859_1)
    if (head == "PRMZ") {
        val size = ByteBuffer.wrap(file, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
        val inf = Inflater(true)
        inf.setInput(file, 8, file.size - 8)
        val out = ByteArray(size)
        var n = 0
        while (n < size && !inf.finished()) {
            val k = inf.inflate(out, n, size - n)
            if (k == 0 && (inf.needsInput() || inf.needsDictionary())) break
            n += k
        }
        inf.end()
        data = out
    } else if (head != "PRM1") {
        throw IllegalArgumentException("not a mesh pack")
    }
    val bb = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
    val jl = bb.getInt(4)
    val hdr = JSONObject(String(data, 8, jl, Charsets.UTF_8).trim { it == '\u0000' || it.isWhitespace() })
    val base = 8 + jl
    val frames = hdr.getInt("frames")
    val verts = hdr.getInt("verts")
    val blobs = hdr.getJSONObject("blobs")
    fun blobOffset(k: String): Int = base + blobs.getJSONArray(k).getInt(0)
    fun blobCount(k: String): Int = blobs.getJSONArray(k).getInt(1)

    val lo = hdr.getJSONArray("lo")
    val span = hdr.getJSONArray("span")
    val n = frames * verts * 3
    val q = ShortArray(n)
    bb.position(blobOffset("pos"))
    bb.asShortBuffer().get(q)
    val pos = FloatArray(n)
    val lx = lo.getDouble(0).toFloat()
    val ly = lo.getDouble(1).toFloat()
    val lz = lo.getDouble(2).toFloat()
    val sx = span.getDouble(0).toFloat() / 65535f
    val sy = span.getDouble(1).toFloat() / 65535f
    val sz = span.getDouble(2).toFloat() / 65535f
    var i = 0
    while (i < n) {
        pos[i] = lx + (q[i].toInt() and 0xFFFF) * sx
        pos[i + 1] = ly + (q[i + 1].toInt() and 0xFFFF) * sy
        pos[i + 2] = lz + (q[i + 2].toInt() and 0xFFFF) * sz
        i += 3
    }

    val nrm = FloatArray(n)
    if (hdr.getString("nfmt") == "i16") {
        val t = ShortArray(n)
        bb.position(blobOffset("nrm"))
        bb.asShortBuffer().get(t)
        for (k in 0 until n) nrm[k] = t[k] / 32767f
    } else {
        for (k in 0 until n) nrm[k] = data[blobOffset("nrm") + k] / 127f
    }
    // renormalise (the 8-bit normals lose a little length)
    i = 0
    while (i < n) {
        var l = Math.sqrt((nrm[i] * nrm[i] + nrm[i + 1] * nrm[i + 1] + nrm[i + 2] * nrm[i + 2]).toDouble()).toFloat()
        if (l == 0f) l = 1f
        nrm[i] /= l
        nrm[i + 1] /= l
        nrm[i + 2] /= l
        i += 3
    }

    val uv = FloatArray(blobCount("uv"))
    bb.position(blobOffset("uv"))
    bb.asFloatBuffer().get(uv)

    var col: ByteArray? = null
    if (blobs.has("col")) {
        col = ByteArray(blobCount("col"))
        System.arraycopy(data, blobOffset("col"), col, 0, col.size)
    }

    if (hdr.getString("itype") != "u16") throw IllegalArgumentException("only 16-bit indices are supported")
    val idx = ShortArray(blobCount("idx"))
    bb.position(blobOffset("idx"))
    bb.asShortBuffer().get(idx)

    val parts = ArrayList<PackPart>()
    val pa = hdr.getJSONArray("parts")
    for (k in 0 until pa.length()) {
        val p = pa.getJSONObject(k)
        val m = p.getJSONObject("mat")
        val tex = ArrayList<String>()
        if (m.has("tex")) {
            val tv = m.get("tex")
            if (tv is org.json.JSONArray) {
                for (j in 0 until tv.length()) tex.add(tv.getString(j))
            } else {
                tex.add(tv.toString())
            }
        }
        parts.add(
            PackPart(
                p.getInt("start"), p.getInt("count"),
                PackMat(
                    tex,
                    if (m.has("rmap")) m.getString("rmap") else null,
                    if (m.has("nmap")) m.getString("nmap") else null,
                    m.f("rough", 0.5f), m.f("spec", 0.5f), m.f("gain", 1f), m.f("gamma", 1f), m.f("nstrength", 1f),
                    m.optBoolean("nearest", false), m.optString("alpha", "") == "cut", m.optBoolean("vcol", false),
                ),
            ),
        )
    }
    val clips = HashMap<String, PackClip>()
    val ca = hdr.optJSONObject("clips")
    if (ca != null) {
        val names = ca.keys()
        while (names.hasNext()) {
            val name = names.next()
            val c = ca.getJSONObject(name)
            clips[name] = PackClip(c.getInt("start"), c.getInt("count"), c.getDouble("fps").toFloat(), c.optBoolean("loop", false))
        }
    }
    return Pack(frames, verts, parts, clips, pos, nrm, uv, col, idx)
}

/** Positions of one frame (or a blend of two) into out (verts * 3 floats). */
fun framePositions(p: Pack, f0: Int, f1: Int, t: Float, out: FloatArray) {
    val n = p.verts * 3
    val a = f0 * n
    val b = f1 * n
    val u = 1f - t
    for (i in 0 until n) out[i] = p.pos[a + i] * u + p.pos[b + i] * t
}

fun frameNormals(p: Pack, f0: Int, f1: Int, t: Float, out: FloatArray) {
    val n = p.verts * 3
    val a = f0 * n
    val b = f1 * n
    val u = 1f - t
    var i = 0
    while (i < n) {
        val x = p.nrm[a + i] * u + p.nrm[b + i] * t
        val y = p.nrm[a + i + 1] * u + p.nrm[b + i + 1] * t
        val z = p.nrm[a + i + 2] * u + p.nrm[b + i + 2] * t
        var l = Math.sqrt((x * x + y * y + z * z).toDouble()).toFloat()
        if (l == 0f) l = 1f
        out[i] = x / l
        out[i + 1] = y / l
        out[i + 2] = z / l
        i += 3
    }
}

/** Frame index and blend for a clip played at `time` seconds. */
class ClipFrame(val f0: Int, val f1: Int, val t: Float)

fun clipFrame(c: PackClip, time: Float): ClipFrame {
    val f = time * c.fps
    val n = c.count
    var i = Math.floor(f.toDouble()).toInt()
    var t = f - i
    if (c.loop) {
        i = ((i % n) + n) % n
        return ClipFrame(c.start + i, c.start + ((i + 1) % n), t)
    }
    if (i >= n - 1) { i = n - 1; t = 0f } else if (i < 0) { i = 0; t = 0f }
    return ClipFrame(c.start + i, c.start + Math.min(n - 1, i + 1), t)
}
