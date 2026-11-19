package hu.pocketripplelab.ui

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import hu.pocketripplelab.BuildConfig
import hu.pocketripplelab.app.UpdateInfo
import hu.pocketripplelab.app.UpdateManager
import hu.pocketripplelab.water.BACKGROUNDS
import hu.pocketripplelab.water.GLOWS
import hu.pocketripplelab.water.LIQUIDS
import hu.pocketripplelab.water.Mood
import hu.pocketripplelab.water.Settings
import hu.pocketripplelab.water.applyMood
import hu.pocketripplelab.water.clampSettings
import hu.pocketripplelab.water.lightFromDisk
import hu.pocketripplelab.water.pct
import hu.pocketripplelab.world.Kind
import kotlinx.coroutines.launch
import java.io.File

private class Toy(val kind: Kind, val label: String, val icon: String)

private val TOYS = listOf(
    Toy(Kind.DUCK, "Kacsa", "🦆"),
    Toy(Kind.BOAT, "Hajó", "⛵"),
    Toy(Kind.BALL, "Labda", "🏐"),
    Toy(Kind.RING, "Úszógumi", "🛟"),
    Toy(Kind.KOI, "Bohóchal", "🐠"),
    Toy(Kind.TANG, "Kék hal", "🐟"),
    Toy(Kind.PERCH, "Zöld hal", "🐡"),
    Toy(Kind.SHARK, "Cápa", "🦈"),
)

private val MOOD_ASSETS = mapOf(Mood.POOL to "pool-floor.jpg", Mood.LAKE to "lake-floor.jpg", Mood.SEA to "sea-floor.jpg")

/** The state of the over-the-air update check shown in the settings. */
private sealed interface UpState {
    data object Checking : UpState
    data object None : UpState
    data class Available(val info: UpdateInfo) : UpState
    data class Downloading(val percent: Int) : UpState
    data class Failed(val message: String) : UpState
}

@Composable
private fun LightDisk(lx: Float, ly: Float, onLight: (Float, Float) -> Unit, onPreview: (Boolean) -> Unit) {
    Canvas(
        Modifier
            .size(120.dp)
            .pointerInput(Unit) {
                fun move(o: Offset) {
                    val r = size.width / 2f - 16.dp.toPx()
                    val p = lightFromDisk((o.x - size.width / 2f) / r, (o.y - size.height / 2f) / r)
                    onLight(p.first, p.second)
                }
                detectDragGestures(
                    onDragStart = { o -> onPreview(true); move(o) },
                    onDragEnd = { onPreview(false) },
                    onDragCancel = { onPreview(false) },
                    onDrag = { change, _ -> change.consume(); move(change.position) },
                )
            }
            .pointerInput(Unit) {
                fun move(o: Offset) {
                    val r = size.width / 2f - 16.dp.toPx()
                    val p = lightFromDisk((o.x - size.width / 2f) / r, (o.y - size.height / 2f) / r)
                    onLight(p.first, p.second)
                }
                detectTapGestures(onPress = { o -> onPreview(true); move(o); tryAwaitRelease(); onPreview(false) })
            },
    ) {
        drawCircle(Color(0x26FFFFFF), radius = size.minDimension / 2f)
        drawCircle(Color(0x44FFFFFF), radius = size.minDimension / 2f, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()))
        drawCircle(
            Color(0xFFFFD166),
            radius = 14.dp.toPx(),
            center = Offset(size.width / 2f + lx * size.width * 0.38f, size.height / 2f + ly * size.height * 0.38f),
        )
    }
}

/**
 * The settings: world, light, depth, toys, colours, glow, waves, tilt, kiosk and updates. It slides up as a bottom
 * sheet; while a light or depth control is being dragged the rest fades out so the pool can be seen.
 */
