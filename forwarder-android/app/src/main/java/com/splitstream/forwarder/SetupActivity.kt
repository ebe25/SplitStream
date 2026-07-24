package com.splitstream.forwarder

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

// Guided setup tour: one card per consent/step, state re-checked in onResume so
// the tour always highlights the next incomplete step. Android forbids granting
// any of this silently — the best legal UX is "every tap lands on the exact
// system dialog", which is what each button does.
class SetupActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private var smsDeniedOnce = false

    private val smsPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                smsDeniedOnce = true
                Toast.makeText(
                    this,
                    "Denied. If the dialog never appeared: app settings → ⋮ → Allow restricted settings",
                    Toast.LENGTH_LONG,
                ).show()
            }
            refresh()
        }

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        result.contents?.let {
            prefs.token = it.trim()
            Toast.makeText(this, "Paired ✓", Toast.LENGTH_SHORT).show()
        }
        refresh()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)
        prefs = Prefs(this)

        findViewById<Button>(R.id.stepSmsBtn).setOnClickListener {
            // after a denial with rationale suppressed the dialog won't show again;
            // the only remaining path is the app's settings screen
            if (smsDeniedOnce && !ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.RECEIVE_SMS)) {
                startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")),
                )
            } else {
                smsPermission.launch(Manifest.permission.RECEIVE_SMS)
            }
        }

        findViewById<Button>(R.id.stepBatteryBtn).setOnClickListener {
            startActivity(
                Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:$packageName"),
                ),
            )
        }

        findViewById<Button>(R.id.stepNotifBtn).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        findViewById<Button>(R.id.stepPairBtn).setOnClickListener {
            scanLauncher.launch(
                ScanOptions()
                    .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    .setPrompt("Scan the pairing QR from SplitStream settings")
                    .setBeepEnabled(false),
            )
        }

        findViewById<Button>(R.id.stepVerifyBtn).setOnClickListener {
            startActivity(Intent(this, LogActivity::class.java))
        }

        findViewById<Button>(R.id.setupDone).setOnClickListener {
            prefs.setupDone = true
            finish()
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun smsGranted() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) ==
            PackageManager.PERMISSION_GRANTED

    private fun batteryExempt() =
        (getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName)

    private fun notifAccessGranted() =
        NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)

    private fun refresh() {
        val states = listOf(
            Triple(R.id.stepSmsTitle, "Allow SMS access", smsGranted()),
            Triple(R.id.stepBatteryTitle, "Keep it running in background", batteryExempt()),
            Triple(R.id.stepNotifTitle, "Catch payments before the SMS lands", notifAccessGranted()),
            Triple(R.id.stepPairTitle, "Pair with SplitStream", prefs.token != null),
            Triple(R.id.stepVerifyTitle, "See your first forwarded SMS", prefs.hasForwarded()),
        )
        states.forEachIndexed { i, (id, title, done) ->
            findViewById<TextView>(id).text = "${if (done) "✓" else "${i + 1}."} $title"
        }
        val next = states.indexOfFirst { !it.third }
        findViewById<TextView>(R.id.setupProgress).text =
            if (next == -1) "All set — SplitStream is watching for bank SMS 🎉"
            else "Step ${next + 1} of ${states.size}"

        // buttons stay tappable (re-run is harmless); dim the done ones
        listOf(R.id.stepSmsBtn to states[0], R.id.stepBatteryBtn to states[1], R.id.stepNotifBtn to states[2], R.id.stepPairBtn to states[3])
            .forEach { (btn, st) -> findViewById<Button>(btn).alpha = if (st.third) 0.4f else 1f }

        findViewById<Button>(R.id.setupDone).text = if (next == -1) "Done" else "Skip for now"
    }
}
