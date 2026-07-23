package com.splitstream.forwarder

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.IOException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class ForwardWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val sender = inputData.getString("sender") ?: return Result.failure()
        val body = inputData.getString("body") ?: return Result.failure()
        val receivedAt = inputData.getString("received_at") ?: return Result.failure()

        val prefs = Prefs(applicationContext)
        val token = prefs.token
        if (token.isNullOrEmpty()) {
            prefs.log(sender, "dropped: not paired")
            return Result.failure()
        }

        val json = JSONObject()
            .put("sender", sender)
            .put("body", body)
            .put("received_at", receivedAt)
            .toString()

        val request = Request.Builder()
            .url(prefs.url)
            .header("X-Device-Token", token)
            .post(json.toRequestBody("application/json".toMediaType()))
            .build()

        return try {
            client.newCall(request).execute().use { resp ->
                when {
                    resp.isSuccessful -> {
                        prefs.log(sender, "sent (${resp.code})")
                        Result.success()
                    }
                    resp.code in 500..599 -> {
                        prefs.log(sender, "server error (${resp.code}), will retry")
                        Result.retry()
                    }
                    else -> {
                        prefs.log(sender, "rejected (${resp.code})")
                        Result.failure()
                    }
                }
            }
        } catch (e: IOException) {
            prefs.log(sender, "network error, will retry")
            Result.retry()
        }
    }

    companion object {
        private val client = OkHttpClient()
    }
}
