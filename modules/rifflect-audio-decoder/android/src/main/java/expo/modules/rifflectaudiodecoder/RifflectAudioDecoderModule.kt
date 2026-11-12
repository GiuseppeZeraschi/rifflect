package expo.modules.rifflectaudiodecoder

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Decodes a recorded video's audio track to mono Float32 PCM at a target sample rate
 * (contracts/native-modules.md § 2, research.md R4).
 *
 * Output file: little-endian float32 samples, no header. A file left unreadable by a crash or power
 * loss (e.g. an MP4 with no index) is reported as E_DECODE_FAILED / E_NO_AUDIO_TRACK, never a crash.
 */
class RifflectAudioDecoderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RifflectAudioDecoder")

    AsyncFunction("decodeAudioTrack") { videoUri: String, pcmUri: String, sampleRate: Int ->
      decode(toPath(videoUri), toPath(pcmUri), sampleRate)
    }

    /** Returns raw little-endian float32 bytes; the JS wrapper views them as a Float32Array. */
    Function("readPcmChunk") { pcmUri: String, offsetFrames: Double, frames: Int ->
      readChunk(toPath(pcmUri), offsetFrames.toLong(), frames)
    }
  }

  private fun toPath(uri: String): String = if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri else uri

  private fun decode(videoPath: String, pcmPath: String, targetRate: Int): Map<String, Any> {
    if (!File(videoPath).exists()) throw CodedException("E_FILE_NOT_FOUND", "No file at $videoPath", null)

    val extractor = MediaExtractor()
    try {
      try {
        extractor.setDataSource(videoPath)
      } catch (e: Exception) {
        throw CodedException("E_DECODE_FAILED", "Can't open the recording (it may be incomplete): ${e.message}", e)
      }

      var trackIndex = -1
      var format: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val f = extractor.getTrackFormat(i)
        if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
          trackIndex = i
          format = f
          break
        }
      }
      if (trackIndex < 0 || format == null) {
        throw CodedException("E_NO_AUDIO_TRACK", "The recording has no audio track", null)
      }
      extractor.selectTrack(trackIndex)

      val mime = format.getString(MediaFormat.KEY_MIME)!!
      val codec = try {
        MediaCodec.createDecoderByType(mime)
      } catch (e: Exception) {
        throw CodedException("E_DECODE_FAILED", "No decoder for $mime", e)
      }

      val outFile = File(pcmPath)
      outFile.parentFile?.mkdirs()
      val resampler = MonoResampler(targetRate)
      var peak = 0f
      var frames = 0L

      BufferedOutputStream(FileOutputStream(outFile), 1 shl 16).use { out ->
        val writeBuf = ByteBuffer.allocate(4 * 4096).order(ByteOrder.LITTLE_ENDIAN)
        val emit: (Float) -> Unit = { s ->
          if (abs(s) > peak) peak = abs(s)
          writeBuf.putFloat(s)
          frames++
          if (!writeBuf.hasRemaining()) {
            out.write(writeBuf.array(), 0, writeBuf.position())
            writeBuf.clear()
          }
        }

        try {
          codec.configure(format, null, null, 0)
          codec.start()
          val info = MediaCodec.BufferInfo()
          var inputDone = false
          var outputDone = false
          var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          var sourceRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          var floatPcm = false

          while (!outputDone) {
            if (!inputDone) {
              val inIndex = codec.dequeueInputBuffer(10_000)
              if (inIndex >= 0) {
                val inBuf = codec.getInputBuffer(inIndex)!!
                val size = extractor.readSampleData(inBuf, 0)
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
            when {
              outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                val of = codec.outputFormat
                channels = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                sourceRate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                floatPcm = of.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                  of.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
              }
              outIndex >= 0 -> {
                val buf = codec.getOutputBuffer(outIndex)!!.order(ByteOrder.nativeOrder())
                buf.position(info.offset)
                buf.limit(info.offset + info.size)
                resampler.configure(sourceRate)
                if (floatPcm) {
                  val fb = buf.asFloatBuffer()
                  while (fb.remaining() >= channels) {
                    var sum = 0f
                    repeat(channels) { sum += fb.get() }
                    resampler.push(sum / channels, emit)
                  }
                } else {
                  val sb = buf.asShortBuffer()
                  while (sb.remaining() >= channels) {
                    var sum = 0f
                    repeat(channels) { sum += sb.get() / 32768f }
                    resampler.push(sum / channels, emit)
                  }
                }
                codec.releaseOutputBuffer(outIndex, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
              }
            }
          }
        } catch (e: CodedException) {
          throw e
        } catch (e: Exception) {
          // Truncated files can make the codec fail part-way. Keep what decoded if there's enough.
          if (frames < targetRate / 2) {
            throw CodedException("E_DECODE_FAILED", "Couldn't decode the recording's audio: ${e.message}", e)
          }
        } finally {
          try { codec.stop() } catch (_: Exception) {}
          codec.release()
        }
        if (writeBuf.position() > 0) out.write(writeBuf.array(), 0, writeBuf.position())
      }

      if (frames == 0L) {
        outFile.delete()
        throw CodedException("E_DECODE_FAILED", "The recording's audio track is empty", null)
      }
      return mapOf(
        "pcmPath" to "file://$pcmPath",
        "sampleRate" to targetRate,
        "frames" to frames.toDouble(),
        "durationMs" to frames * 1000.0 / targetRate,
        "peak" to peak.toDouble(),
      )
    } finally {
      extractor.release()
    }
  }

  private fun readChunk(pcmPath: String, offsetFrames: Long, frames: Int): ByteArray {
    val file = File(pcmPath)
    if (!file.exists()) throw CodedException("E_FILE_NOT_FOUND", "No PCM file at $pcmPath", null)
    RandomAccessFile(file, "r").use { raf ->
      val totalFrames = raf.length() / 4
      val start = min(max(0L, offsetFrames), totalFrames)
      val count = min(frames.toLong(), totalFrames - start).toInt()
      val bytes = ByteArray(count * 4)
      raf.seek(start * 4)
      raf.readFully(bytes)
      return bytes
    }
  }
}