@Composable
fun SettingsSheet(
    ctx: Context,
    s: Settings,
    onChange: (Settings) -> Unit,
    onAdd: (Kind) -> Unit,
    onClear: () -> Unit,
    onLevel: () -> Unit,
    onInstall: (File) -> Unit,
    onExit: () -> Unit,
    onClose: () -> Unit,
) {
    var preview by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    var up by remember { mutableStateOf<UpState>(UpState.Checking) }
    LaunchedEffect(Unit) {
        val info = UpdateManager.check(ctx)
        up = if (info != null) UpState.Available(info) else UpState.None
    }
    fun change(n: Settings) = onChange(clampSettings(n))
    fun fade(control: String?): Modifier = Modifier.alpha(if (preview == null || preview == control) 1f else 0f)

    Box(
        Modifier
            .fillMaxSize()
            .background(if (preview == null) Veil else Color.Transparent)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { if (preview == null) onClose() },
    ) {
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .widthIn(max = 440.dp)
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
                .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
                .background(if (preview == null) Brush.verticalGradient(listOf(SheetTop, SheetBottom)) else Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent)))
                .pointerInput(Unit) { detectTapGestures { } }
                .verticalScroll(rememberScrollState(), enabled = preview == null)
                .padding(start = 22.dp, end = 22.dp, top = 22.dp, bottom = 28.dp),
        ) {
            Row(fade(null).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Beállítások", color = Accent, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Text("Kész", color = Ink, fontSize = 16.sp, modifier = Modifier.clickable { onClose() }.padding(8.dp))
            }

            Column(fade(null)) {
                Section("Világ") {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (m in Mood.entries) {
                            MoodCard(ctx, MOOD_ASSETS[m] ?: "pool-floor.jpg", m.label, s.mood == m, Modifier.weight(1f)) { change(applyMood(s, m)) }
                        }
                    }
                }
            }

            Column(fade("light")) {
                Section("Fény iránya") {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        LightDisk(s.lightX, s.lightY, { x, y -> change(s.copy(lightX = x, lightY = y)) }, { on -> preview = if (on) "light" else null })
                        Text("Húzd a napot oda, ahonnan a fény jön.", color = Muted, fontSize = 13.sp)
                    }
                }
            }

            Column(fade("depth")) {
                Section("Mélység: ${s.depth.pct()}%") {
                    LabeledSlider("Mélység", s.depth, 0f, 1f, 0, { v -> preview = "depth"; change(s.copy(depth = v)) }, { preview = null })
                }
            }

            Column(fade(null)) {
                Section("Tegyél valamit a vízbe") {
                    for (rowItems in TOYS.chunked(4)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (t in rowItems) {
                                Column(
                                    Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(Color(0x14FFFFFF))
                                        .clickable { onAdd(t.kind) }
                                        .padding(vertical = 10.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Text(t.icon, fontSize = 26.sp)
                                    Text(t.label, color = Ink, fontSize = 11.sp, maxLines = 1)
                                }
                            }
                        }
                    }
                    SoftButton("Mindent kiveszek", onClick = onClear)
                }
                Section("Háttér") { Swatches(BACKGROUNDS, s.bg) { change(s.copy(bg = it)) } }
                Section("Folyadék") { Swatches(LIQUIDS, s.liquid) { change(s.copy(liquid = it)) } }
                Section("Ragyogás") {
                    ToggleRow("Ragyogó hullámok", s.glowOn) { change(s.copy(glowOn = it)) }
                    if (s.glowOn) {
                        LabeledSlider("Erősség", s.glowAmount, 0.05f, 1f, 18, { change(s.copy(glowAmount = it)) })
                        Swatches(GLOWS, s.glowColor) { change(s.copy(glowColor = it)) }
                    }
                }
                Section("Hullámok") {
                    LabeledSlider("Sebesség", s.waveSpeed, 1f, 3f, 7, { change(s.copy(waveSpeed = it)) })
                    LabeledSlider("Meddig hullámzik", s.waveLife, 0f, 1f, 19, { change(s.copy(waveLife = it)) })
                }
                Section("Döntés") {
                    ToggleRow("A telefon döntése a nézőpontot változtatja", s.tiltOn) { change(s.copy(tiltOn = it)) }
                    SoftButton("A mostani helyzet legyen a vízszintes", onClick = onLevel)
                }
                Section("Gyerekzár") {
                    ToggleRow("Gyerekzár (képernyő-rögzítés)", s.kiosk) { change(s.copy(kiosk = it)) }
                    Text(
                        "Bekapcsolva az app rögzíti magát, a kezdőképernyő és a visszagomb nem lép ki belőle. A beállításokat az ikon ötszöri megkoppintásával lehet megnyitni.",
                        color = Muted, fontSize = 13.sp,
                    )
                    SoftButton("Kilépés az alkalmazásból", onClick = onExit)
                }
                Section("Frissítés") {
                    Text("Verzió: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", color = Muted, fontSize = 13.sp)
                    when (val st = up) {
                        is UpState.Checking -> Text("Frissítés keresése…", color = Muted, fontSize = 13.sp)
                        is UpState.None -> Text("A legújabb verziót használod.", color = Muted, fontSize = 13.sp)
                        is UpState.Failed -> Text("Nem sikerült: ${st.message}", color = Color(0xFFFFB4A8), fontSize = 13.sp)
                        is UpState.Downloading -> Text("Letöltés… ${st.percent}%", color = Ink, fontSize = 14.sp)
                        is UpState.Available -> SoftButton("Új verzió: ${st.info.versionName} – letöltés és telepítés", primary = true) {
                            scope.launch {
                                up = UpState.Downloading(0)
                                try {
                                    val f = UpdateManager.download(ctx, st.info) { p -> up = UpState.Downloading(p) }
                                    up = UpState.None
                                    onInstall(f)
                                } catch (e: Exception) {
                                    up = UpState.Failed(e.message ?: "hiba")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
