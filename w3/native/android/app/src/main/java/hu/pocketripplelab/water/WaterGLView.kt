package hu.pocketripplelab.water

import android.annotation.SuppressLint
import android.content.Context
import android.opengl.GLSurfaceView
import android.view.MotionEvent

/** The pool: a GLSurfaceView that draws the water and the 3D toys, and forwards touches to the scene. */
@SuppressLint("ViewConstructor")
class WaterGLView(ctx: Context) : GLSurfaceView(ctx) {
    val scene: WaterScene

    init {
        setEGLContextClientVersion(3)
        setEGLConfigChooser(8, 8, 8, 8, 16, 0)
        preserveEGLContextOnPause = true
        scene = WaterScene(ctx, this)
        setRenderer(scene)
        renderMode = RENDERMODE_CONTINUOUSLY
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        scene.touch(e)
        return true
    }

    override fun onResume() {
        super.onResume()
        scene.tilt.start()
    }

    override fun onPause() {
        scene.tilt.stop()
        super.onPause()
    }
}
