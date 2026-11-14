Each webhook is a trigger instance bound to a thread and exposed on a public endpoint with a generated token.

> The endpoint is a **secret** — rotate the URL if it leaks.

```sh
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text": "..."}' \
  https://<host>/api/addons/public/<orgId>/harnesys.webhook/r/<token>
```

The fast path reads the top-level `.text` field; use the text path or template fields for other payloads. `GET` fires only when the instance is enabled, with the task text in `?text=...`.

**Signature (HMAC)**

The sender signs the exact raw body and sends the signature header, for example `X-Hub-Signature-256: sha256=<hmac-hex>`, computed with the webhook secret (shown once on rotate).

**Noise control**

- A repeated `Idempotency-Key` header within 24h replays the stored result.
- Identical payloads inside the dedupe window are not re-fired.
- Requests inside the throttle window get `429`.
- A busy thread reports `queued-behind-active-run`; a paused instance reports `paused`.
- Every request is recorded in recent deliveries.