/**
 * Mono resampler: a 2nd-order low-pass (Butterworth biquad at 0.45 × target rate) against aliasing,
 * then linear interpolation. Adequate for onset/clarity analysis below ~10 kHz.
 */
private class MonoResampler(private val targetRate: Int) {
  private var sourceRate = 0
  private var step = 1.0 // source samples per output sample
  private var pos = 0.0 // position of the next output sample, in source samples, relative to `prev`
  private var prev = 0f
  private var havePrev = false
  // Biquad state
  private var b0 = 1.0; private var b1 = 0.0; private var b2 = 0.0; private var a1 = 0.0; private var a2 = 0.0
  private var x1 = 0.0; private var x2 = 0.0; private var y1 = 0.0; private var y2 = 0.0

  fun configure(rate: Int) {
    if (rate == sourceRate || rate <= 0) return
    sourceRate = rate
    step = rate.toDouble() / targetRate
    if (rate > targetRate) {
      val fc = 0.45 * targetRate
      val w = Math.tan(Math.PI * fc / rate)
      val q = 1 / Math.sqrt(2.0)
      val norm = 1 / (1 + w / q + w * w)
      b0 = w * w * norm; b1 = 2 * b0; b2 = b0
      a1 = 2 * (w * w - 1) * norm
      a2 = (1 - w / q + w * w) * norm
    } else {
      b0 = 1.0; b1 = 0.0; b2 = 0.0; a1 = 0.0; a2 = 0.0
    }
  }

  fun push(sample: Float, emit: (Float) -> Unit) {
    val x0 = sample.toDouble()
    val y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x0; y2 = y1; y1 = y0
    val cur = y0.toFloat()
    if (!havePrev) {
      prev = cur
      havePrev = true
      emit(cur)
      pos = step
      return
    }
    // Emit every output sample that falls between prev (at 0) and cur (at 1).
    while (pos <= 1.0) {
      emit((prev + (cur - prev) * pos).toFloat().coerceIn(-1f, 1f))
      pos += step
    }
    pos -= 1.0
    prev = cur
  }
}

