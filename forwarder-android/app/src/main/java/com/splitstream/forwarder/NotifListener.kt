package com.splitstream.forwarder

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import androidx.work.workDataOf
import java.time.Instant
import java.util.concurrent.TimeUnit

// ADR 0002 capture mode: forward raw payment-app notification title+text, no parsing on-device.
class NotifListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val prefs = Prefs(this)
        if (sbn.packageName !in prefs.packageWhitelist) return

        val flags = sbn.notification.flags
        if (flags and (Notification.FLAG_ONGOING_EVENT or Notification.FLAG_GROUP_SUMMARY) != 0) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = (
            extras.getCharSequence(Notification.EXTRA_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            )?.toString().orEmpty()
        if (title.isBlank() && text.isBlank()) return

        if (!prefs.shouldForwardNotif((sbn.packageName + title + text).hashCode())) return

        val work = OneTimeWorkRequestBuilder<ForwardWorker>()
            .setInputData(
                workDataOf(
                    "sender" to sbn.packageName,
                    "body" to "$title\n$text".trim(),
                    "received_at" to Instant.ofEpochMilli(sbn.postTime).toString(),
                    "source" to "app_notification",
                ),
            )
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS,
            )
            .build()
        WorkManager.getInstance(this).enqueue(work)
    }
}
