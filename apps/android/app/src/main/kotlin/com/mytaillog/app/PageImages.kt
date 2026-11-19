package com.mytaillog.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import android.media.ExifInterface
import java.io.ByteArrayOutputStream
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt

/** A page ready for the outbox (05 §7.2): JPEG q85 at most 2000px, its 400px thumbnail and its dHash. */
class PreparedPage(val jpeg: ByteArray, val thumb: ByteArray, val phash: String, val flat: Bitmap)

object PageImages {
    const val PAGE_EDGE = 2000
    const val THUMB_EDGE = 400

    /**
     * Crop and flatten (05 §15.1) with the outline found on the preview: a perspective transform from the
     * quad to an upright rectangle (Android's Matrix.setPolyToPoly, the same maths as warpPerspective).
     * No colour filters: the page must stay faithful.
     */
    fun flatten(src: Bitmap, quad: Quad?): Bitmap {
        quad ?: return src
        val w = src.width.toFloat(); val h = src.height.toFloat()
        val c = quad.corners.map { Pt(it.x * w, it.y * h) }
        val outW = max(hypot(c[1].x - c[0].x, c[1].y - c[0].y), hypot(c[2].x - c[3].x, c[2].y - c[3].y))
        val outH = max(hypot(c[3].x - c[0].x, c[3].y - c[0].y), hypot(c[2].x - c[1].x, c[2].y - c[1].y))
        val k = minOf(1f, PAGE_EDGE / max(outW, outH))
        val ow = (outW * k).roundToInt().coerceAtLeast(1); val oh = (outH * k).roundToInt().coerceAtLeast(1)
        val m = Matrix()
        val ok = m.setPolyToPoly(
            floatArrayOf(c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y), 0,
            floatArrayOf(0f, 0f, ow.toFloat(), 0f, ow.toFloat(), oh.toFloat(), 0f, oh.toFloat()), 0, 4,
        )
        if (!ok) return src
        val out = Bitmap.createBitmap(ow, oh, Bitmap.Config.ARGB_8888)
        Canvas(out).drawBitmap(src, m, Paint(Paint.FILTER_BITMAP_FLAG))
        return out
    }

    fun prepare(page: Bitmap): PreparedPage {
        val big = scaled(page, PAGE_EDGE)
        return PreparedPage(jpeg(big, 85), jpeg(scaled(big, THUMB_EDGE), 80), dHash(gray9x8(big)), big)
    }

    fun rotate(b: Bitmap, degrees: Int): Bitmap =
        if (degrees % 360 == 0) b else Bitmap.createBitmap(b, 0, 0, b.width, b.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)

    /** A photo or a scanner page from a content URI, upright, decoded no larger than needed. */
    fun decode(context: Context, uri: Uri): Bitmap? {
        val cr = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= PAGE_EDGE) sample *= 2
        val b = cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return null
        val orientation = runCatching { cr.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) } }.getOrNull()
        val deg = when (orientation) { ExifInterface.ORIENTATION_ROTATE_90 -> 90; ExifInterface.ORIENTATION_ROTATE_180 -> 180; ExifInterface.ORIENTATION_ROTATE_270 -> 270; else -> 0 }
        return rotate(b, deg)
    }

    private fun scaled(b: Bitmap, edge: Int): Bitmap {
        val k = edge.toFloat() / max(b.width, b.height)
        return if (k >= 1f) b else Bitmap.createScaledBitmap(b, (b.width * k).roundToInt().coerceAtLeast(1), (b.height * k).roundToInt().coerceAtLeast(1), true)
    }

    private fun jpeg(b: Bitmap, quality: Int) = ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()

    private fun gray9x8(b: Bitmap): IntArray {
        val s = Bitmap.createScaledBitmap(b, 9, 8, true)
        return IntArray(72) { i ->
            val p = s.getPixel(i % 9, i / 9)
            ((p shr 16 and 0xff) * 299 + (p shr 8 and 0xff) * 587 + (p and 0xff) * 114) / 1000
        }
    }
}
