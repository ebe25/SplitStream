// Web push helper. Never throws — push is an accelerator, ingestion must not
// fail because a notification did.
import webpush from 'npm:web-push';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  const subject = Deno.env.get('VAPID_SUBJECT');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!subject || !publicKey || !privateKey) return; // push not configured -> no-op

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) {
    console.error('push: failed to load subscriptions', error);
    return;
  }

  const body = JSON.stringify(payload);
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { vapidDetails: { subject, publicKey, privateKey } },
      );
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        // subscription is gone; drop it
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      } else {
        console.error('push: send failed', status ?? err);
      }
    }
  }
}
