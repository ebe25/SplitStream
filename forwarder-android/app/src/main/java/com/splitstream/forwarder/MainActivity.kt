package com.splitstream.forwarder

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        result.contents?.let { findViewById<EditText>(R.id.token).setText(it.trim()) }
    }

    private val smsPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!granted) {
                Toast.makeText(this, "SMS permission denied — nothing will be forwarded", Toast.LENGTH_LONG).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)

        val token = findViewById<EditText>(R.id.token)
        val url = findViewById<EditText>(R.id.url)
        val whitelist = findViewById<EditText>(R.id.whitelist)
        token.setText(prefs.token ?: "")
        url.setText(prefs.url)
        whitelist.setText(prefs.whitelist.joinToString(", "))

        findViewById<Button>(R.id.scan).setOnClickListener {
            scanLauncher.launch(
                ScanOptions()
                    .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    .setPrompt("Scan the pairing QR from SplitStream settings")
                    .setBeepEnabled(false),
            )
        }

        findViewById<Button>(R.id.save).setOnClickListener {
            prefs.token = token.text.toString().trim().ifEmpty { null }
            prefs.url = url.text.toString().trim().ifEmpty { Prefs.DEFAULT_URL }
            prefs.whitelist = whitelist.text.toString()
                .split(',', '\n').map { it.trim() }.filter { it.isNotEmpty() }
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show()
        }

        findViewById<Button>(R.id.viewLog).setOnClickListener {
            startActivity(Intent(this, LogActivity::class.java))
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            smsPermission.launch(Manifest.permission.RECEIVE_SMS)
        }
    }
}
