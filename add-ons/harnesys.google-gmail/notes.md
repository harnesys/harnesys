Connect a Google account in the connections section.

The poller syncs new mail with the Gmail history API using a `historyId` watermark per account. When Gmail expires the watermark it falls back to a full search with the configured query and resets the watermark. On the first sync of an account only the watermark is stored — existing mail stays silent.

Trigger instances match messages with the Gmail search query and required labels server-side; exclude terms are checked in the add-on.

Add-on settings control the shared mail poller: `poll_sec` sets the interval between checks (30–3600 seconds, default 60), and `poll_disabled` pauses polling without removing triggers. The historyId watermark is kept while paused, so mail is picked up from the last seen point after resuming.
