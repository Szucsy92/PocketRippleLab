package hu.pocketripplelab.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import hu.pocketripplelab.MainActivity
import hu.pocketripplelab.app.TapGate
import hu.pocketripplelab.water.Settings
import hu.pocketripplelab.water.SettingsStore
import hu.pocketripplelab.water.WaterGLView
import kotlinx.coroutines.delay

/**
 * The only screen: the pool (OpenGL) with a small settings icon in the corner. The settings open after 5 quick taps
 * on that icon (a child is unlikely to hit it five times in a row by accident, and it needs no long press).
 */
@Composable
fun PoolApp(activity: MainActivity, glView: WaterGLView, initial: Settings) {
    val ctx = LocalContext.current
    var settings by remember { mutableStateOf(initial) }
    var open by remember { mutableStateOf(false) }
    var hint by remember { mutableStateOf(true) }
    val gate = remember { TapGate(needed = 5, gapMs = 1200L) }
    var taps by remember { mutableIntStateOf(0) }
    var stamp by remember { mutableLongStateOf(0L) }

    LaunchedEffect(Unit) {
        delay(8000)
        hint = false
    }
    LaunchedEffect(stamp) {
        if (stamp != 0L) {
            delay(1300)
            taps = 0
        }
    }

    fun applySettings(next: Settings) {
        settings = next
        glView.scene.settings = next
        activity.onSettingsChanged(next)
        SettingsStore.save(ctx, next)
    }

    BackHandler(enabled = true) { if (open) open = false }

    MaterialTheme(colorScheme = darkColorScheme()) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(factory = { glView }, modifier = Modifier.fillMaxSize())

            // The settings icon: always there, but faint. Five quick taps open the settings.
            Column(
                Modifier.align(Alignment.TopEnd).padding(top = 28.dp, end = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(Color(0x22000000))
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                            val now = System.currentTimeMillis()
                            if (gate.tap(now)) {
                                taps = 0
                                open = true
                            } else {
                                taps = gate.count
                                stamp = now
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("⚙", color = Color.White, fontSize = 26.sp, modifier = Modifier.alpha(0.5f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.padding(top = 4.dp)) {
                    for (i in 1..5) {
                        Box(
                            Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(if (taps >= i) Color(0xFF36F1CD) else Color.Transparent),
                        )
                    }
                }
            }

            if (hint && !open) {
                Text(
                    "A beállításokhoz koppints ötször a jobb felső ⚙ ikonra.",
                    color = Color.White,
                    fontSize = 14.sp,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 40.dp, start = 24.dp, end = 24.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0x99000000))
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                )
            }

            if (open) {
                SettingsSheet(
                    ctx = ctx,
                    s = settings,
                    onChange = { applySettings(it) },
                    onAdd = { glView.scene.add(it) },
                    onClear = { glView.scene.clearThings() },
                    onLevel = { applySettings(settings.copy(tiltZeroX = glView.scene.tilt.rawX, tiltZeroY = glView.scene.tilt.rawY)) },
                    onInstall = { activity.installApk(it) },
                    onExit = { activity.exitApp() },
                    onClose = { open = false },
                )
            }
        }
    }
}
