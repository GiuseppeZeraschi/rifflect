package expo.modules.rifflecthandlandmarker

import android.content.Context
import android.graphics.Bitmap
import android.media.Image
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedWriter
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Post-take hand tracking (tasks.md T021; contracts/native-modules.md § 1, extractLandmarksFromVideo).
 *
 * Decodes the recorded video in order with the hardware decoder, samples it at `fps`, scales each
 * sampled frame to at most MAX_SIDE pixels with the video's rotation applied (so landmarks are in
 * the upright image the viewer sees), and runs MediaPipe Hand Landmarker in VIDEO mode. Writes JSON
 * Lines, one per sampled frame: { "t": ms, "hands": [{ "side", "score", "pts": [[x,y,z]×21] }], "b": brightness }.
 */
class RifflectHandLandmarkerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RifflectHandLandmarker")
    Events("onProgress")

    AsyncFunction("extractLandmarksFromVideo") { videoUri: String, outUri: String, fps: Double ->
      val context = appContext.reactContext ?: throw CodedException("E_NO_CONTEXT", "No Android context", null)
      extract(context, toPath(videoUri), toPath(outUri), fps) { fraction ->
        sendEvent("onProgress", mapOf("videoUri" to videoUri, "progress" to fraction))
      }
    }
  }

  private fun toPath(uri: String): String = if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri else uri

  private fun createLandmarker(context: Context): HandLandmarker {
    // Read the model into memory: loading it by asset path needs the file stored uncompressed in the APK.
    val bytes = context.assets.open(MODEL_ASSET).use { it.readBytes() }
    val model = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).put(bytes)
    model.rewind()
    val options = HandLandmarker.HandLandmarkerOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(model).setDelegate(Delegate.CPU).build())
      .setRunningMode(RunningMode.VIDEO)
      .setNumHands(2)
      .setMinHandDetectionConfidence(0.5f)
      .setMinHandPresenceConfidence(0.5f)
      .setMinTrackingConfidence(0.5f)
      .build()
    return HandLandmarker.createFromOptions(context, options)
  }

  private fun extract(context: Context, videoPath: String, outPath: String, fps: Double, onProgress: (Double) -> Unit): Map<String, Any> {
    if (!File(videoPath).exists()) throw CodedException("E_FILE_NOT_FOUND", "No file at $videoPath", null)
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    var landmarker: HandLandmarker? = null
    val tmp = File("$outPath.part")
    try {
      try {
        extractor.setDataSource(videoPath)
      } catch (e: Exception) {
        throw CodedException("E_EXTRACT_FAILED", "Can't open the recording: ${e.message}", e)
      }
      var track = -1
      var format: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val f = extractor.getTrackFormat(i)
        if (f.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true) {
          track = i
          format = f
          break
        }
      }
      if (track < 0 || format == null) throw CodedException("E_NO_VIDEO_TRACK", "The recording has no video", null)
      extractor.selectTrack(track)
      val mime = format.getString(MediaFormat.KEY_MIME)!!
      val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
      val rotation = rotationOf(format, videoPath)

      format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
      codec = MediaCodec.createDecoderByType(mime)
      codec.configure(format, null, null, 0)
      codec.start()
      landmarker = createLandmarker(context)

      val stepUs = (1_000_000.0 / fps).toLong()
      var nextSampleUs = 0L
      var lastTimestampMs = -1L
      var frames = 0
      var framesWithHands = 0
      var lastProgress = -1.0
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false

      tmp.bufferedWriter().use { out ->
        while (!outputDone) {
          if (!inputDone) {
            val inIndex = codec.dequeueInputBuffer(10_000)
            if (inIndex >= 0) {
              val buf = codec.getInputBuffer(inIndex)!!
              val size = extractor.readSampleData(buf, 0)
              if (size < 0) {
                codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputDone = true
              } else {
                codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
                extractor.advance()
              }
            }
          }
          val outIndex = codec.dequeueOutputBuffer(info, 10_000)
          if (outIndex >= 0) {
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
            val pts = info.presentationTimeUs
            if (info.size > 0 && pts >= nextSampleUs) {
              val image = codec.getOutputImage(outIndex)
              if (image != null) {
                val tMs = pts / 1000
                if (tMs > lastTimestampMs) {
                  val (bitmap, brightness) = toBitmap(image, rotation)
                  val result = landmarker.detectForVideo(BitmapImageBuilder(bitmap).build(), tMs)
                  bitmap.recycle()
                  if (result.landmarks().isNotEmpty()) framesWithHands++
                  writeLine(out, tMs, result, brightness)
                  frames++
                  lastTimestampMs = tMs
                }
                image.close()
              }
              // Next sample on the fixed grid after this frame (skip grid points the video didn't reach).
              while (nextSampleUs <= pts) nextSampleUs += stepUs
            }
            codec.releaseOutputBuffer(outIndex, false)
            if (durationUs > 0) {
              val p = min(1.0, pts.toDouble() / durationUs)
              if (p - lastProgress >= 0.02) {
                lastProgress = p
                onProgress(p)
              }
            }
          }
        }
      }
      if (!tmp.renameTo(File(outPath))) {
        File(outPath).delete()
        if (!tmp.renameTo(File(outPath))) throw CodedException("E_EXTRACT_FAILED", "Couldn't write $outPath", null)
      }
      onProgress(1.0)
      return mapOf("path" to Uri.fromFile(File(outPath)).toString(), "frames" to frames, "framesWithHands" to framesWithHands)
    } catch (e: CodedException) {
      throw e
    } catch (e: Exception) {
      throw CodedException("E_EXTRACT_FAILED", "Hand tracking failed: ${e.message}", e)
    } finally {
      tmp.delete()
      try { codec?.stop() } catch (_: Exception) {}
      try { codec?.release() } catch (_: Exception) {}
      try { landmarker?.close() } catch (_: Exception) {}
      extractor.release()
    }
  }

  private fun rotationOf(format: MediaFormat, path: String): Int {
    if (format.containsKey(MediaFormat.KEY_ROTATION)) return format.getInteger(MediaFormat.KEY_ROTATION)
    val retriever = android.media.MediaMetadataRetriever()
    return try {
      retriever.setDataSource(path)
      retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
    } catch (_: Exception) {
      0
    } finally {
      retriever.release()
    }
  }

  /**
   * YUV_420_888 → ARGB_8888, downscaled (nearest sample) to at most MAX_SIDE and rotated by
   * `rotation` degrees clockwise for display. Also returns mean luma / 255 (brightness).
   */
  private fun toBitmap(image: Image, rotation: Int): Pair<Bitmap, Double> {
    val w = image.width
    val h = image.height
    val step = max(1, ceil(max(w, h).toDouble() / MAX_SIDE).toInt())
    val sw = w / step
    val sh = h / step
    val rot = ((rotation % 360) + 360) % 360
    val ow = if (rot == 90 || rot == 270) sh else sw
    val oh = if (rot == 90 || rot == 270) sw else sh
    val yP = image.planes[0]
    val uP = image.planes[1]
    val vP = image.planes[2]
    val yBuf = yP.buffer
    val uBuf = uP.buffer
    val vBuf = vP.buffer
    val pixels = IntArray(ow * oh)
    var lumaSum = 0L
    for (oy in 0 until oh) {
      for (ox in 0 until ow) {
        // Source (scaled) coordinates for this displayed pixel.
        val (gx, gy) = when (rot) {
          90 -> Pair(oy, sh - 1 - ox)
          180 -> Pair(sw - 1 - ox, sh - 1 - oy)
          270 -> Pair(sw - 1 - oy, ox)
          else -> Pair(ox, oy)
        }
        val x = gx * step
        val y = gy * step
        val yy = yBuf.get(y * yP.rowStride + x * yP.pixelStride).toInt() and 0xff
        val cx = x / 2
        val cy = y / 2
        val u = (uBuf.get(cy * uP.rowStride + cx * uP.pixelStride).toInt() and 0xff) - 128
        val v = (vBuf.get(cy * vP.rowStride + cx * vP.pixelStride).toInt() and 0xff) - 128
        lumaSum += yy
        val c = 1.164 * (yy - 16)
        val r = (c + 1.596 * v).roundToInt().coerceIn(0, 255)
        val g = (c - 0.392 * u - 0.813 * v).roundToInt().coerceIn(0, 255)
        val b = (c + 2.017 * u).roundToInt().coerceIn(0, 255)
        pixels[oy * ow + ox] = (0xff shl 24) or (r shl 16) or (g shl 8) or b
      }
    }
    val bitmap = Bitmap.createBitmap(pixels, ow, oh, Bitmap.Config.ARGB_8888)
    return Pair(bitmap, lumaSum.toDouble() / (ow * oh) / 255.0)
  }

  private fun writeLine(out: BufferedWriter, tMs: Long, result: HandLandmarkerResult, brightness: Double) {
    val sb = StringBuilder(4096)
    sb.append("{\"t\":").append(tMs).append(",\"hands\":[")
    val hands = result.landmarks()
    var written = 0
    for (i in hands.indices) {
      val category = result.handedness().getOrNull(i)?.firstOrNull() ?: continue
      if (written++ > 0) sb.append(',')
      sb.append("{\"side\":\"").append(category.categoryName()).append("\",\"score\":").append(round4(category.score().toDouble()))
      sb.append(",\"pts\":[")
      hands[i].forEachIndexed { k, p ->
        if (k > 0) sb.append(',')
        sb.append('[').append(round4(p.x().toDouble())).append(',').append(round4(p.y().toDouble())).append(',').append(round4(p.z().toDouble())).append(']')
      }
      sb.append("]}")
    }
    sb.append("],\"b\":").append(round4(brightness)).append("}\n")
    out.write(sb.toString())
  }

  private fun round4(v: Double): String = String.format(java.util.Locale.ROOT, "%.4f", v)

  companion object {
    private const val MODEL_ASSET = "hand_landmarker.task"
    private const val MAX_SIDE = 640
  }
}
