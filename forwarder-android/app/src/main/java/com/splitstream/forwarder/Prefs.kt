package com.splitstream.forwarder

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import org.json.JSONArray
import org.json.JSONObject

// ponytail: one prefs class for everything — token (encrypted), settings + delivery log (plain). No Room.
class Prefs(context: Context) {

    private val plain = context.getSharedPreferences("forwarder", Context.MODE_PRIVATE)
    private val secure = EncryptedSharedPreferences.create(
        context,
        "forwarder_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var token: String?
        get() = secure.getString("token", null)
        set(value) = secure.edit().putString("token", value).apply()

    var url: String
        get() = plain.getString("url", DEFAULT_URL)!!
        set(value) = plain.edit().putString("url", value).apply()

    var whitelist: List<String>
        get() = plain.getString("whitelist", DEFAULT_WHITELIST)!!
            .split(',').map { it.trim() }.filter { it.isNotEmpty() }
        set(value) = plain.edit().putString("whitelist", value.joinToString(",")).apply()

    fun matchesWhitelist(sender: String): Boolean =
        whitelist.any { sender.contains(it, ignoreCase = true) }

    // --- delivery log: newest-first ring buffer of LOG_MAX entries in one JSON string ---

    fun log(sender: String, status: String) = synchronized(LOG_LOCK) {
        val old = JSONArray(plain.getString("log", "[]"))
        val out = JSONArray().put(
            JSONObject().put("t", System.currentTimeMillis()).put("s", sender).put("st", status),
        )
        for (i in 0 until minOf(old.length(), LOG_MAX - 1)) out.put(old.getJSONObject(i))
        plain.edit().putString("log", out.toString()).apply()
    }

    fun logLines(): List<String> {
        val arr = JSONArray(plain.getString("log", "[]"))
        return (0 until arr.length()).map { i ->
            val e = arr.getJSONObject(i)
            val time = TIME_FMT.format(Instant.ofEpochMilli(e.getLong("t")))
            "$time  ${e.getString("s")}\n${e.getString("st")}"
        }
    }

    companion object {
        const val DEFAULT_URL = "https://gknezlfpalsrqttuxusn.supabase.co/functions/v1/ingest-sms"
        const val DEFAULT_WHITELIST = "HDFC,ICICI,SBI,AXIS,KOTAK,IDFC,PNB,BOB"
        private const val LOG_MAX = 50
        private val LOG_LOCK = Any()
        private val TIME_FMT =
            DateTimeFormatter.ofPattern("dd MMM HH:mm:ss").withZone(ZoneId.systemDefault())
    }
}
