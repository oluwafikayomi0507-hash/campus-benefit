# Campus Benefit backend

Express serves the frontend and JSON API from `server.js`. PostgreSQL credentials and the JWT secret stay in the ignored `.env` file.

## API areas

- `/api/auth` — student sign-up, login, and account details.
- `/api/vendor/auth` — vendor application and approved-vendor login.
- `/api/admin` — admin-only vendor application review.
- `/api/vendor/products` and `/api/products` — vendor product management and student browsing.
- `/api/orders` and `/api/vendor/orders` — student checkout, student order history, and vendor order inbox.
- `/api/vendor/listings` — paid deal drafts and the vendor's listing history.
- `/api/deals` — active, paid or permanent listings that have not expired.
- `/api/payments/paystack/webhook` — signed Paystack payment notifications.

## Featured listings

`vendor-featured-listings.sql` creates the payment records and saves the initial packages: ₦1,000 for 7 days and ₦3,000 for 30 days. It has already been applied to the local database. Package prices are read from PostgreSQL, so future price changes do not require code changes.

A listing remains hidden until Paystack reports a successful NGN payment with the exact expected amount and the same test/live mode as the backend key. The backend verifies the transaction and handles signed `charge.success` webhook events idempotently. The Paystack secret key must only be set in `backend/.env`; never put it in a frontend file or share it in chat.

Paystack is not connected until `PAYSTACK_SECRET_KEY` is configured. For real checkout, set `APP_BASE_URL` to the public HTTPS address of the deployed Campus Benefit site and configure Paystack's webhook URL as `https://YOUR-SITE/api/payments/paystack/webhook`. A local `localhost` address cannot receive Paystack webhooks from the internet.

Use `.env.example` as a variable-name reference only. Keep the real `.env` private and uncommitted.

## First hosted deployment

The repository includes a Render Blueprint at the project root. It creates a free Node web service that serves both the frontend and API. Free web services can spin down when idle and are intended for previews, not production traffic. Render's free PostgreSQL databases expire after 30 days, so use a separate persistent hosted PostgreSQL provider for the first deployment rather than creating a Render free database.

For a new, empty hosted database, run `fresh-database.sql` once in that database's SQL editor. This creates the current Campus Benefit tables and initial listing packages. It does not copy accounts, vendor applications, deals, or other records from the local database. Existing local data should only be exported and migrated after deciding what should be moved and where it will be stored.

When creating the Render service, provide `DATABASE_URL` from the hosted PostgreSQL provider. The connection URL must include that provider's TLS options. Render generates `JWT_SECRET` from the Blueprint. Keep the API key, database URL, and all other secrets in the Render environment settings, never in GitHub or frontend files.

After the service is deployed, add `campusbenefit.com.ng` as a custom domain in Render and copy the exact DNS records Render provides into the domain's DNS manager. Keep `APP_BASE_URL` set to `https://campusbenefit.com.ng` after DNS and HTTPS are active.

Password reset email delivery requires a verified sending domain in Resend. Once verified, add `RESEND_API_KEY` and `EMAIL_FROM` to Render's environment settings, using a sender such as `Campus Benefit <passwords@campusbenefit.com.ng>`. Do not use `PASSWORD_RESET_MODE=console` in production; it is only for local development.

New vendor applications send a notification email to the email addresses of users marked as administrators. This uses the same `RESEND_API_KEY` and `EMAIL_FROM` settings. Email delivery is best-effort; applications remain available for review on the Admin page if a notification cannot be sent.
