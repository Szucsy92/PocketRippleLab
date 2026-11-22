package hu.pocketripplelab

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings as AndroidSettings
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import hu.pocketripplelab.ui.PoolApp
import hu.pocketripplelab.water.Settings
import hu.pocketripplelab.water.SettingsStore
import hu.pocketripplelab.water.WaterGLView
import java.io.File

/**
 * Single activity: the pool and a Compose overlay. Kiosk: system bars hidden (immersive) and, while the child lock
 * is on, the app pins itself (lock task / screen pinning) so home and back cannot leave it.
 */
class MainActivity : ComponentActivity() {
    private lateinit var glView: WaterGLView
    private var kiosk = true
    private var pendingApk: File? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()
        val initial = SettingsStore.load(this)
        kiosk = initial.kiosk
        glView = WaterGLView(this)
        glView.scene.settings = initial
        setContent { PoolApp(this, glView, initial) }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun hideSystemBars() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }

    private fun pinApp() {
        try { startLockTask() } catch (e: Exception) { e.printStackTrace() }
    }

    private fun unpinApp() {
        try { stopLockTask() } catch (e: Exception) { e.printStackTrace() }
    }

    /** Called by the UI when the settings change (turns the child lock on or off right away). */
    fun onSettingsChanged(s: Settings) {
        if (s.kiosk != kiosk) {
            kiosk = s.kiosk
            if (kiosk) pinApp() else unpinApp()
        }
    }

    /** Leaves the app for good (also releases the pinning). */
    fun exitApp() {
        unpinApp()
        finishAffinity()
    }

    /** Installs a downloaded update. Needs the "unknown sources" permission; the system installer asks for a confirmation. */
    fun installApk(file: File) {
        unpinApp() // screen pinning would block the installer and the permission screen
        if (!packageManager.canRequestPackageInstalls()) {
            pendingApk = file
            try {
                startActivity(Intent(AndroidSettings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            } catch (e: Exception) { e.printStackTrace() }
            return
        }
        try {
            val uri = FileProvider.getUriForFile(this, "$packageName.update", file)
            startActivity(
                Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
            )
        } catch (e: Exception) { e.printStackTrace() }
    }

    override fun onResume() {
        super.onResume()
        glView.onResume()
        val f = pendingApk
        if (f != null) {
            pendingApk = null
            if (packageManager.canRequestPackageInstalls()) { installApk(f); return }
        }
        if (kiosk) pinApp() // back from the settings / the installer: pinned again
    }

    override fun onPause() {
        glView.onPause()
        super.onPause()
    }
}
