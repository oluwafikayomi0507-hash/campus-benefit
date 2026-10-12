# Safe Paystack staging setup

This is a separate Render service for testing Paystack. Keep the existing `campus-benefit` service and its live Paystack key unchanged.

## Before deploying

1. In Neon, create a **separate, empty test project/database**. Do not use the production database URL or a branch that contains production user/vendor data.
2. In that test database's SQL editor, run `backend/fresh-database.sql` to create the schema and seed listing packages.
3. Copy the test database connection string from Neon. Keep it private.
4. In Paystack Developers, switch to **Test Mode** and copy the **Test Secret Key**. Do not put it in Git, frontend code, or chat.

## Create the staging service

In Render, create a new Blueprint from the same GitHub repository and set **Blueprint Path** to `render.staging.yaml`. The Blueprint creates the free `campus-benefit-staging` web service. When Render asks for values, enter:

- `DATABASE_URL`: the connection string from the separate empty Neon test database.
- `PAYSTACK_SECRET_KEY`: the Paystack **Test Secret Key** (`sk_test_...`).

Render generates a separate `JWT_SECRET`. The staging service uses `https://campus-benefit-staging.onrender.com` as its callback base URL. Keep the production service's variables unchanged.

## Confirm isolation before checkout

- In Render staging logs, startup should report `Paystack checkout: test`.
- In Render production logs, startup should continue to report `Paystack checkout: live`.
- Confirm the staging `DATABASE_URL` is the test database and production `DATABASE_URL` remains unchanged.
- Use only Paystack's test checkout credentials/cards on the staging site. A successful staging test should activate a listing only in the test database.

The staging service is configured as free, but confirm Render and Neon show the free plan before creating either resource. Do not continue if either dashboard shows a paid plan or charge.
