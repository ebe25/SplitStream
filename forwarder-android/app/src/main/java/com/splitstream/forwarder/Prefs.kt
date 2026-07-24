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

    var setupDone: Boolean
        get() = plain.getBoolean("setup_done", false)
        set(value) = plain.edit().putBoolean("setup_done", value).apply()

    // any successful delivery ever — drives the setup tour's last step
    fun hasForwarded(): Boolean = plain.getString("log", "[]")!!.contains("sent (")

    var whitelist: List<String>
        get() = plain.getString("whitelist", DEFAULT_WHITELIST)!!
            .split(',').map { it.trim() }.filter { it.isNotEmpty() }
        set(value) = plain.edit().putString("whitelist", value.joinToString(",")).apply()

    fun matchesWhitelist(sender: String): Boolean =
        whitelist.any { sender.contains(it, ignoreCase = true) }

    var packageWhitelist: List<String>
        get() = plain.getString("package_whitelist", DEFAULT_PACKAGE_WHITELIST)!!
            .split(',').map { it.trim() }.filter { it.isNotEmpty() }
        set(value) = plain.edit().putString("package_whitelist", value.joinToString(",")).apply()

    // ponytail: single last-fingerprint slot — only cuts back-to-back reposts of one
    // notification; the server's ±2-min dup window is the real backstop.
    fun shouldForwardNotif(fp: Int): Boolean {
        val now = System.currentTimeMillis()
        if (plain.getInt("last_notif_fp", 0) == fp &&
            now - plain.getLong("last_notif_at", 0) < 60_000
        ) {
            return false
        }
        plain.edit().putInt("last_notif_fp", fp).putLong("last_notif_at", now).apply()
        return true
    }

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
        // GPay, PhonePe, Paytm
        const val DEFAULT_PACKAGE_WHITELIST =
            "com.google.android.apps.nbu.paisa.user,com.phonepe.app,net.one97.paytm"
        private const val LOG_MAX = 50
        private val LOG_LOCK = Any()
        private val TIME_FMT =
            DateTimeFormatter.ofPattern("dd MMM HH:mm:ss").withZone(ZoneId.systemDefault())
    }
}
