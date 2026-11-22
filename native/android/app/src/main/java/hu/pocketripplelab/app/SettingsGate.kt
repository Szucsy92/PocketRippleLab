package hu.pocketripplelab.app

/**
 * Opens the settings only after 5 quick taps on the settings icon (instead of a long press): each tap must come
 * within [gapMs] of the previous one, otherwise the count starts again. Pure logic, so it is easy to test.
 */
class TapGate(private val needed: Int = 5, private val gapMs: Long = 1200L) {
    var count = 0
        private set
    private var last = 0L

    /** Registers a tap at time [nowMs]; returns true when this tap completes the sequence (and resets). */
    fun tap(nowMs: Long): Boolean {
        count = if (count > 0 && nowMs - last <= gapMs) count + 1 else 1
        last = nowMs
        if (count >= needed) {
            count = 0
            return true
        }
        return false
    }

    /** The visible count, or 0 when the last tap is too old to continue the sequence. */
    fun visible(nowMs: Long): Int = if (count > 0 && nowMs - last <= gapMs) count else 0

    fun reset() {
        count = 0
    }
}
