package com.splitstream.forwarder

import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.ListView
import androidx.appcompat.app.AppCompatActivity

class LogActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_log)
        title = "Delivery log"
        val lines = Prefs(this).logLines().ifEmpty { listOf("No deliveries yet") }
        findViewById<ListView>(R.id.list).adapter =
            ArrayAdapter(this, android.R.layout.simple_list_item_1, lines)
    }
}
