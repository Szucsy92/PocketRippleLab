package hu.pocketripplelab.app

import android.content.Context
import androidx.core.content.pm.PackageInfoCompat
import hu.pocketripplelab.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Egy elérhető frissítés a GitHub legfrissebb kiadásából. */
data class UpdateInfo(val versionCode: Long, val versionName: String, val apkUrl: String, val size: Long)

/**
 * Frissítés a GitHub Releases-ről. A CI a kiadás címkéjét `native-<dátum>-<futásszám>` formában készíti,
 * a futásszám egyben az APK versionCode-ja, így a telepített verzió ezzel hasonlítható össze.
 * A repó neve a buildkor a GITHUB_REPOSITORY változóból kerül a BuildConfig-ba (helyi buildnél üres: nincs ellenőrzés).
 */
object UpdateManager {
    private val TAG_CODE = Regex("-(\\d+)$")

    fun installedCode(ctx: Context): Long = try {
        PackageInfoCompat.getLongVersionCode(ctx.packageManager.getPackageInfo(ctx.packageName, 0))
    } catch (_: Exception) {
        0L
    }

    private fun open(url: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 10_000
        c.readTimeout = 20_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", "pocketripplelab-updater")
        return c
    }

    /** null, ha nincs újabb kiadás, nincs APK a kiadáson, vagy nincs hálózat. */
    suspend fun check(ctx: Context): UpdateInfo? = withContext(Dispatchers.IO) {
        val repo = BuildConfig.UPDATE_REPO
        if (repo.isBlank()) return@withContext null
        try {
            val c = open("https://api.github.com/repos/$repo/releases/latest")
            c.setRequestProperty("Accept", "application/vnd.github+json")
            if (c.responseCode != 200) return@withContext null
            val json = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
            val code = TAG_CODE.find(json.optString("tag_name"))?.groupValues?.get(1)?.toLongOrNull()
                ?: return@withContext null
            if (code <= installedCode(ctx)) return@withContext null
            val assets = json.optJSONArray("assets") ?: return@withContext null
            for (i in 0 until assets.length()) {
                val a = assets.getJSONObject(i)
                if (a.optString("name").endsWith(".apk")) {
                    val name = json.optString("name").ifBlank { json.optString("tag_name") }
                    return@withContext UpdateInfo(code, name, a.getString("browser_download_url"), a.optLong("size"))
                }
            }
            null
        } catch (_: Exception) {
            null
        }
    }

    /** Letölti az APK-t az alkalmazás gyorsítótárába; a haladást 0–100 közötti százalékban jelzi. */
    suspend fun download(ctx: Context, info: UpdateInfo, onProgress: (Int) -> Unit): File = withContext(Dispatchers.IO) {
        val dir = File(ctx.cacheDir, "updates").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
        val out = File(dir, "update.apk")
        val c = open(info.apkUrl)
        if (c.responseCode != 200) throw IOException("HTTP ${c.responseCode}")
        val total = if (c.contentLengthLong > 0) c.contentLengthLong else info.size
        c.inputStream.use { input ->
            out.outputStream().use { o ->
                val buf = ByteArray(64 * 1024)
                var done = 0L
                var last = -1
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    o.write(buf, 0, n)
                    done += n
                    if (total > 0) {
                        val p = (done * 100 / total).toInt().coerceIn(0, 100)
                        if (p != last) { last = p; onProgress(p) }
                    }
                }
            }
        }
        out
    }
}
