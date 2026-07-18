# IFD Training Portal

Next.js application for Ithaca Fire Department training request workflows and personnel access.

## Getting Started

Copy the example environment file and set local values:

```bash
cp .env.local.example .env.local
```

Required local variables:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `NEXT_PUBLIC_GSA_MILEAGE_RATE` — example mileage rate only; replace it with the approved current GSA rate before calculating real reimbursements

Never commit `.env.local`. Never add a Supabase service-role key to browser code or to `.env.local.example`.

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase Setup

### 1. Create a Supabase project

1. Sign in to [Supabase](https://supabase.com/).
2. Create a new project for development.
3. Choose a strong database password and save it securely.

### 2. Find the project URL and anon key

In the Supabase dashboard:

1. Open **Project Settings**.
2. Open **API**.
3. Copy **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`.
4. Copy **anon public** key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Use only the anon key in this application. Do not expose the service-role key in the browser or in committed files.

### 3. Configure `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_GSA_MILEAGE_RATE=0.70
```

Restart `npm run dev` after changing environment variables.

### 4. Run the migrations

Apply these files in order using the Supabase SQL editor:

1. `supabase/migrations/20260718140000_create_personnel.sql`
2. `supabase/migrations/20260718150000_personnel_login_allowed.sql`

### 5. Insert test personnel manually

Use `supabase/seed.example.sql` as a development-only guide, or insert your initial MTO test user directly:

```sql
insert into public.personnel (badge_number, email, role, active)
values ('207', 'ifd.mto@gmail.com', 'mto', true);
```

Do not add real personnel information to the repository.

## Magic Link Authentication

The login page uses badge number plus department email verification, followed by a Supabase magic-link email.

### Enable email authentication

In the Supabase dashboard:

1. Open **Authentication**.
2. Open **Providers**.
3. Ensure **Email** is enabled.

### Use the default Supabase magic-link template

For current development and testing, you can use Supabase's default **Magic Link** email template. The application does not require a custom `{{ .Token }}` template.

The login flow works like this:

1. The user enters badge number and department email.
2. The app calls `personnel_login_allowed`.
3. The app stores a short-lived HTTP-only badge cookie.
4. Supabase sends a magic-link email.
5. The user clicks the link and returns to `/auth/callback`.
6. The callback exchanges the auth code, validates badge + email against `public.personnel`, and creates a secure session.

### Configure redirect URLs

In the Supabase dashboard:

1. Open **Authentication**.
2. Open **URL Configuration**.
3. Add your callback URL to **Redirect URLs**, for example:
   - `http://localhost:3000/auth/callback`
   - your production URL when deployed

Keep **Site URL** aligned with the environment you are testing.

### Email delivery notes

Supabase can send magic-link emails without custom SMTP during development.

Custom SMTP may still be needed later for production reliability and branding, but it is not required for current testing.

Optional dashboard settings that help reduce abuse:

- Keep Supabase auth rate limits enabled
- Review **Authentication -> Rate Limits** in the Supabase dashboard

The application also enforces a 60-second resend cooldown in the login UI.

## Authentication and Authorization

- Login uses Supabase secure session cookies through `@supabase/ssr`
- The app does not use `sessionStorage` or `localStorage` for authentication
- Middleware refreshes Supabase sessions and protects authenticated routes
- After the magic link callback, the app confirms the signed-in email and badge number match an active personnel row
- Roles come only from `public.personnel`, never from browser input after login

Protected routes:

- `/dashboard`
- `/requests`
- `/requests/new`
- `/admin/users`

Authorization:

- `firefighter`, `mto`, `deputy_chief`, and `admin` may use normal request routes
- Only `admin` may access `/admin/users`
- The initial test MTO account does not receive admin access automatically

## Personnel Data Model

The `personnel` table stores only:

- badge number
- email
- role
- active status
- created/updated timestamps

It intentionally does not store names, phone numbers, addresses, passwords, medical information, or payroll information.

Do not add real personnel data to shared environments until production authentication and governance are complete.

## Useful Commands

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
