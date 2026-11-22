package hu.pocketripplelab.ui

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import hu.pocketripplelab.water.Swatch

val Ink = Color(0xFFE9F6F8)
val Muted = Color(0xFF9FB8BF)
val Accent = Color(0xFF36F1CD)
val SheetTop = Color(0xFF16313A)
val SheetBottom = Color(0xFF0C1620)
val Veil = Color(0xB3081018)
val Line = Color(0x2E9FE8E0)

/** Decodes a picture from the shared src/assets folder (packed into the APK's assets). */
@Composable
fun rememberAsset(ctx: Context, name: String): ImageBitmap? = remember(name) {
    try {
        val o = BitmapFactory.Options()
        o.inSampleSize = 2
        ctx.assets.open(name).use { BitmapFactory.decodeStream(it, null, o) }?.asImageBitmap()
    } catch (e: Exception) {
        null
    }
}

@Composable
fun Section(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
        Text(title.uppercase(), color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
        content()
    }
}

@Composable
fun Swatches(list: List<Swatch>, value: Int, onPick: (Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        list.forEachIndexed { i, s ->
            val clear = s.hex == "transparent"
            val fill = if (clear) Color(0x22FFFFFF) else Color(android.graphics.Color.parseColor(s.hex))
            val ring = if (value == i) Accent else Color(0x55FFFFFF)
            Box(
                Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(fill)
                    .border(if (value == i) 3.dp else 1.dp, ring, CircleShape)
                    .clickable { onPick(i) },
                contentAlignment = Alignment.Center,
            ) {
                if (clear) Text("∅", color = Ink, fontSize = 16.sp)
            }
        }
    }
}

@Composable
fun ToggleRow(label: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onChange(!on) }.padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = Ink, fontSize = 14.sp, modifier = Modifier.weight(1f).padding(end = 12.dp))
        Switch(checked = on, onCheckedChange = { onChange(it) })
    }
}

@Composable
fun LabeledSlider(label: String, value: Float, min: Float, max: Float, steps: Int, onChange: (Float) -> Unit, onDone: () -> Unit = {}) {
    Column {
        Text(label, color = Ink, fontSize = 14.sp)
        Slider(
            value = value,
            onValueChange = onChange,
            valueRange = min..max,
            steps = steps,
            onValueChangeFinished = onDone,
            colors = SliderDefaults.colors(thumbColor = Accent, activeTrackColor = Accent),
        )
    }
}

@Composable
fun SoftButton(text: String, modifier: Modifier = Modifier, primary: Boolean = false, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, if (primary) Accent else Line),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (primary) Color(0xFF0E6B5D) else Color(0x1AFFFFFF),
            contentColor = Ink,
        ),
    ) {
        Text(text, fontSize = 14.sp)
    }
}

@Composable
fun MoodCard(ctx: Context, asset: String, label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val img = rememberAsset(ctx, asset)
    Column(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .border(if (selected) 3.dp else 1.dp, if (selected) Accent else Line, RoundedCornerShape(14.dp))
            .clickable { onClick() },
    ) {
        if (img != null) Image(img, contentDescription = label, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().height(64.dp))
        else Box(Modifier.fillMaxWidth().height(64.dp).background(Color(0x22FFFFFF)))
        Text(label, color = Ink, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(6.dp), maxLines = 1)
    }
}
