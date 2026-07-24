package com.splitstream.forwarder

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        result.contents?.let { findViewById<EditText>(R.id.token).setText(it.trim()) }
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

        findViewById<Button>(R.id.setupGuide).setOnClickListener {
            startActivity(Intent(this, SetupActivity::class.java))
        }

        // first run: the guided tour owns permissions and pairing
        if (!prefs.setupDone) startActivity(Intent(this, SetupActivity::class.java))
    }
}
